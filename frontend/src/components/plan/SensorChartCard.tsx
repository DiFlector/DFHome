import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../../api/client";
import type { HistoryPoint, SensorChartWidget } from "../../api/types";

interface Props {
  widget: SensorChartWidget;
  onRemove: () => void;
}

const WINDOW_HOURS = 3;
const TICK_STEP_HOURS = 1;

// Chart geometry (viewBox units; the SVG itself is fluid-width).
const W = 340;
const H = 150;
const PT = 10;
const PB = 20;
const PL = 6;
const PR = 6;

const BLUE = { r: 9, g: 132, b: 227 }; // var(--accent)
const RED = { r: 235, g: 59, b: 90 };
const ACCENT = `rgb(${BLUE.r}, ${BLUE.g}, ${BLUE.b})`;

// Humidity comfort band is 40–60%: inside it points stay accent-blue, and
// the further outside, the redder they get (fully red 20 points out).
function humidityColor(v: number): string {
  const deviation = v > 60 ? Math.min(1, (v - 60) / 20) : v < 40 ? Math.min(1, (40 - v) / 20) : 0;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * deviation);
  return `rgb(${mix(BLUE.r, RED.r)}, ${mix(BLUE.g, RED.g)}, ${mix(BLUE.b, RED.b)})`;
}

function domain(points: HistoryPoint[], isHumidity: boolean): [number, number] {
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (isHumidity) {
    // Keep the 40/60 thresholds in view so the red/blue coloring reads.
    lo = Math.min(lo - 3, 35);
    hi = Math.max(hi + 3, 65);
  } else {
    lo -= 1;
    hi += 1;
  }
  return [lo, hi];
}

export default function SensorChartCard({ widget, onRemove }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["history", widget.device_id],
    queryFn: () => endpoints.getHistory(widget.device_id, WINDOW_HOURS),
    refetchInterval: 5 * 60 * 1000,
  });

  const instance = widget.property_instance;
  const isHumidity = instance === "humidity";
  const points = data?.[instance] ?? [];

  const nowSec = Date.now() / 1000;
  const start = nowSec - WINDOW_HOURS * 3600;
  const x = (ts: number) => PL + ((ts - start) / (WINDOW_HOURS * 3600)) * (W - PL - PR);

  const [lo, hi] = points.length ? domain(points, isHumidity) : [0, 1];
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB);

  const linePath = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");

  const pointColor = (v: number) => (isHumidity ? humidityColor(v) : ACCENT);

  // Time gridlines at a fixed hour step across the window.
  const ticks = Array.from(
    { length: WINDOW_HOURS / TICK_STEP_HOURS + 1 },
    (_, i) => start + i * TICK_STEP_HOURS * 3600,
  );

  const last = points[points.length - 1]?.value;
  const unit = widget.unit || (isHumidity ? "%" : "");

  return (
    <div className="widget-card sensor-chart-card">
      <div className="widget-card-header">
        <span>{widget.device_name}</span>
        <button type="button" className="remove-btn" onClick={onRemove} aria-label="Удалить виджет">
          ×
        </button>
      </div>

      <div className="chart-legend">
        <span>
          <span className="chart-legend-dot" style={{ background: last !== undefined ? pointColor(last) : ACCENT }} />
          {widget.label}
          {last !== undefined && `: ${last}${unit}`}
        </span>
        <span className="chart-legend-window">за {WINDOW_HOURS} ч</span>
      </div>

      {isLoading && <span className="loading">…</span>}
      {isError && <span className="widget-error">Не удалось загрузить историю</span>}
      {!isLoading && !isError && points.length === 0 && (
        <span className="widget-meta">Данные накапливаются — точки появляются каждые 15 минут.</span>
      )}

      {points.length > 0 && (
        <div className="sensor-chart-area">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="sensor-chart"
            role="img"
            aria-label={`График: ${widget.label}`}
          >
            {ticks.map((ts) => (
              <g key={ts}>
                <line x1={x(ts)} y1={PT} x2={x(ts)} y2={H - PB} className="chart-grid" />
                <text x={x(ts)} y={H - 6} className="chart-tick">
                  {new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </text>
              </g>
            ))}

            <path d={linePath} className="chart-line" />
            {points.map((p) => (
              <circle key={p.ts} cx={x(p.ts)} cy={y(p.value)} r={3.5} fill={pointColor(p.value)} />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
