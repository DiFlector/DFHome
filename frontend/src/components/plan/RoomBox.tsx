import { useDrag } from "../../hooks/useDrag";
import type { DeviceView, PlanRoom } from "../../api/types";
import { DEFAULT_METRIC_THRESHOLDS, roomComfortLevel, type MetricStatus } from "../../utils/metricStatus";
import type { MetricThresholds } from "../../api/types";

export type ComfortLevel = MetricStatus;

export interface RoomComfort {
  level: ComfortLevel;
  text: string;
}

// 0 = comfortable, 1 = borderline, 2 = uncomfortable.
/** Room comfort from its sensors; worst metric wins. null when no numeric sensors. */
export function roomComfort(devices: DeviceView[], thresholds: MetricThresholds = DEFAULT_METRIC_THRESHOLDS): RoomComfort | null {
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

  const parts: string[] = [];
  if (temps.length) {
    const t = temps.reduce((s, x) => s + x, 0) / temps.length;
    parts.push(`${t.toFixed(1)}°`);
  }
  if (hums.length) {
    const h = hums.reduce((s, x) => s + x, 0) / hums.length;
    parts.push(`${Math.round(h)}%`);
  }
  return { level: roomComfortLevel(temps, hums, thresholds), text: parts.join(" · ") };
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
