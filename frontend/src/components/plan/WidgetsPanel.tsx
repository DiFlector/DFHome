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

/** Pack widgets without stored coords (migration only). */
function autoAssignPositions(widgets: Widget[]): Widget[] {
  const result = widgets.map((w) => ({ ...w }));
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

  for (const w of result) {
    const span = widgetSpans(displayWidgetSize(w));
    if (w.grid_row !== undefined && w.grid_col !== undefined) {
      mark(w.grid_row, w.grid_col, span.col, span.row);
      continue;
    }
    let placed = false;
    for (let r = 0; !placed; r++) {
      for (let c = 0; c <= GRID_COLS - span.col; c++) {
        if (fits(r, c, span.col, span.row)) {
          w.grid_row = r;
          w.grid_col = c;
          mark(r, c, span.col, span.row);
          placed = true;
          break;
        }
      }
    }
  }
  return result;
}

function buildOccupied(widgets: Widget[], ignoreId?: string): Set<string> {
  const occupied = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;
  for (const w of widgets) {
    if (w.id === ignoreId || w.grid_row === undefined || w.grid_col === undefined) continue;
    const span = widgetSpans(displayWidgetSize(w));
    for (let y = 0; y < span.row; y++)
      for (let x = 0; x < span.col; x++)
        occupied.add(key(w.grid_row + y, w.grid_col + x));
  }
  return occupied;
}

function canPlaceWidget(
  widgets: Widget[],
  widgetId: string,
  row: number,
  col: number,
  size?: WidgetSize,
): boolean {
  const w = widgets.find((x) => x.id === widgetId);
  if (!w) return false;
  const span = widgetSpans(size ?? displayWidgetSize(w));
  if (col + span.col > GRID_COLS || row < 0 || col < 0) return false;
  const occupied = buildOccupied(widgets, widgetId);
  const key = (r: number, c: number) => `${r},${c}`;
  for (let y = 0; y < span.row; y++)
    for (let x = 0; x < span.col; x++)
      if (occupied.has(key(row + y, col + x))) return false;
  return true;
}

/** Top-left anchor for a multi-cell widget when hovering a grid cell. */
function resolveDropAnchor(
  widgets: Widget[],
  widgetId: string,
  hoverRow: number,
  hoverCol: number,
): { row: number; col: number; valid: boolean } {
  const w = widgets.find((x) => x.id === widgetId);
  if (!w) return { row: hoverRow, col: hoverCol, valid: false };
  const span = widgetSpans(displayWidgetSize(w));

  const candidates: { row: number; col: number }[] = [];
  for (let dr = 0; dr < span.row; dr++) {
    for (let dc = 0; dc < span.col; dc++) {
      const row = hoverRow - dr;
      const col = hoverCol - dc;
      if (row >= 0 && col >= 0 && col + span.col <= GRID_COLS) candidates.push({ row, col });
    }
  }
  candidates.sort((a, b) => a.row - b.row || a.col - b.col);

  for (const c of candidates) {
    if (canPlaceWidget(widgets, widgetId, c.row, c.col)) return { ...c, valid: true };
  }
  const fallback = candidates[0] ?? { row: hoverRow, col: hoverCol };
  return { ...fallback, valid: false };
}

function findFirstFreeCell(widgets: Widget[], size: WidgetSize): { row: number; col: number } {
  const span = widgetSpans(size);
  const occupied = buildOccupied(widgets);
  const key = (r: number, c: number) => `${r},${c}`;
  for (let r = 0; r < 64; r++) {
    for (let c = 0; c <= GRID_COLS - span.col; c++) {
      let ok = true;
      for (let y = 0; y < span.row && ok; y++)
        for (let x = 0; x < span.col; x++)
          if (occupied.has(key(r + y, c + x))) ok = false;
      if (ok) return { row: r, col: c };
    }
  }
  return { row: 0, col: 0 };
}

/** Freeze every widget's on-screen grid position before persisting. */
function persistAllPositions(widgets: Widget[], layout: GridLayout): Widget[] {
  return widgets.map((w) => {
    if (w.grid_row !== undefined && w.grid_col !== undefined) return w;
    const p = layout.placements.find((pl) => pl.widget.id === w.id);
    return p ? { ...w, grid_row: p.row, grid_col: p.col } : w;
  });
}

