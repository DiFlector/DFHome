import type { SensorPropertyVariant } from "../components/icons";

export type MetricStatus = "good" | "ok" | "bad";

/** 0 = in band, 1 = borderline, 2 = out of range. */
function bandLevel(v: number, lo: number, hi: number, pad: number): 0 | 1 | 2 {
  if (v >= lo && v <= hi) return 0;
  if (v >= lo - pad && v <= hi + pad) return 1;
  return 2;
}

const STATUS: MetricStatus[] = ["good", "ok", "bad"];

export interface MetricNormBand {
  lo: number;
  hi: number;
  /** Display suffix included, e.g. "40–60%" or "20–24°C". */
  label: string;
}

export function metricNormBand(variant: SensorPropertyVariant): MetricNormBand | null {
  if (variant === "temp") return { lo: 20, hi: 24, label: "20–24°C" };
  if (variant === "humidity") return { lo: 40, hi: 60, label: "40–60%" };
  if (variant === "battery") return { lo: 60, hi: 100, label: "≥60%" };
  return null;
}

export function metricStatus(variant: SensorPropertyVariant, value: number): MetricStatus {
  if (variant === "temp") return STATUS[bandLevel(value, 20, 24, 2)];
  if (variant === "humidity") return STATUS[bandLevel(value, 40, 60, 10)];
  if (variant === "battery") {
    if (value >= 60) return "good";
    if (value >= 20) return "ok";
    return "bad";
  }
  return "ok";
}

export function metricStatusFromInstance(instance: string, value: number): MetricStatus {
  if (instance === "temperature") return metricStatus("temp", value);
  if (instance === "humidity") return metricStatus("humidity", value);
  if (instance === "battery_level") return metricStatus("battery", value);
  return "ok";
}

export function metricStatusColor(status: MetricStatus): string {
  if (status === "good") return "var(--success)";
  if (status === "ok") return "var(--warning)";
  return "var(--danger)";
}

/** Room comfort bands — same thresholds as metricStatus. */
export function roomComfortLevel(temps: number[], hums: number[]): MetricStatus {
  let worst: 0 | 1 | 2 = 0;
  if (temps.length) {
    const t = temps.reduce((s, x) => s + x, 0) / temps.length;
    worst = Math.max(worst, bandLevel(t, 20, 24, 2)) as 0 | 1 | 2;
  }
  if (hums.length) {
    const h = hums.reduce((s, x) => s + x, 0) / hums.length;
    worst = Math.max(worst, bandLevel(h, 40, 60, 10)) as 0 | 1 | 2;
  }
  return STATUS[worst];
}
