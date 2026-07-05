import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../api/client";

const SENSOR_REFETCH_MS = 15_000;

/** Single source for chart + sensor widgets — backend table sensor_history. */
export function useDeviceHistory(deviceId: string, hours: number) {
  return useQuery({
    queryKey: ["history", deviceId, hours],
    queryFn: () => endpoints.getHistory(deviceId, hours),
    refetchInterval: SENSOR_REFETCH_MS,
    refetchIntervalInBackground: true,
  });
}

export function useSensorLatest(deviceId: string, instance: string, hours = 3) {
  const query = useDeviceHistory(deviceId, hours);
  const point = query.data?.latest[instance];
  return {
    ...query,
    value: point?.value,
    ts: point?.ts,
  };
}
