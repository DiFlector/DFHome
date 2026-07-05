import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { apiErrorMessage, endpoints } from "../../api/client";
import type {
  DeviceView,
  RoomSensorWidget,
  SensorChartWidget,
  StationWidget,
  WeatherData,
  WeatherWidget,
  Widget,
  WidgetSize,
} from "../../api/types";
import { GripIcon } from "../icons";
import SensorChartCard from "./SensorChartCard";
import StationCard from "./StationCard";

interface Props {
  devices: DeviceView[];
  /** Kiosk / display-only: no edit toggle, no controls. */
  readOnly?: boolean;
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const SIZE_ORDER: WidgetSize[] = ["s", "m", "l"];
const CHART_SIZE_ORDER: WidgetSize[] = ["m", "l"];
const SIZE_LABEL: Record<WidgetSize, string> = { s: "S", m: "M", l: "L" };
const GRID_COLS = 4;

function widgetSpans(size: WidgetSize): { col: number; row: number } {
  if (size === "s") return { col: 1, row: 1 };
  if (size === "m") return { col: 2, row: 2 };
  return { col: 4, row: 2 };
}

interface GridPlacement {
  widget: Widget;
  index: number;
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
}

interface GridLayout {
  placements: GridPlacement[];
  emptyCells: { row: number; col: number }[];
  rowCount: number;
}

/** Pack widgets into the shared grid (same rules as CSS grid auto-flow: row). */
function computeGridLayout(widgets: Widget[], spareRow: boolean): GridLayout {
  const occupied = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;

  const fits = (r: number, c: number, colSpan: number, rowSpan: number) => {
    if (c + colSpan > GRID_COLS) return false;
    for (let y = 0; y < rowSpan; y++)
      for (let x = 0; x < colSpan; x++)
        if (occupied.has(key(r + y, c + x))) return false;
    return true;
  };

  const mark = (r: number, c: number, colSpan: number, rowSpan: number) => {
    for (let y = 0; y < rowSpan; y++)
      for (let x = 0; x < colSpan; x++)
        occupied.add(key(r + y, c + x));
  };

  const placements: GridPlacement[] = [];
  let maxRow = 0;

  widgets.forEach((widget, index) => {
    const { col: colSpan, row: rowSpan } = widgetSpans(displayWidgetSize(widget));
    let placed = false;
    for (let r = 0; !placed; r++) {
      for (let c = 0; c <= GRID_COLS - colSpan; c++) {
        if (fits(r, c, colSpan, rowSpan)) {
          mark(r, c, colSpan, rowSpan);
          placements.push({ widget, index, row: r, col: c, colSpan, rowSpan });
          maxRow = Math.max(maxRow, r + rowSpan);
          placed = true;
          break;
        }
      }
    }
  });

  const rowCount = Math.max(maxRow + (spareRow ? 1 : 0), 2);
  const emptyCells: { row: number; col: number }[] = [];

  if (spareRow) {
    for (let r = 0; r < rowCount; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (!occupied.has(key(r, c))) emptyCells.push({ row: r, col: c });
  }

  return { placements, emptyCells, rowCount };
}

function gridArea(row: number, col: number, rowSpan: number, colSpan: number): CSSProperties {
  return {
    gridRow: `${row + 1} / span ${rowSpan}`,
    gridColumn: `${col + 1} / span ${colSpan}`,
  };
}

function defaultWidgetSize(kind: Widget["kind"]): WidgetSize {
  return kind === "sensor_chart" || kind === "station" ? "m" : "s";
}

function normalizeSize(size: string | undefined, kind: Widget["kind"]): WidgetSize {
  if (size === "lp") return "l";
  if (kind === "sensor_chart" && size === "s") return "m";
  if (size === "s" || size === "m" || size === "l") return size;
  return defaultWidgetSize(kind);
}

function displayWidgetSize(w: Widget): WidgetSize {
  return normalizeSize(w.size, w.kind);
}

function nextSize(size: WidgetSize | undefined, kind: Widget["kind"]): WidgetSize {
  const order = kind === "sensor_chart" ? CHART_SIZE_ORDER : SIZE_ORDER;
  const current = order.indexOf(normalizeSize(size, kind));
  return order[(current + 1) % order.length];
}

// WMO weather codes: what's falling from the sky right now.
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

// One human line about rain: falling now → expected at HH:mm → none in 24 h.
function rainSummary(data: WeatherData): string {
  const code = data.weather_code;
  const precipitating = (data.precipitation ?? 0) > 0 || (code !== null && (RAIN_CODES.has(code) || SNOW_CODES.has(code)));
  if (precipitating) {
    return code !== null && SNOW_CODES.has(code) ? "Сейчас идёт снег" : "Сейчас идёт дождь";
  }
  const upcoming = (data.hourly ?? []).find(
    (h) => (h.precipitation_probability ?? 0) >= 50 || (h.precipitation ?? 0) >= 0.1,
  );
  if (upcoming) {
    const at = upcoming.time.slice(11, 16);
    const kind = upcoming.weather_code !== null && SNOW_CODES.has(upcoming.weather_code) ? "Снег" : "Дождь";
    const prob = upcoming.precipitation_probability;
    return `${kind} ожидается к ${at}${prob ? ` · ${prob}%` : ""}`;
  }
  return "Без осадков в ближайшие 24 ч";
}

function WeatherWidgetCard({ widget, onRemove }: { widget: WeatherWidget; onRemove: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["weather", widget.query],
    queryFn: () => endpoints.getWeather(widget.query),
    refetchInterval: 15 * 60 * 1000,
    // The backend already caches and retries; don't pile more requests on a
    // struggling upstream (each failure used to trigger 3 client retries).
    retry: 1,
  });

  return (
    <div className="widget-card">
      <div className="widget-card-header">
        <span>{widget.query}</span>
        <button type="button" className="remove-btn" onClick={onRemove} aria-label="Удалить виджет">
          ×
        </button>
      </div>
      {isLoading && <span className="loading">…</span>}
      {isError && <span className="widget-error">{apiErrorMessage(error)}</span>}
      {data && (
        <div className="widget-body">
          <div className="widget-value">{Math.round(data.temperature ?? 0)}°C</div>
          <div className="widget-meta">
            Влажность {data.humidity}% · Ветер {data.wind_speed} км/ч
          </div>
          <div className="widget-meta">{rainSummary(data)}</div>
        </div>
      )}
    </div>
  );
}

function RoomSensorWidgetCard({
  widget,
  devices,
  onRemove,
}: {
  widget: RoomSensorWidget;
  devices: DeviceView[];
  onRemove: () => void;
}) {
  const device = devices.find((d) => d.id === widget.device_id);
  const prop = device?.properties.find((p) => p.instance === widget.property_instance);

  return (
    <div className="widget-card">
      <div className="widget-card-header">
        <span>{widget.device_name}</span>
        <button type="button" className="remove-btn" onClick={onRemove} aria-label="Удалить виджет">
          ×
        </button>
      </div>
      <div className="widget-body">
        <div className="widget-value">{prop ? `${prop.value}${prop.unit ?? ""}` : "—"}</div>
        <div className="widget-meta">{widget.label}</div>
      </div>
    </div>
  );
}

export default function WidgetsPanel({ devices, readOnly = false }: Props) {
  const queryClient = useQueryClient();
  const { data: widgets = [] } = useQuery({ queryKey: ["widgets"], queryFn: endpoints.getWidgets });

  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<"weather" | "room_sensor" | "sensor_chart" | "station" | null>(null);
  const [cityInput, setCityInput] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedInstance, setSelectedInstance] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");