/** Layout from stored coordinates — widgets stay where placed (holes allowed). */
function computeGridLayout(widgets: Widget[], spareRow: boolean): GridLayout {
  const needsInitialPack =
    widgets.length > 0 && widgets.every((w) => w.grid_row === undefined || w.grid_col === undefined);
  const placed = needsInitialPack ? autoAssignPositions(widgets) : widgets;

  const occupied = new Set<string>();
  const key = (r: number, c: number) => `${r},${c}`;

  const placements: GridPlacement[] = [];
  let maxRow = 0;

  placed.forEach((widget, index) => {
    const { col: colSpan, row: rowSpan } = widgetSpans(displayWidgetSize(widget));
    const row = widget.grid_row ?? 0;
    const col = widget.grid_col ?? 0;
    placements.push({ widget, index, row, col, colSpan, rowSpan });
    maxRow = Math.max(maxRow, row + rowSpan);
    for (let y = 0; y < rowSpan; y++)
      for (let x = 0; x < colSpan; x++)
        occupied.add(key(row + y, col + x));
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

/** Map pointer to the grid cell under the cursor (uses DOM for pixel-perfect alignment). */
function pointerToCell(grid: HTMLElement, clientX: number, clientY: number): { row: number; col: number } | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !grid.contains(el)) return null;

  const cell = el.closest<HTMLElement>(".widgets-grid-cell[data-grid-row]");
  if (cell?.dataset.gridRow !== undefined && cell.dataset.gridCol !== undefined) {
    return { row: +cell.dataset.gridRow, col: +cell.dataset.gridCol };
  }

  const slot = el.closest<HTMLElement>(".widget-slot[data-grid-row]");
  if (slot?.dataset.gridRow !== undefined && slot.dataset.gridCol !== undefined) {
    const baseRow = +slot.dataset.gridRow;
    const baseCol = +slot.dataset.gridCol;
    const colSpan = +(slot.dataset.colSpan ?? 1);
    const rowSpan = +(slot.dataset.rowSpan ?? 1);
    const rect = slot.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(grid).gap) || 12;
    const cellW = colSpan > 1 ? (rect.width - gap * (colSpan - 1)) / colSpan : rect.width;
    const cellH = rowSpan > 1 ? (rect.height - gap * (rowSpan - 1)) / rowSpan : rect.height;
    const dc = Math.min(colSpan - 1, Math.max(0, Math.floor((clientX - rect.left) / (cellW + gap))));
    const dr = Math.min(rowSpan - 1, Math.max(0, Math.floor((clientY - rect.top) / (cellH + gap))));
    return { row: baseRow + dr, col: baseCol + dc };
  }

  return null;
}

interface DropTarget {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  valid: boolean;
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

  const isEditing = editing && !readOnly;
  const layout = useMemo(() => computeGridLayout(widgets, isEditing), [widgets, isEditing]);

  const saveWidgets = (next: Widget[]) => {
    saveMutation.mutate(persistAllPositions(next, layout));
  };

  const addWeatherWidget = () => {
    if (!cityInput.trim()) return;
    const size: WidgetSize = "s";
    const { row, col } = findFirstFreeCell(widgets, size);
    const widget: WeatherWidget = {
      id: genId(),
      kind: "weather",
      query: cityInput.trim(),
      size,
      grid_row: row,
      grid_col: col,
    };
    saveWidgets([...widgets, widget]);
    setCityInput("");
    setAdding(null);
  };

  const devicesWithSensors = devices.filter((d) => d.properties.some((p) => typeof p.value === "number"));
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  const addRoomSensorWidget = () => {
    const prop = selectedDevice?.properties.find((p) => p.instance === selectedInstance);
    if (!selectedDevice || !prop) return;
    const size: WidgetSize = "s";
    const { row, col } = findFirstFreeCell(widgets, size);
    const widget: RoomSensorWidget = {
      id: genId(),
      kind: "room_sensor",
      device_id: selectedDevice.id,
      device_name: selectedDevice.name,
      property_instance: prop.instance,
      label: prop.label,
      size,
      grid_row: row,
      grid_col: col,
    };
    saveWidgets([...widgets, widget]);
    setSelectedDeviceId("");
    setSelectedInstance("");
    setAdding(null);
  };

  const addSensorChartWidget = () => {
    const prop = selectedDevice?.properties.find((p) => p.instance === selectedInstance);
    if (!selectedDevice || !prop) return;
    const size: WidgetSize = "m";
    const { row, col } = findFirstFreeCell(widgets, size);
    const widget: SensorChartWidget = {
      id: genId(),
      kind: "sensor_chart",
      device_id: selectedDevice.id,
      device_name: selectedDevice.name,
      property_instance: prop.instance,
      label: prop.label,
      unit: prop.unit,
      size,
      grid_row: row,
      grid_col: col,
    };
    saveWidgets([...widgets, widget]);
    setSelectedDeviceId("");
    setSelectedInstance("");
    setAdding(null);
  };

