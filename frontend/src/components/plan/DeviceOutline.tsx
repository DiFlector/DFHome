import type { CSSProperties } from "react";
import type { DeviceView, PlanRoom } from "../../api/types";
import { deviceTypeIcon, PinIcon } from "../icons";
import { resolveGlowColor } from "./DeviceMarker";

interface Props {
  device: DeviceView;
  room: PlanRoom;
  editable: boolean;
  onRemove: () => void;
  onToMarker: () => void;
  onOpen: (anchor: { top: number; left: number; width: number; height: number }) => void;
}

/**
 * An LED strip (or any light) rendered as a glowing outline hugging a room's
 * perimeter instead of a point marker. The box itself is pointer-transparent
 * so devices inside the room stay clickable — interaction goes through the
 * small name tag pinned to the room's top border.
 */
export default function DeviceOutline({ device, room, editable, onRemove, onToMarker, onOpen }: Props) {
  const onOffControl = device.controls.find((c) => c.capability_type === "devices.capabilities.on_off");
  const isOn = onOffControl ? Boolean(onOffControl.value) : null;
  const brightnessControl = device.controls.find((c) => c.instance === "brightness");
  const brightness = brightnessControl ? Number(brightnessControl.value) : 100;

  const rgb = isOn ? resolveGlowColor(device) : null;
  const glow = brightness / 100;
  const style: CSSProperties = {
    left: room.x,
    top: room.y,
    width: room.width,
    height: room.height,
    ...(rgb && {
      borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`,
      // Inset-only: an LED strip lights the room it runs around, not the
      // walls outside it.
      boxShadow: `inset 0 0 ${14 + glow * 30}px ${3 + glow * 8}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(0.26 + glow * 0.3).toFixed(2)})`,
    }),
  };

  return (
    <div className={`plan-strip${!device.online ? " is-offline" : ""}`} style={style}>
      <button
        type="button"
        className="plan-strip-tag"
        title={device.name}
        onClick={(e) => {
          if (editable) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onOpen({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }}
      >
        {deviceTypeIcon(device.type, { width: 12, height: 12 })}
        <span>{device.name}</span>
      </button>
      {editable && (
        <span className="plan-strip-actions">
          <button type="button" onClick={onToMarker} title="Вернуть точечный маркер" aria-label="Вернуть точечный маркер">
            <PinIcon width={11} height={11} />
          </button>
          <button type="button" className="is-danger" onClick={onRemove} aria-label="Убрать устройство с плана">
            ×
          </button>
        </span>
      )}
    </div>
  );
}
