import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage, endpoints } from "../../api/client";
import type {
  DeviceView,
  RoomSensorWidget,
  SensorChartWidget,
  WeatherData,
  WeatherWidget,
  Widget,
} from "../../api/types";
import SensorChartCard from "./SensorChartCard";

interface Props {
  devices: DeviceView[];
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

export default function WidgetsPanel({ devices }: Props) {
  const queryClient = useQueryClient();
  const { data: widgets = [] } = useQuery({ queryKey: ["widgets"], queryFn: endpoints.getWidgets });

  const [adding, setAdding] = useState<"weather" | "room_sensor" | "sensor_chart" | null>(null);
  const [cityInput, setCityInput] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedInstance, setSelectedInstance] = useState("");

  const saveMutation = useMutation({
    mutationFn: (next: Widget[]) => endpoints.saveWidgets(next),
    onSuccess: (saved) => queryClient.setQueryData(["widgets"], saved),
  });

  const addWeatherWidget = () => {
    if (!cityInput.trim()) return;
    const widget: WeatherWidget = { id: genId(), kind: "weather", query: cityInput.trim() };
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
    };
    saveMutation.mutate([...widgets, widget]);
    setSelectedDeviceId("");
    setSelectedInstance("");
    setAdding(null);
  };

  const removeWidget = (id: string) => saveMutation.mutate(widgets.filter((w) => w.id !== id));

  return (
    <aside className="widgets-panel">
      <h3 style={{ marginTop: 0 }}>Виджеты</h3>

      {widgets.map((w) =>
        w.kind === "weather" ? (
          <WeatherWidgetCard key={w.id} widget={w} onRemove={() => removeWidget(w.id)} />
        ) : w.kind === "sensor_chart" ? (
          <SensorChartCard key={w.id} widget={w} onRemove={() => removeWidget(w.id)} />
        ) : (
          <RoomSensorWidgetCard key={w.id} widget={w} devices={devices} onRemove={() => removeWidget(w.id)} />
        ),
      )}

      {adding === null && (
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
        </div>
      )}

      {adding === "weather" && (
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

      {adding === "sensor_chart" && (
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

      {adding === "room_sensor" && (
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