  const addStationWidget = () => {
    const station = (stationsQuery.data ?? []).find((s) => s.id === selectedStationId);
    if (!station) return;
    const size: WidgetSize = "m";
    const { row, col } = findFirstFreeCell(widgets, size);
    const widget: StationWidget = {
      id: genId(),
      kind: "station",
      device_id: station.id,
      device_name: station.name,
      size,
      grid_row: row,
      grid_col: col,
    };
    saveWidgets([...widgets, widget]);
    setSelectedStationId("");
    setAdding(null);
  };

  const removeWidget = (id: string) => saveWidgets(widgets.filter((w) => w.id !== id));

  const cycleWidgetSize = (id: string) => {
    const w = widgets.find((x) => x.id === id);
    if (!w || w.grid_row === undefined || w.grid_col === undefined) return;
    const newSize = nextSize(w.size, w.kind);
    if (!canPlaceWidget(widgets, id, w.grid_row, w.grid_col, newSize)) return;
    saveWidgets(widgets.map((x) => (x.id === id ? { ...x, size: newSize } : x)));
  };

  // -- Drag & drop reordering ----------------------------------------------
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const setDropPreview = (target: DropTarget | null) => {
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  const moveWidgetToCell = (srcId: string, row: number, col: number) => {
    const w = widgets.find((x) => x.id === srcId);
    if (!w) return;
    if (w.grid_row === row && w.grid_col === col) return;
    if (!canPlaceWidget(widgets, srcId, row, col)) return;
    saveWidgets(widgets.map((x) => (x.id === srcId ? { ...x, grid_row: row, grid_col: col } : x)));
  };

  const updateDropTarget = (row: number, col: number) => {
    if (!dragId) return;
    const src = widgets.find((w) => w.id === dragId);
    if (!src) return;
    const span = widgetSpans(displayWidgetSize(src));
    const anchor = resolveDropAnchor(widgets, dragId, row, col);
    setDropPreview({ row: anchor.row, col: anchor.col, rowSpan: span.row, colSpan: span.col, valid: anchor.valid });
  };

  const updateDropTargetFromPointer = (clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid || !dragId) return;
    const cell = pointerToCell(grid, clientX, clientY);
    if (cell) updateDropTarget(cell.row, cell.col);
    else setDropPreview(null);
  };

  const dropAtPreview = (srcId: string) => {
    const target = dropTargetRef.current;
    if (target?.valid) dropAtCell(srcId, target.row, target.col);
  };

  const dropAtCell = (srcId: string, row: number, col: number) => {
    moveWidgetToCell(srcId, row, col);
  };

  const resetDrag = () => {
    setDragArmed(null);
    setDragId(null);
    setDragOverId(null);
    setDropPreview(null);
  };

  const toggleEditing = () => {
    setEditing((prev) => {
      if (prev) {
        setAdding(null);
        resetDrag();
        if (!widgets.every((w) => w.grid_row !== undefined && w.grid_col !== undefined)) {
          saveWidgets(widgets);
        }
      }
      return !prev;
    });
  };

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
          if (!dragId) return;
          e.preventDefault();
          updateDropTargetFromPointer(e.clientX, e.clientY);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropPreview(null);
        }}
        onDrop={(e) => {
          if (!dragId) return;
          e.preventDefault();
          dropAtPreview(dragId);
          resetDrag();
        }}
      >
        {isEditing &&
          Array.from({ length: layout.rowCount * GRID_COLS }, (_, i) => {
            const row = Math.floor(i / GRID_COLS);
            const col = i % GRID_COLS;
            const underWidget = layout.placements.some(
              (p) =>
                p.widget.id !== dragId &&
                row >= p.row &&
                row < p.row + p.rowSpan &&
                col >= p.col &&
                col < p.col + p.colSpan,
            );
            return (
              <div
                key={`cell-${row}-${col}`}
                className={`widgets-grid-cell${underWidget ? " is-under-widget" : ""}`}
                style={gridArea(row, col, 1, 1)}
                data-grid-row={row}
                data-grid-col={col}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  updateDropTarget(row, col);
                }}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  dropAtPreview(dragId);
                  resetDrag();
                }}
              />
            );
          })}

        {dropTarget && (
          <div
            className={`widgets-grid-drop-preview${dropTarget.valid ? "" : " is-invalid"}`}
            style={gridArea(dropTarget.row, dropTarget.col, dropTarget.rowSpan, dropTarget.colSpan)}
          />
        )}

      {layout.placements.map(({ widget: w, row, col, colSpan, rowSpan }) => {
        const size = displayWidgetSize(w);
        return (
        <div
          key={w.id}
          data-widget-id={w.id}
          data-grid-row={row}
          data-grid-col={col}
          data-row-span={rowSpan}
          data-col-span={colSpan}
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
              updateDropTargetFromPointer(e.clientX, e.clientY);
            }
          }}
          onDragLeave={() => setDragOverId((cur) => (cur === w.id ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragId && dragId !== w.id) dropAtPreview(dragId);
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
