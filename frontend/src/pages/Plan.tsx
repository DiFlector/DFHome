import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiErrorMessage, endpoints } from "../api/client";
import type { DeviceView, PlanDevicePosition, PlanLayout, PlanRoom } from "../api/types";
import DevicePopover, { type PopoverAnchor } from "../components/DevicePopover";
import { CompressIcon, ExpandIcon, PlusIcon } from "../components/icons";
import DeviceMarker from "../components/plan/DeviceMarker";
import RoomBox from "../components/plan/RoomBox";
import WidgetsPanel from "../components/plan/WidgetsPanel";

const EMPTY_LAYOUT: PlanLayout = { rooms: [], devices: [] };

function allDevices(home?: { rooms: { devices: DeviceView[] }[]; unassigned_devices: DeviceView[] }): DeviceView[] {
  if (!home) return [];
  return [...home.rooms.flatMap((r) => r.devices), ...home.unassigned_devices];
}

// Wall clock for the TV/kiosk view — lives in its own component so the
// 1-second tick doesn't re-render the whole plan.
function KioskClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="kiosk-clock">
      <span className="kiosk-clock-time">
        {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="kiosk-clock-date">
        {now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
      </span>
    </div>
  );
}

export default function Plan() {
  const queryClient = useQueryClient();
  const [kiosk, setKiosk] = useState(false);
  // Yandex has no push API, so "real time" on the TV is a faster poll of the
  // backend (which proxies to Yandex on every /home call).
  const { data: home } = useQuery({
    queryKey: ["home"],
    queryFn: endpoints.getHome,
    refetchInterval: kiosk ? 5000 : 15000,
  });
  const { data: savedPlan, isLoading } = useQuery({ queryKey: ["plan"], queryFn: endpoints.getPlan });

  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<PlanLayout>(EMPTY_LAYOUT);
  const [openPopover, setOpenPopover] = useState<{ deviceId: string; anchor: PopoverAnchor } | null>(null);
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingDevice, setAddingDevice] = useState(false);

  useEffect(() => {
    if (savedPlan) setLayout(savedPlan);
  }, [savedPlan]);

  // The kiosk layout (hidden sidebar, full-width canvas) is driven by a body
  // class so App-level chrome outside this page can react to it too.
  useEffect(() => {
    document.body.classList.toggle("kiosk-mode", kiosk);
    return () => document.body.classList.remove("kiosk-mode");
  }, [kiosk]);

  // Keep state in sync when fullscreen is exited via Esc/F11 instead of our button.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const enterKiosk = () => {
    setEditing(false);
    setAddingRoom(false);
    setAddingDevice(false);
    setOpenPopover(null);
    setKiosk(true);
    // Fullscreen can be rejected (unsupported/user gesture rules) — the kiosk
    // layout still applies, the browser just stays windowed.
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const exitKiosk = () => {
    setKiosk(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: (plan: PlanLayout) => endpoints.savePlan(plan),
    onSuccess: (saved) => {
      queryClient.setQueryData(["plan"], saved);
      showToast("План сохранён");
    },
  });

  const devices = allDevices(home);
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const rooms = home?.rooms ?? [];
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));

  const availableRoomsToAdd = rooms.filter((r) => !layout.rooms.some((pr) => pr.room_id === r.id));
  const availableDevicesToAdd = devices.filter((d) => !layout.devices.some((pd) => pd.device_id === d.id));

  // Rooms and devices stop short of the canvas edge instead of dragging past
  // it. EDGE_PAD is generous on purpose: remove buttons and the resize handle
  // stick out past an element's own box, and anything poking beyond the
  // canvas would bring scrollbars back.
  const EDGE_PAD = 16;
  const clampRoom = (r: PlanRoom): PlanRoom => {
    if (!canvasSize.w || !canvasSize.h) {
      return { ...r, x: Math.max(EDGE_PAD, r.x), y: Math.max(EDGE_PAD, r.y) };
    }
    const width = Math.min(r.width, canvasSize.w - EDGE_PAD * 2);
    const height = Math.min(r.height, canvasSize.h - EDGE_PAD * 2);
    return {
      ...r,
      width,
      height,
      x: Math.min(Math.max(EDGE_PAD, r.x), canvasSize.w - width - EDGE_PAD),
      y: Math.min(Math.max(EDGE_PAD, r.y), canvasSize.h - height - EDGE_PAD),
    };
  };

  // A marker is centered on its (x, y) via translate(-50%, -50%) and is
  // ~76px tall/wide with its label, so keep the center half that far in.
  const DEVICE_HALF = 38 + EDGE_PAD;
  const clampDevice = (d: PlanDevicePosition): PlanDevicePosition => {
    if (!canvasSize.w || !canvasSize.h) {
      return { ...d, x: Math.max(DEVICE_HALF, d.x), y: Math.max(DEVICE_HALF, d.y) };
    }
    return {
      ...d,
      x: Math.min(Math.max(DEVICE_HALF, d.x), canvasSize.w - DEVICE_HALF),
      y: Math.min(Math.max(DEVICE_HALF, d.y), canvasSize.h - DEVICE_HALF),
    };
  };

  const updateRoom = (updated: PlanRoom) =>
    setLayout((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.room_id === updated.room_id ? clampRoom(updated) : r)),
    }));

  const removeRoom = (roomId: string) =>
    setLayout((prev) => ({ ...prev, rooms: prev.rooms.filter((r) => r.room_id !== roomId) }));

  const addRoom = (roomId: string) => {
    const offset = (layout.rooms.length % 6) * 24;
    setLayout((prev) => ({
      ...prev,
      rooms: [...prev.rooms, { room_id: roomId, x: 40 + offset, y: 40 + offset, width: 260, height: 180 }],
    }));
    setAddingRoom(false);
  };

  const updateDevicePos = (updated: PlanDevicePosition) =>
    setLayout((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.device_id === updated.device_id ? clampDevice(updated) : d)),
    }));

  const removeDevicePos = (deviceId: string) =>
    setLayout((prev) => ({ ...prev, devices: prev.devices.filter((d) => d.device_id !== deviceId) }));

  const addDevicePos = (deviceId: string) => {
    const offset = (layout.devices.length % 8) * 24;
    setLayout((prev) => ({
      ...prev,
      devices: [...prev.devices, { device_id: deviceId, x: 80 + offset, y: 80 + offset }],
    }));
    setAddingDevice(false);
  };

  const openDevice = openPopover ? deviceById.get(openPopover.deviceId) : undefined;

  // -- Fit-to-canvas scaling ------------------------------------------------
  // Whatever the window size, the whole plan should be visible without
  // scrolling: measure the canvas, compute the layout's bounding box and
  // scale down to fit. While editing the scale locks to 1:1 (drag deltas are
  // in screen pixels) and the canvas falls back to scrolling.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoading]);

  const FIT_PAD = 56;
  const hasContent = layout.rooms.length > 0 || layout.devices.length > 0;
  const contentW =
    Math.max(0, ...layout.rooms.map((r) => r.x + r.width), ...layout.devices.map((d) => d.x + 40)) + FIT_PAD;
  const contentH =
    Math.max(0, ...layout.rooms.map((r) => r.y + r.height), ...layout.devices.map((d) => d.y + 48)) + FIT_PAD;
  const fitScale =
    editing || !hasContent || canvasSize.w === 0
      ? 1
      : Math.min(1, canvasSize.w / contentW, canvasSize.h / contentH);

  return (
    <div className="plan-page">
      <div className="plan-main">
        <div className="plan-toolbar">
          <h2 style={{ margin: 0 }}>Дашборд</h2>
          {kiosk && (
            <div className="kiosk-toolbar-right">
              <KioskClock />
              <button
                type="button"
                className="kiosk-exit-btn"
                onClick={exitKiosk}
                aria-label="Выйти из полноэкранного режима"
              >
                <CompressIcon width={16} height={16} />
              </button>
            </div>
          )}
          {!kiosk && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {editing && (
              <>
                <div className="plan-add-menu">
                  <button type="button" className="secondary" onClick={() => setAddingRoom((v) => !v)}>
                    <PlusIcon width={14} height={14} /> Комната
                  </button>
                  {addingRoom && (
                    <div className="plan-add-dropdown">
                      {availableRoomsToAdd.length === 0 && (
                        <div className="plan-add-empty">Все комнаты уже на плане</div>
                      )}
                      {availableRoomsToAdd.map((r) => (
                        <button key={r.id} type="button" onClick={() => addRoom(r.id)}>
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="plan-add-menu">
                  <button type="button" className="secondary" onClick={() => setAddingDevice((v) => !v)}>
                    <PlusIcon width={14} height={14} /> Устройство
                  </button>
                  {addingDevice && (
                    <div className="plan-add-dropdown">
                      {availableDevicesToAdd.length === 0 && (
                        <div className="plan-add-empty">Все устройства уже на плане</div>
                      )}
                      {availableDevicesToAdd.map((d) => (
                        <button key={d.id} type="button" onClick={() => addDevicePos(d.id)}>
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate(layout)}
                >
                  Сохранить
                </button>
              </>
            )}
            <button
              type="button"
              className={editing ? "primary" : "secondary"}
              onClick={() => {
                setEditing((v) => !v);
                setOpenPopover(null);
              }}
            >
              {editing ? "Готово" : "Редактировать"}
            </button>
            {!editing && (
              <button
                type="button"
                className="secondary"
                onClick={enterKiosk}
                title="Полноэкранный режим для ТВ"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <ExpandIcon width={14} height={14} /> На весь экран
              </button>
            )}
          </div>
          )}
        </div>

        {saveMutation.isError && <div className="banner error">{apiErrorMessage(saveMutation.error)}</div>}
        {toast && <div className="banner success toast">{toast}</div>}

        {isLoading ? (
          <p className="loading">Загрузка плана…</p>
        ) : (
          <div className="plan-canvas" ref={canvasRef}>
            <div className="plan-scale" style={{ transform: `scale(${fitScale})` }}>
              {layout.rooms.map((room) => (
                <RoomBox
                  key={room.room_id}
                  room={room}
                  roomName={roomNameById.get(room.room_id) ?? room.room_id}
                  editable={editing}
                  onChange={updateRoom}
                  onRemove={() => removeRoom(room.room_id)}
                />
              ))}
              {layout.devices.map((pos) => {
                const device = deviceById.get(pos.device_id);
                if (!device) return null;
                return (
                  <DeviceMarker
                    key={pos.device_id}
                    device={device}
                    position={pos}
                    editable={editing}
                    onChange={updateDevicePos}
                    onRemove={() => removeDevicePos(pos.device_id)}
                    onOpen={(anchor) => setOpenPopover({ deviceId: pos.device_id, anchor })}
                  />
                );
              })}
            </div>
            {layout.rooms.length === 0 && layout.devices.length === 0 && (
              <p className="plan-empty-hint">
                План пуст. Нажмите «Редактировать», затем «+ Комната» и «+ Устройство», чтобы расставить всё на
                плане.
              </p>
            )}
          </div>
        )}
      </div>

      <WidgetsPanel devices={devices} />

      {openDevice && openPopover && (
        <DevicePopover
          key={openPopover.deviceId}
          device={openDevice}
          anchor={openPopover.anchor}
          onClose={() => setOpenPopover(null)}
        />
      )}
    </div>
  );
}
