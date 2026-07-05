import { useDrag } from "../../hooks/useDrag";
import type { DeviceView, PlanRoom } from "../../api/types";
import type { MetricStatus } from "../../utils/metricStatus";

export type ComfortLevel = MetricStatus;

export interface RoomComfort {
  level: ComfortLevel;
  text: string;
}

// 0 = comfortable, 1 = borderline, 2 = uncomfortable.
const bandLevel = (v: number, lo: number, hi: number, pad: number): number =>
  v >= lo && v <= hi ? 0 : v >= lo - pad && v <= hi + pad ? 1 : 2;

/** Room comfort from its sensors: temperature 20–24°C and humidity 40–60%
    are the green zones; the worst metric wins. null when the room has no
    numeric sensors to judge by. */
export function roomComfort(devices: DeviceView[]): RoomComfort | null {
  const temps: number[] = [];
  const hums: number[] = [];
  for (const d of devices) {
    for (const p of d.properties) {
      if (typeof p.value !== "number") continue;
      if (p.instance === "temperature") temps.push(p.value);
      if (p.instance === "humidity") hums.push(p.value);
    }
  }
  if (temps.length === 0 && hums.length === 0) return null;

  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  let worst = 0;
  const parts: string[] = [];
  if (temps.length) {
    const t = avg(temps);
    worst = Math.max(worst, bandLevel(t, 20, 24, 2));
    parts.push(`${t.toFixed(1)}°`);
  }
  if (hums.length) {
    const h = avg(hums);
    worst = Math.max(worst, bandLevel(h, 40, 60, 10));
    parts.push(`${Math.round(h)}%`);
  }
  const level = (["good", "ok", "bad"] as const)[worst];
  return { level, text: parts.join(" · ") };
}

interface Props {
  room: PlanRoom;
  roomName: string;
  editable: boolean;
  comfort?: RoomComfort | null;
  onChange: (room: PlanRoom) => void;
  onRemove: () => void;
}

const MIN_SIZE = 90;

export default function RoomBox({ room, roomName, editable, comfort, onChange, onRemove }: Props) {
  const move = useDrag(
    editable,
    () => ({ x: room.x, y: room.y }),
    (x, y) => onChange({ ...room, x: Math.max(0, x), y: Math.max(0, y) }),
  );
  const resize = useDrag(
    editable,
    () => ({ x: room.width, y: room.height }),
    (w, h) => onChange({ ...room, width: Math.max(MIN_SIZE, w), height: Math.max(MIN_SIZE, h) }),
  );

  return (
    <div
      className="plan-room"
      style={{ left: room.x, top: room.y, width: room.width, height: room.height }}
      onPointerDown={move.onPointerDown}
      onPointerMove={move.onPointerMove}
      onPointerUp={move.onPointerUp}
    >
      <span className="plan-room-label">{roomName}</span>
      {comfort && <span className={`plan-room-comfort comfort-${comfort.level}`}>{comfort.text}</span>}
      {editable && (
        <>
          <button
            type="button"
            className="plan-room-remove"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            aria-label="Удалить комнату с плана"
          >
            ×
          </button>
          <div
            className="plan-room-resize-handle"
            onPointerDown={resize.onPointerDown}
            onPointerMove={resize.onPointerMove}
            onPointerUp={resize.onPointerUp}
          />
        </>
      )}
    </div>
  );
}
