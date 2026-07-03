import { useDrag } from "../../hooks/useDrag";
import type { PlanRoom } from "../../api/types";

interface Props {
  room: PlanRoom;
  roomName: string;
  editable: boolean;
  onChange: (room: PlanRoom) => void;
  onRemove: () => void;
}

const MIN_SIZE = 90;

export default function RoomBox({ room, roomName, editable, onChange, onRemove }: Props) {
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
