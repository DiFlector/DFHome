import type { SensorPropertyVariant } from "../components/icons";
import type { MetricThresholds } from "../api/types";

export type MetricStatus = "good" | "ok" | "bad" | "low";

export const DEFAULT_METRIC_THRESHOLDS: MetricThresholds = {
  temp: { norm_lo: 20, norm_hi: 24 },
  humidity: { norm_lo: 40, norm_hi: 60, margin: 5 },
  battery: { good_min: 60, ok_min: 20 },
};

const SEVERITY: Record<MetricStatus, number> = {
  good: 0,
  low: 1,
  ok: 1,
  bad: 2,
};

export interface MetricNormBand {
  lo: number;
  hi: number;
  /** Display suffix included, e.g. "40–60%" or "20–24°C". */
  label: string;
}

function fmtNormLabel(variant: SensorPropertyVariant, t: MetricThresholds): string {
  if (variant === "temp") return `${t.temp.norm_lo}–${t.temp.norm_hi}°C`;
  if (variant === "humidity") return `${t.humidity.norm_lo}–${t.humidity.norm_hi}%`;
  if (variant === "battery") return `≥${t.battery.good_min}%`;
  return "";
}

export function metricNormBand(
  variant: SensorPropertyVariant,
  thresholds: MetricThresholds = DEFAULT_METRIC_THRESHOLDS,
): MetricNormBand | null {
  if (variant === "temp") {
    return { lo: thresholds.temp.norm_lo, hi: thresholds.temp.norm_hi, label: fmtNormLabel(variant, thresholds) };
  }
  if (variant === "humidity") {
    return {
      lo: thresholds.humidity.norm_lo,
      hi: thresholds.humidity.norm_hi,
      label: fmtNormLabel(variant, thresholds),
    };
  }
  if (variant === "battery") {
    return { lo: thresholds.battery.good_min, hi: 100, label: fmtNormLabel(variant, thresholds) };
  }
  return null;
}

/** Yellow bands adjacent to humidity norm (for chart shading). */
export function humidityWarnBands(
  thresholds: MetricThresholds = DEFAULT_METRIC_THRESHOLDS,
): { lo: number; hi: number }[] {
  const { norm_lo, norm_hi, margin } = thresholds.humidity;
  if (margin <= 0) return [];
  return [
    { lo: norm_lo - margin, hi: norm_lo },
    { lo: norm_hi, hi: norm_hi + margin },
  ];
}

function tempStatus(value: number, t: MetricThresholds): MetricStatus {
  const { norm_lo, norm_hi } = t.temp;
  if (value >= norm_lo && value <= norm_hi) return "good";
  if (value > norm_hi) return "bad";
  return "low";
}

function humidityStatus(value: number, t: MetricThresholds): MetricStatus {
  const { norm_lo, norm_hi, margin } = t.humidity;
  if (value >= norm_lo && value <= norm_hi) return "good";
  if ((value >= norm_lo - margin && value < norm_lo) || (value > norm_hi && value <= norm_hi + margin)) {
    return "ok";
  }
  return "bad";
}

export function metricStatus(
  variant: SensorPropertyVariant,
  value: number,
  thresholds: MetricThresholds = DEFAULT_METRIC_THRESHOLDS,
): MetricStatus {
  if (variant === "temp") return tempStatus(value, thresholds);
  if (variant === "humidity") return humidityStatus(value, thresholds);
  if (variant === "battery") {
    if (value >= thresholds.battery.good_min) return "good";
    if (value >= thresholds.battery.ok_min) return "ok";
    return "bad";
  }
  return "ok";
}

export function metricStatusFromInstance(
  instance: string,
  value: number,
  thresholds: MetricThresholds = DEFAULT_METRIC_THRESHOLDS,
): MetricStatus {
  if (instance === "temperature") return metricStatus("temp", value, thresholds);
  if (instance === "humidity") return metricStatus("humidity", value, thresholds);
  if (instance === "battery_level") return metricStatus("battery", value, thresholds);
  return "ok";
}

export function metricStatusColor(status: MetricStatus): string {
  if (status === "good") return "var(--success)";
  if (status === "ok") return "var(--warning)";
  if (status === "low") return "var(--metric-cold)";
  return "var(--danger)";
}

function pickWorst(a: MetricStatus, b: MetricStatus): MetricStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

export function roomComfortLevel(
  temps: number[],
  hums: number[],
  thresholds: MetricThresholds = DEFAULT_METRIC_THRESHOLDS,
): MetricStatus {
  let level: MetricStatus = "good";
  if (temps.length) {
    const t = temps.reduce((s, x) => s + x, 0) / temps.length;
    level = pickWorst(level, metricStatus("temp", t, thresholds));
  }
  if (hums.length) {
    const h = hums.reduce((s, x) => s + x, 0) / hums.length;
    level = pickWorst(level, metricStatus("humidity", h, thresholds));
  }
  return level;
}