  // Loaded lazily — only when the user opens the "add station" form.
  const stationsQuery = useQuery({
    queryKey: ["stations"],
    queryFn: endpoints.getStations,
    enabled: adding === "station",
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: (next: Widget[]) => endpoints.saveWidgets(next),
    onSuccess: (saved) => queryClient.setQueryData(["widgets"], saved),
  });

  const addWeatherWidget = () => {
    if (!cityInput.trim()) return;
    const widget: WeatherWidget = { id: genId(), kind: "weather", query: cityInput.trim(), size: "s" };
    saveMutation.mutate([...widgets, widget]);
    setCityInput("");
    setAdding(null);
  };

  const devicesWithSensors = devices.filter((d) => d.properties.some((p) => typeof p.value === "number"));
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  const addRoomSensorWidget = () => {
    const prop = selectedDevice?.properties.find((p) => p.instance === selectedInstance);
    if (!selectedDevice || !prop) return;
    const widget: RoomSensorWidget = {
      id: genId(),
      kind: "room_sensor",
      device_id: selectedDevice.id,
      device_name: selectedDevice.name,
      property_instance: prop.instance,
      label: prop.label,
      size: "s",
    };
    saveMutation.mutate([...widgets, widget]);
    setSelectedDeviceId("");
    setSelectedInstance("");
    setAdding(null);
  };

  const addSensorChartWidget = () => {
    const prop = selectedDevice?.properties.find((p) => p.instance === selectedInstance);
    if (!selectedDevice || !prop) return;
    const widget: SensorChartWidget = {
      id: genId(),
      kind: "sensor_chart",
      device_id: selectedDevice.id,
      device_name: selectedDevice.name,
      property_instance: prop.instance,
      label: prop.label,
      unit: prop.unit,
      size: "m",
    };
    saveMutation.mutate([...widgets, widget]);
    setSelectedDeviceId("");
    setSelectedInstance("");
    setAdding(null);
  };

