import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../api/client";
import type { MetricThresholds } from "../api/types";
import { DEFAULT_METRIC_THRESHOLDS } from "../utils/metricStatus";

export function useMetricThresholds(): MetricThresholds {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: endpoints.getSettings,
    staleTime: 5 * 60 * 1000,
  });
  return data?.metric_thresholds ?? DEFAULT_METRIC_THRESHOLDS;
}
