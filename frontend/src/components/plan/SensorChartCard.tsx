import type { HistoryPoint, MetricThresholds, SensorChartWidget, WidgetSize } from "../../api/types";
import { useDeviceHistory } from "../../hooks/useDeviceHistory";
import { useMetricThresholds } from "../../hooks/useMetricThresholds";
import { sensorPropertyVariant, type SensorPropertyVariant } from "../icons";
import { humidityWarnBands, metricNormBand, metricStatus, metricStatusColor } from "../../utils/metricStatus";

interface Props {
  widget: SensorChartWidget;
  size: WidgetSize;
  onRemove: () => void;
}

const W = 280;
const H = 120;
const PT = 4;
const PB = 4;
const PL = 2;
const PR = 2;

function windowHoursForSize(size: WidgetSize): number {
  return size === "l" ? 6 : 3;
}

function tickStepHours(windowHours: number): number {
  return windowHours <= 3 ? 1 : 2;
}

function fmtHoursShort(n: number): string {
  return `${n} ч.`;
}

function domain(points: HistoryPoint[], variant: SensorPropertyVariant, thresholds: MetricThresholds): [number, number] {
  const values = points.map((p) => p.value);
  const dataLo = Math.min(...values);
  const dataHi = Math.max(...values);
  const spread = dataHi - dataLo;
  const norm = metricNormBand(variant, thresholds);

  let lo: number;
  let hi: number;

  if (variant === "battery") {
    lo = Math.min(dataLo - 2, norm?.lo ?? 96);
    hi = 99.9;
    return [lo, hi];
  }

  if (variant === "humidity") {
    if (spread < 6) {
      const mid = (dataLo + dataHi) / 2;
      lo = mid - 10;
      hi = mid + 10;
    } else {
      const pad = Math.max(3, spread * 0.15);
      lo = dataLo - pad;
      hi = dataHi + pad;
    }
  } else if (spread < 0.15) {
    const pad = Math.max(0.8, Math.abs(dataLo) * 0.04 || 0.8);
    lo = dataLo - pad;
    hi = dataHi + pad;
  } else {
    const pad = Math.max(0.4, spread * 0.1);
    lo = dataLo - pad;
    hi = dataHi + pad;
  }

  if (norm) {
    const edge =
      variant === "humidity"
        ? thresholds.humidity.margin + 1
        : variant === "temp"
          ? 0.5
          : 0;
    lo = Math.min(lo, norm.lo - edge);
    hi = Math.max(hi, norm.hi + edge);
  }

  return [lo, hi];
}

function zoneRect(lo: number, hi: number, bandLo: number, bandHi: number, y: (v: number) => number) {
  if (hi <= bandLo || lo >= bandHi) return null;
  const top = y(Math.min(hi, bandHi));
  const bottom = y(Math.max(lo, bandLo));
  const height = Math.max(0, bottom - top);
  if (height <= 0) return null;
  return { top, height };
}

function plotValue(v: number, lo: number, hi: number, variant: SensorPropertyVariant): number {
  if (variant === "battery") return Math.min(v, hi);
  return v;
}