  const addStationWidget = () => {
    const station = (stationsQuery.data ?? []).find((s) => s.id === selectedStationId);
    if (!station) return;
    const widget: StationWidget = {
      id: genId(),
      kind: "station",
      device_id: station.id,
      device_name: station.name,
      size: "m",
    };
    saveMutation.mutate([...widgets, widget]);
    setSelectedStationId("");
    setAdding(null);
  };

  const removeWidget = (id: string) => saveMutation.mutate(widgets.filter((w) => w.id !== id));

  const cycleWidgetSize = (id: string) =>
    saveMutation.mutate(
      widgets.map((w) =>
        w.id === id ? { ...w, size: nextSize(w.size, w.kind) } : w,
      ),
    );

  // -- Drag & drop reordering ----------------------------------------------
  // The drag is "armed" by pressing the grip handle so text/controls inside
  // cards keep working; the dragged card is inserted at the drop target.
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const insertWidgetAt = (srcId: string, insertIdx: number) => {
    const next = [...widgets];
    const from = next.findIndex((w) => w.id === srcId);
    if (from < 0) return;
    let to = Math.max(0, Math.min(insertIdx, next.length));
    if (from < to) to -= 1;
    if (from === to) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveMutation.mutate(next);
  };

  /** Pick insert index from pointer — works for gaps between tiles, not only on a widget. */
  const findInsertIndex = (clientX: number, clientY: number, srcId: string) => {
    const grid = gridRef.current;
    if (!grid) return widgets.length;

    let insertIdx = widgets.length;

    for (const { widget, index } of layout.placements) {
      if (widget.id === srcId) continue;
      const slot = grid.querySelector<HTMLElement>(`[data-widget-id="${widget.id}"]`);
      if (!slot) continue;
      const r = slot.getBoundingClientRect();

      if (clientY < r.top) return index;
      if (clientY > r.bottom) {
        insertIdx = index + 1;
        continue;
      }
      insertIdx = clientX < r.left + r.width / 2 ? index : index + 1;
    }
    return insertIdx;
  };

  const dropAt = (srcId: string, clientX: number, clientY: number) => {
    insertWidgetAt(srcId, findInsertIndex(clientX, clientY, srcId));
  };

  const resetDrag = () => {
    setDragArmed(null);
    setDragId(null);
    setDragOverId(null);
  };

  const toggleEditing = () => {
    setEditing((prev) => {
      if (prev) {
        setAdding(null);
        resetDrag();
      }
      return !prev;
    });
  };

  const isEditing = editing && !readOnly;
  const layout = useMemo(
    () => computeGridLayout(widgets, isEditing),
    [widgets, isEditing],
  );

  return (
    <aside className={`widgets-panel${isEditing ? " is-editing" : ""}`}>
      <div className="widgets-panel-header">
        <h3>Виджеты</h3>
        {!readOnly && (
          <button type="button" className={isEditing ? "primary" : "secondary"} onClick={toggleEditing}>
            {isEditing ? "Готово" : "Изменить"}
          </button>
        )}
      </div>

      <div
        className="widgets-grid"
        ref={gridRef}
        style={{ "--grid-rows": layout.rowCount } as CSSProperties}
        onDragOver={(e) => {
          if (dragId) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!dragId || (e.target as HTMLElement).closest(".widget-slot")) return;
          e.preventDefault();
          dropAt(dragId, e.clientX, e.clientY);
          resetDrag();
        }}
      >
        {isEditing &&
          layout.emptyCells.map(({ row, col }) => (
            <div
              key={`empty-${row}-${col}`}
              className="widgets-grid-cell"
              style={gridArea(row, col, 1, 1)}
            />
          ))}

