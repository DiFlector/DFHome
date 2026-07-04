import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiErrorMessage, endpoints } from "../api/client";
import type { DeviceView, PlanDevicePosition, PlanLayout, PlanRoom } from "../api/types";
import DevicePopover, { type PopoverAnchor } from "../components/DevicePopover";
import { CompressIcon, ExpandIcon, GaugeIcon, MoonIcon, PlusIcon } from "../components/icons";
import DeviceMarker from "../components/plan/DeviceMarker";
import DeviceOutline from "../components/plan/DeviceOutline";
import RoomBox, { roomComfort } from "../components/plan/RoomBox";
import WidgetsPanel from "../components/plan/WidgetsPanel";
import { useStoredFlag } from "../hooks/useStoredFlag";

const EMPTY_LAYOUT: PlanLayout = { rooms: [], devices: [] };

// Night dimming window for the kiosk screen (TV burn-in protection).
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 7;
const isNightNow = () => {
  const h = new Date().getHours();
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
};

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

  // Display toggles, persisted per browser/TV.
  const [autoNight, setAutoNight] = useStoredFlag("dfhome-auto-night", true);
  const [showComfort, setShowComfort] = useStoredFlag("dfhome-show-comfort", true);
  const [isNight, setIsNight] = useState(isNightNow);
  useEffect(() => {
    const timer = setInterval(() => setIsNight(isNightNow()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
  const roomDevicesById = new Map(rooms.map((r) => [r.id, r.devices]));

  const availableRoomsToAdd = rooms.filter((r) => !layout.rooms.some((pr) => pr.room_id === r.id));
  // Devices offered for adding, grouped by room — Yandex device names repeat
  // a lot ("Осветительный прибор" ×N), so the room header is what actually
  // tells them apart.
  const isOnPlan = (deviceId: string) => layout.devices.some((pd) => pd.device_id === deviceId);
  const deviceGroupsToAdd = [
    ...rooms.map((r) => ({ name: r.name, devices: r.devices.filter((d) => !isOnPlan(d.id)) })),
    { name: "Без комнаты", devices: (home?.unassigned_devices ?? []).filter((d) => !isOnPlan(d.id)) },
  ].filter((g) => g.devices.length > 0);

  // Rooms and devices stop short of the canvas edge instead of dragging past
  // it. EDGE_PAD is generous on purpose: remove buttons and the resize handle
  // stick out past an element's own box, and anything poking beyond the
  // canvas would bring scrollbars back.
  const EDGE_PAD = 16;

  // Everything on the plan snaps to the canvas grid (its background-size),
  // so rooms line up flush against each other without pixel hunting.
  const GRID = 24;
  const snap = (v: number) => Math.round(v / GRID) * GRID;

  const clampRoom = (r: PlanRoom): PlanRoom => {
    const s = { ...r, x: snap(r.x), y: snap(r.y), width: snap(r.width), height: snap(r.height) };
    if (!canvasSize.w || !canvasSize.h) {
      return { ...s, x: Math.max(EDGE_PAD, s.x), y: Math.max(EDGE_PAD, s.y) };
    }
    const width = Math.min(s.width, canvasSize.w - EDGE_PAD * 2);
    const height = Math.min(s.height, canvasSize.h - EDGE_PAD * 2);
    return {
      ...s,
      width,
      height,
      x: Math.min(Math.max(EDGE_PAD, s.x), canvasSize.w - width - EDGE_PAD),
      y: Math.min(Math.max(EDGE_PAD, s.y), canvasSize.h - height - EDGE_PAD),
    };
  };

  // A marker is centered on its (x, y) via translate(-50%, -50%) and is
  // ~76px tall/wide with its label, so keep the center half that far in.
  const DEVICE_HALF = 38 + EDGE_PAD;
  const clampDevice = (d: PlanDevicePosition): PlanDevicePosition => {
    const s = { ...d, x: snap(d.x), y: snap(d.y) };
    if (!canvasSize.w || !canvasSize.h) {
      return { ...s, x: Math.max(DEVICE_HALF, s.x), y: Math.max(DEVICE_HALF, s.y) };
    }
    return {
      ...s,
      x: Math.min(Math.max(DEVICE_HALF, s.x), canvasSize.w - DEVICE_HALF),
      y: Math.min(Math.max(DEVICE_HALF, s.y), canvasSize.h - DEVICE_HALF),
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
      rooms: [...prev.rooms, { room_id: roomId, x: 48 + offset, y: 48 + offset, width: 264, height: 192 }],
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
      devices: [...prev.devices, { device_id: deviceId, x: 96 + offset, y: 96 + offset }],
    }));
    setAddingDevice(false);
  };

  // -- LED strip mode: a device drawn as a room-perimeter outline -----------
  const roomAtPoint = (x: number, y: number) =>
    layout.rooms.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);

  const setDeviceOutline = (deviceId: string, roomId: string | null) =>
    setLayout((prev) => ({
      ...prev,
      devices: prev.devices.map((d) => (d.device_id === deviceId ? { ...d, outline_room_id: roomId } : d)),
    }));

  const openDevice = openPopover ? deviceById.get(openPopover.deviceId) : undefined;

  // -- Fit-to-canvas scaling ------------------------------------------------
  // Whatever the window size, the whole plan should be visible without
  // scrolling: measure the canvas, compute the layout's bounding box and
  // scale to fit. While editing the scale locks to 1:1 (drag deltas are
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

  // FIT_PAD matches EDGE_PAD: content is clamped 16px inside the canvas, so
  // a layout that fits renders at exactly scale 1 — identical to editing.
  // (A larger pad used to force ~0.95 shrink even when everything fit.)
  const FIT_PAD = 16;
  const hasContent = layout.rooms.length > 0 || layout.devices.length > 0;
  const contentW =
    Math.max(0, ...layout.rooms.map((r) => r.x + r.width), ...layout.devices.map((d) => d.x + 40)) + FIT_PAD;
  const contentH =
    Math.max(0, ...layout.rooms.map((r) => r.y + r.height), ...layout.devices.map((d) => d.y + 48)) + FIT_PAD;
  // Shrink-only fit, anchored top-left: the plan renders 1:1 exactly like
  // the edit mode whenever it fits, and only scales down on screens smaller
  // than the layout. No upscaling and no centering — enlarging or shifting
  // the plan made the kiosk view look different from the editing view.
  // In kiosk mode the height budget comes from the viewport (not the canvas,
  // whose height we set below), and the canvas is then cut to the content so
  // no empty band is left underneath the plan.
  const KIOSK_CHROME = 96; // toolbar + paddings, mirrors the kiosk CSS calc
  const kioskMaxH = Math.max(0, window.innerHeight - KIOSK_CHROME);
  const fitScale =
    editing || !hasContent || canvasSize.w === 0
      ? 1
      : kiosk
        ? Math.min(1, canvasSize.w / contentW, kioskMaxH / contentH)
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
                className={`kiosk-exit-btn${autoNight ? " is-active" : ""}`}
                onClick={() => setAutoNight(!autoNight)}
                title={`Авто ночной режим (${NIGHT_START_HOUR}:00–0${NIGHT_END_HOUR}:00)`}
                aria-label="Авто ночной режим"
              >
                <MoonIcon width={16} height={16} />
              </button>
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
                      {deviceGroupsToAdd.length === 0 && (
                        <div className="plan-add-empty">Все устройства уже на плане</div>
                      )}
                      {deviceGroupsToAdd.map((group) => (
                        <div key={group.name} className="plan-add-group">
                          <div className="plan-add-group-label">{group.name}</div>
                          {group.devices.map((d) => (
                            <button key={d.id} type="button" onClick={() => addDevicePos(d.id)}>
                              {d.name}
                            </button>
                          ))}
                        </div>
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
              <>
                <button
                  type="button"
                  className={autoNight ? "primary" : "secondary"}
                  onClick={() => setAutoNight(!autoNight)}
                  title={`Авто ночной режим: затемнять экран с ${NIGHT_START_HOUR}:00 до 0${NIGHT_END_HOUR}:00 в полноэкранном режиме`}
                  aria-label="Авто ночной режим"
                >
                  <MoonIcon width={15} height={15} />
                </button>
                <button
                  type="button"
                  className={showComfort ? "primary" : "secondary"}
                  onClick={() => setShowComfort(!showComfort)}
                  title="Показывать комфортность комнат (температура и влажность)"
                  aria-label="Комфортность комнат"
                >
                  <GaugeIcon width={15} height={15} />
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={enterKiosk}
                  title="Полноэкранный режим для ТВ"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <ExpandIcon width={14} height={14} /> На весь экран
                </button>
              </>
            )}
          </div>
          )}
        </div>

        {saveMutation.isError && <div className="banner error">{apiErrorMessage(saveMutation.error)}</div>}
        {toast && <div className="banner success toast">{toast}</div>}

        {isLoading ? (
          <p className="loading">Загрузка плана…</p>
        ) : (
          <div
            className="plan-canvas"
            ref={canvasRef}
            style={kiosk && hasContent ? { height: Math.round(contentH * fitScale) } : undefined}
          >
            <div className="plan-scale" style={{ transform: `scale(${fitScale})` }}>
              {layout.rooms.map((room) => (
                <RoomBox
                  key={room.room_id}
                  room={room}
                  roomName={roomNameById.get(room.room_id) ?? room.room_id}
                  editable={editing}
                  comfort={showComfort ? roomComfort(roomDevicesById.get(room.room_id) ?? []) : null}
                  onChange={updateRoom}
                  onRemove={() => removeRoom(room.room_id)}
                />
              ))}
              {layout.devices.map((pos) => {
                const device = deviceById.get(pos.device_id);
                if (!device) return null;
                // Strip mode: hug the room's perimeter. Falls back to the
                // point marker if the room has been removed from the plan.
                const outlineRoom = pos.outline_room_id
                  ? layout.rooms.find((r) => r.room_id === pos.outline_room_id)
                  : undefined;
                if (outlineRoom) {
                  return (
                    <DeviceOutline
                      key={pos.device_id}
                      device={device}
                      room={outlineRoom}
                      editable={editing}
                      onToMarker={() => setDeviceOutline(pos.device_id, null)}
                      onRemove={() => removeDevicePos(pos.device_id)}
                      onOpen={(anchor) => setOpenPopover({ deviceId: pos.device_id, anchor })}
                    />
                  );
                }
                const hostRoom = roomAtPoint(pos.x, pos.y);
                return (
                  <DeviceMarker
                    key={pos.device_id}
                    device={device}
                    position={pos}
                    editable={editing}
                    onChange={updateDevicePos}
                    onRemove={() => removeDevicePos(pos.device_id)}
                    onOpen={(anchor) => setOpenPopover({ deviceId: pos.device_id, anchor })}
                    onMakeOutline={hostRoom ? () => setDeviceOutline(pos.device_id, hostRoom.room_id) : undefined}
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

      {kiosk && autoNight && isNight && <div className="night-overlay" />}

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