function fmtTick(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function fmtAxis(v: number, variant: SensorPropertyVariant): string {
  if (variant === "battery") return v.toFixed(1);
  if (variant === "humidity") return `${Math.round(v)}`;
  return v.toFixed(1);
}

function fmtValue(v: number, variant: SensorPropertyVariant): string {
  if (variant === "humidity") return String(Math.round(v));
  if (variant === "battery") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return v.toFixed(1);
}

function metaBlock(label: string, normLabel: string | null, windowHours: number, align: "end" | "start" = "end") {
  return (
    <div className={`sensor-chart-head-meta sensor-chart-head-meta--${align}`}>
      <span className="sensor-chart-metric">
        {label}{" "}
        <span className="sensor-chart-window">за {fmtHoursShort(windowHours)}</span>
      </span>
      {normLabel && <span className="sensor-chart-comfort-inline">Норма {normLabel}</span>}
    </div>
  );
}

export default function SensorChartCard({ widget, size, onRemove }: Props) {
  const thresholds = useMetricThresholds();
  const windowHours = windowHoursForSize(size);
  const tickStep = tickStepHours(windowHours);

  const { data, isLoading, isError } = useDeviceHistory(widget.device_id, windowHours);

  const instance = widget.property_instance;
  const variant = sensorPropertyVariant(instance);
  const norm = metricNormBand(variant, thresholds);

  const nowSec = Date.now() / 1000;
  const start = nowSec - windowHours * 3600;
  const points = (data?.series[instance] ?? []).filter((p) => p.ts >= start);

  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const plotBottom = H - PB;

  const x = (ts: number) => PL + ((ts - start) / (windowHours * 3600)) * plotW;
  const xPct = (ts: number) => `${(((ts - start) / (windowHours * 3600)) * 100).toFixed(2)}%`;

  const [lo, hi] = points.length ? domain(points, variant, thresholds) : [0, 1];
  const y = (v: number) => PT + (1 - (plotValue(v, lo, hi, variant) - lo) / (hi - lo || 1)) * plotH;

  const coords = points.map((p) => ({ ...p, cx: x(p.ts), cy: y(p.value) }));

  const linePath = coords.map((p, i) => `${i ? "L" : "M"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ");

  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords[coords.length - 1].cx.toFixed(1)},${plotBottom} L${coords[0].cx.toFixed(1)},${plotBottom} Z`
      : "";

  const ticks = Array.from(
    { length: windowHours / tickStep + 1 },
    (_, i) => start + i * tickStep * 3600,
  );

  const yTicks = [hi, lo];
  const latest = data?.latest[instance]?.value;
  const last = latest ?? points[points.length - 1]?.value;
  const unit = widget.unit || (variant === "humidity" ? "%" : variant === "temp" ? "°C" : "");
  const valueStatus = last !== undefined ? metricStatus(variant, last, thresholds) : "ok";
  const strokeColor = metricStatusColor(valueStatus);

  const showComfortZone = norm !== null && lo < norm.hi && hi > norm.lo;
  const comfortTop = norm ? y(Math.min(hi, norm.hi)) : 0;
  const comfortBottom = norm ? y(Math.max(lo, norm.lo)) : 0;
  const comfortHeight = Math.max(0, comfortBottom - comfortTop);
  const humidityWarnRects =
    variant === "humidity"
      ? humidityWarnBands(thresholds)
          .map((band, i) => {
            const rect = zoneRect(lo, hi, band.lo, band.hi, y);
            return rect ? { key: i, ...rect } : null;
          })
          .filter((z): z is { key: number; top: number; height: number } => z !== null)
      : [];

  const valueBlock = (
    <div className="sensor-chart-current">
      {last !== undefined ? (
        <>
          {fmtValue(last, variant)}
          <span className="sensor-chart-unit">{unit}</span>
        </>
      ) : (
        "—"
      )}
    </div>
  );

  const lastCoord = coords[coords.length - 1];

  const chartBlock =
    points.length > 0 ? (
      <div className="sensor-chart-frame">
        <div className="sensor-chart-yaxis" aria-hidden>
          {yTicks.map((v) => (
            <span key={v}>{fmtAxis(v, variant)}</span>
          ))}
        </div>

        <div className="sensor-chart-plot">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="sensor-chart-svg"
            role="img"
            aria-label={`График: ${widget.label}`}
          >
            {humidityWarnRects.map((zone) => (
              <rect
                key={zone.key}
                x={PL}
                y={zone.top}
                width={plotW}
                height={zone.height}
                className="chart-warn-zone"
                rx={2}
              />
            ))}

            {showComfortZone && norm && (
              <>
                <rect x={PL} y={comfortTop} width={plotW} height={comfortHeight} className="chart-comfort-zone" rx={2} />
                <line
                  x1={PL}
                  y1={comfortTop}
                  x2={W - PR}
                  y2={comfortTop}
                  className="chart-comfort-edge"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={PL}
                  y1={comfortBottom}
                  x2={W - PR}
                  y2={comfortBottom}
                  className="chart-comfort-edge"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}

            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={PL}
                y1={PT + plotH * t}
                x2={W - PR}
                y2={PT + plotH * t}
                className="chart-grid-h"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {ticks.map((ts) => (
              <line
                key={ts}
                x1={x(ts)}
                y1={PT}
                x2={x(ts)}
                y2={plotBottom}
                className="chart-grid-v"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {areaPath && <path d={areaPath} className="chart-area" style={{ fill: strokeColor, opacity: 0.22 }} />}
            {linePath && (
              <path d={linePath} className="chart-line" style={{ stroke: strokeColor }} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {lastCoord && (
            <span
              className="chart-last-dot-mark"
              style={{
                left: `${(lastCoord.cx / W) * 100}%`,
                top: `${(lastCoord.cy / H) * 100}%`,
                backgroundColor: strokeColor,
              }}
            />
          )}
        </div>

        <div className="sensor-chart-xaxis" aria-hidden>
          {ticks.map((ts, i) => (
            <span
              key={ts}
              className="sensor-chart-tick"
              style={{ left: xPct(ts) }}
              data-edge={i === 0 ? "start" : i === ticks.length - 1 ? "end" : undefined}
            >
              {fmtTick(ts)}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  const normLabel = norm?.label ?? null;

  return (
    <div className={`widget-card sensor-chart-card sensor-chart-card--${variant} sensor-chart-card--${size} metric-${valueStatus}`}>
      <div className="widget-card-header">
        <span>{widget.device_name}</span>
        <button type="button" className="remove-btn" onClick={onRemove} aria-label="Удалить виджет">
          ×
        </button>
      </div>

      {size === "l" ? (
        <div className="sensor-chart-body-l">
          <div className="sensor-chart-side">
            {valueBlock}
            {metaBlock(widget.label, normLabel, windowHours, "start")}
          </div>
          {chartBlock}
        </div>
      ) : (
        <>
          <div className="sensor-chart-head">
            {valueBlock}
            {metaBlock(widget.label, normLabel, windowHours, "end")}
          </div>
          {chartBlock}
        </>
      )}

      {isLoading && <span className="loading">…</span>}
      {isError && <span className="widget-error">Не удалось загрузить историю</span>}
      {!isLoading && !isError && points.length === 0 && (
        <span className="widget-meta sensor-chart-empty">Данные накапливаются — точки появляются каждые 15 минут.</span>
      )}
    </div>
  );
}