      {layout.placements.map(({ widget: w, row, col, colSpan, rowSpan }) => {
        const size = displayWidgetSize(w);
        return (
        <div
          key={w.id}
          data-widget-id={w.id}
          className={[
            "widget-slot",
            `size-${size}`,
            dragId === w.id ? "dragging" : "",
            dragOverId === w.id && dragId !== w.id ? "drag-over" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={gridArea(row, col, rowSpan, colSpan)}
          draggable={isEditing && dragArmed === w.id}
          onDragStart={(e) => {
            // setData is required by Firefox to start a drag at all.
            e.dataTransfer.setData("text/plain", w.id);
            e.dataTransfer.effectAllowed = "move";
            setDragId(w.id);
          }}
          onDragEnd={resetDrag}
          onDragOver={(e) => {
            if (dragId && dragId !== w.id) {
              e.preventDefault();
              setDragOverId(w.id);
            }
          }}
          onDragLeave={() => setDragOverId((cur) => (cur === w.id ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragId && dragId !== w.id) dropAt(dragId, e.clientX, e.clientY);
            resetDrag();
          }}
        >
          {w.kind === "weather" ? (
            <WeatherWidgetCard widget={w} onRemove={() => removeWidget(w.id)} />
          ) : w.kind === "sensor_chart" ? (
            <SensorChartCard widget={w} onRemove={() => removeWidget(w.id)} />
          ) : w.kind === "station" ? (
            <StationCard widget={w} onRemove={() => removeWidget(w.id)} />
          ) : (
            <RoomSensorWidgetCard widget={w} devices={devices} onRemove={() => removeWidget(w.id)} />
          )}
          {isEditing && (
          <div className="widget-slot-tools">
            <button
              type="button"
              className="widget-tool"
              title={
                w.kind === "sensor_chart"
                  ? "Размер: M — 2×2, L — 4×2"
                  : "Размер: S — компактный, M — 2×2, L — 4×2"
              }
              onClick={() => cycleWidgetSize(w.id)}
            >
              {SIZE_LABEL[size]}
            </button>
            <span
              className="widget-tool widget-drag-handle"
              title="Перетащить, чтобы поменять порядок"
              onMouseDown={() => setDragArmed(w.id)}
              onMouseUp={() => setDragArmed(null)}
            >
              <GripIcon width={12} height={12} />
            </span>
          </div>
          )}
        </div>
        );
      })}
      </div>

      {isEditing && adding === null && (
        <div className="widget-add-actions">
          <button type="button" className="secondary" onClick={() => setAdding("weather")}>
            + Погода
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setAdding("room_sensor")}
            disabled={devicesWithSensors.length === 0}
          >
            + Датчик комнаты
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setAdding("sensor_chart")}
            disabled={devicesWithSensors.length === 0}
          >
            + График датчика
          </button>
          <button type="button" className="secondary" onClick={() => setAdding("station")}>
            + Яндекс Станция
          </button>
        </div>
      )}

      {isEditing && adding === "station" && (
        <div className="widget-add-form">
          {stationsQuery.isLoading && <span className="loading">Ищем станции…</span>}
          {stationsQuery.isError && (
            <span className="widget-error">{apiErrorMessage(stationsQuery.error)}</span>
          )}
          {stationsQuery.data && stationsQuery.data.length === 0 && (
            <span className="widget-meta">В аккаунте нет станций</span>
          )}
          {stationsQuery.data && stationsQuery.data.length > 0 && (
            <select value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)}>
              <option value="">— станция —</option>
              {stationsQuery.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {!s.online ? " (не в сети)" : ""}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary" onClick={addStationWidget} disabled={!selectedStationId}>
              Добавить
            </button>
            <button type="button" className="secondary" onClick={() => setAdding(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {isEditing && adding === "weather" && (
        <div className="widget-add-form">
          <input
            type="text"
            placeholder="Город, например Москва"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary" onClick={addWeatherWidget}>
              Добавить
            </button>
            <button type="button" className="secondary" onClick={() => setAdding(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {isEditing && adding === "sensor_chart" && (
        <div className="widget-add-form">
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              setSelectedInstance("");
            }}
          >
            <option value="">— датчик —</option>
            {devicesWithSensors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {selectedDevice && (
            <select value={selectedInstance} onChange={(e) => setSelectedInstance(e.target.value)}>
              <option value="">— показатель —</option>
              {selectedDevice.properties
                .filter((p) => typeof p.value === "number")
                .map((p) => (
                  <option key={p.instance} value={p.instance}>
                    {p.label}
                  </option>
                ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary" onClick={addSensorChartWidget} disabled={!selectedInstance}>
              Добавить
            </button>
            <button type="button" className="secondary" onClick={() => setAdding(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {isEditing && adding === "room_sensor" && (
        <div className="widget-add-form">
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              setSelectedInstance("");
            }}
          >
            <option value="">— устройство —</option>
            {devicesWithSensors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {selectedDevice && (
            <select value={selectedInstance} onChange={(e) => setSelectedInstance(e.target.value)}>
              <option value="">— показатель —</option>
              {selectedDevice.properties
                .filter((p) => typeof p.value === "number")
                .map((p) => (
                  <option key={p.instance} value={p.instance}>
                    {p.label}
                  </option>
                ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="primary" onClick={addRoomSensorWidget} disabled={!selectedInstance}>
              Добавить
            </button>
            <button type="button" className="secondary" onClick={() => setAdding(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
