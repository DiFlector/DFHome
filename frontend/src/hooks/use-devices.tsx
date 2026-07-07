import * as React from "react";

import { api, openDeviceSocket } from "@/lib/api";
import { updateDeviceCapability } from "@/lib/device-utils";
import type { Device } from "@/lib/types";

type DevicesContextValue = {
  devices: Device[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  updateCapability: (
    deviceId: string,
    entityId: string,
    instance: string,
    value: unknown,
  ) => void;
  getDevice: (deviceId: string) => Device | undefined;
};

const DevicesContext = React.createContext<DevicesContextValue | null>(null);

export function DevicesProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const next = await api.getDevices();
      setDevices(next);
    } catch {
      setDevices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live updates: full snapshots (on connect / integration (un)install) and
  // per-device state deltas pushed by integrations.
  React.useEffect(() => {
    const close = openDeviceSocket((msg) => {
      if (msg.type === "snapshot") {
        setDevices(msg.devices);
        setIsLoading(false);
      } else if (msg.type === "device_state") {
        setDevices((current) => {
          const exists = current.some((d) => d.id === msg.device.id);
          return exists
            ? current.map((d) => (d.id === msg.device.id ? msg.device : d))
            : [...current, msg.device];
        });
      }
    });
    return close;
  }, []);

  const updateCapability = React.useCallback(
    (deviceId: string, entityId: string, instance: string, value: unknown) => {
      // Optimistic update; the WS device_state echo reconciles authoritative state.
      setDevices((current) =>
        updateDeviceCapability(current, deviceId, entityId, instance, value),
      );
      void api.sendCommand(deviceId, entityId, instance, value).catch(() => {
        void refresh();
      });
    },
    [refresh],
  );

  const getDevice = React.useCallback(
    (deviceId: string) => devices.find((device) => device.id === deviceId),
    [devices],
  );

  const value = React.useMemo(
    () => ({ devices, isLoading, refresh, updateCapability, getDevice }),
    [devices, isLoading, refresh, updateCapability, getDevice],
  );

  return (
    <DevicesContext.Provider value={value}>{children}</DevicesContext.Provider>
  );
}

export function useDevices() {
  const context = React.useContext(DevicesContext);
  if (!context) {
    throw new Error("useDevices must be used within DevicesProvider");
  }
  return context;
}
