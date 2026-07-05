import type { CSSProperties } from "react";
import type { DeviceView, PlanDevicePosition } from "../../api/types";
import { useDrag } from "../../hooks/useDrag";
import { hsvToRgb, kelvinToRgb, type HsvValue } from "../../utils/color";
import { deviceTypeIcon, FrameIcon } from "../icons";

interface Props {
  device: DeviceView;
  position: PlanDevicePosition;
  editable: boolean;
  onChange: (pos: PlanDevicePosition) => void;
  onRemove: () => void;
  onOpen: (anchor: { top: number; left: number; width: number; height: number }) => void;
  /** Present when the marker sits inside a plan room: converts the device
      into a room-perimeter outline (LED strip mode). */
  onMakeOutline?: () => void;
}

function rgbIntToRgb(n: number): { r: number; g: number; b: number } {
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Glow color from the color mode Yandex reports as active (state.instance). */
export function resolveGlowColor(device: DeviceView): { r: number; g: number; b: number } | null {
  const colorControls = device.controls.filter((c) => c.kind === "color");
  const active =
    colorControls.find((c) => c.color_active) ??
    colorControls.find((c) => c.color_model === "hsv" || c.color_model === "rgb") ??
    colorControls[0];

  if (active?.color_model === "hsv") {
    const hsv = active.value as HsvValue | undefined;
    if (hsv && hsv.s > 0) return hsvToRgb(hsv);
  }

  if (active?.color_model === "rgb" && typeof active.value === "number") {
    return rgbIntToRgb(active.value);
  }

  const tempControl = colorControls.find((c) => c.color_model === "temperature_k");
  if (tempControl?.color_active && typeof tempControl.value === "number") {
    return kelvinToRgb(tempControl.value);
  }

  if (colorControls.some((c) => c.color_model === "temperature_k") && typeof tempControl?.value === "number") {
    return kelvinToRgb(tempControl.value);
  }

  if (colorControls.length > 0 || device.type.includes("light")) return { r: 255, g: 214, b: 140 };
  return null;
}

export default function DeviceMarker({ device, position, editable, onChange, onRemove, onOpen, onMakeOutline }: Props) {
  const drag = useDrag(
    editable,
    () => ({ x: position.x, y: position.y }),
    (x, y) => onChange({ ...position, x: Math.max(0, x), y: Math.max(0, y) }),
  );

  const onOffControl = device.controls.find((c) => c.capability_type === "devices.capabilities.on_off");
  const isOn = onOffControl ? Boolean(onOffControl.value) : null;
  const brightnessControl = device.controls.find((c) => c.instance === "brightness");
  const brightness = brightnessControl ? Number(brightnessControl.value) : 100;

  const glowRgb = isOn ? resolveGlowColor(device) : null;
  const glowStyle: CSSProperties | undefined = glowRgb
    ? {
        boxShadow: `0 0 ${12 + (brightness / 100) * 26}px ${4 + (brightness / 100) * 8}px rgba(${glowRgb.r}, ${glowRgb.g}, ${glowRgb.b}, ${(0.35 + (brightness / 100) * 0.35).toFixed(2)})`,
      }
    : undefined;

  // Every numeric property (battery, humidity, temperature, ...) — not just
  // the first couple; the pill may grow wider than the marker, that's fine.
  const sensorText = device.properties
    .filter((p) => typeof p.value === "number")
    .map((p) => `${p.value}${p.unit ?? ""}`)
    .join(" · ");

  return (
    <div
      className="plan-device"
      style={{ left: position.x, top: position.y }}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onClick={(e) => {
        if (editable) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }}
    >
      <div
        className={`plan-device-icon${isOn === false ? " is-off" : ""}${!device.online ? " is-offline" : ""}`}
        style={glowStyle}
      >
        {deviceTypeIcon(device.type, { width: 20, height: 20 })}
      </div>
      <span className="plan-device-name">{device.name}</span>
      {sensorText && <span className="plan-device-sensor">{sensorText}</span>}
      {editable && (
        <button
          type="button"
          className="plan-device-remove"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Убрать устройство с плана"
        >
          ×
        </button>
      )}
      {editable && onMakeOutline && (
        <button
          type="button"
          className="plan-device-outline-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMakeOutline();
          }}
          title="Растянуть по периметру комнаты (лента)"
          aria-label="Растянуть по периметру комнаты"
        >
          <FrameIcon width={11} height={11} />
        </button>
      )}
    </div>
  );
}
