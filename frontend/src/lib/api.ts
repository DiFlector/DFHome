/**
 * API-клиент ядра DFHome.
 *
 * Все запросы идут под префиксом /api; и nginx (прод), и Vite dev-proxy
 * срезают этот префикс, поэтому бэкенд видит голые пути (/devices, /store, ...).
 * WebSocket на /api/ws доставляет снапшот и дельты состояний устройств.
 */
import type {
  Device,
  PlanLayout,
  Room,
  StoreItem,
  Widget,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  // devices
  getDevices: () => request<Device[]>("/devices"),
  sendCommand: (
    deviceId: string,
    entityId: string,
    instance: string,
    value: unknown,
  ) =>
    request<Device>(`/devices/${encodeURIComponent(deviceId)}/command`, {
      method: "POST",
      body: JSON.stringify({ entityId, instance, value }),
    }),

  // rooms
  getRooms: () => request<Room[]>("/rooms"),

  // plan
  getPlan: () => request<PlanLayout>("/plan"),
  savePlan: (layout: PlanLayout) =>
    request<PlanLayout>("/plan", {
      method: "PUT",
      body: JSON.stringify(layout),
    }),
  resetPlan: () =>
    request<PlanLayout>("/plan", {
      method: "DELETE",
    }),

  // widgets
  getWidgets: () => request<Widget[]>("/widgets"),

  // store
  getStore: () => request<StoreItem[]>("/store"),
  install: (domain: string) =>
    request<{ status: string }>("/store/install", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  installFromUrl: (url: string) =>
    request<{ status: string }>("/store/custom-repo", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  update: (domain: string) =>
    request<{ status: string }>("/store/update", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  uninstall: (domain: string) =>
    request<{ status: string }>("/store/uninstall", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),

  // settings
  getSettings: () => request<Record<string, unknown>>("/settings"),
  saveSettings: (values: Record<string, unknown>) =>
    request<Record<string, unknown>>("/settings", {
      method: "PUT",
      body: JSON.stringify(values),
    }),
  getIntegrations: () =>
    request<
      Array<{
        domain: string;
        version: string;
        manifest: Record<string, unknown>;
        configSchema: Record<string, unknown>;
        config: Record<string, unknown>;
        loaded: boolean;
      }>
    >("/integrations"),
};

/** WS-сообщения от ядра. */
export type WsMessage =
  | { type: "snapshot"; devices: Device[] }
  | { type: "device_state"; device: Device };

/**
 * Подписка на поток состояний устройств. Возвращает функцию отписки.
 * Автоматически переподключается при обрыве.
 */
export function openDeviceSocket(onMessage: (msg: WsMessage) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${window.location.host}${BASE}/ws`);

    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data) as WsMessage);
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = () => {
      if (closed) return;
      retry = setTimeout(connect, 2000);
    };
    socket.onerror = () => {
      socket?.close();
    };
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}
