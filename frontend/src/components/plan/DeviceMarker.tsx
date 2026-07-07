import {
  CircleDot,
  Lightbulb,
  Plug,
  Radio,
  Speaker,
  Thermometer,
  WifiOff,
} from "lucide-react";

import { usePlanDrag } from "@/hooks/use-plan-drag";
import type { Device, DeviceType, PlanDevicePosition } from "@/lib/types";
import { Button } from "@/components/ui/button";

import { isLight, markerGlow, PLAN_GRID } from "./plan-utils";

type DeviceMarkerProps = {
  device: Device;
  position: PlanDevicePosition;
  editable: boolean;
  scale: number;
  canAttachAsStrip: boolean;
  selected: boolean;
  onChange: (position: PlanDevicePosition) => void;
  onRemove: () => void;
  onSelect: () => void;
  onMakeStrip: () => void;
};

const icons: Record<DeviceType, React.ComponentType<{ className?: string }>> = {
  light: Lightbulb,
  socket: Plug,
  switch: CircleDot,
  sensor: Thermometer,
  thermostat: Thermometer,
  media_device: Speaker,
  other: Radio,
};

function numericProperties(device: Device) {
  return device.entities
    .flatMap((entity) => entity.properties)
    .filter((property) => typeof property.value === "number")
    .map((property) => `${property.value}${property.unit ?? ""}`)
    .join(" · ");
}

export function DeviceMarker({
  device,
  position,
  editable,
  scale,
  canAttachAsStrip,
  selected,
  onChange,
  onRemove,
  onSelect,
  onMakeStrip,
}: DeviceMarkerProps) {
  const Icon = icons[device.type];
  const drag = usePlanDrag(
    editable,
    () => ({ x: position.x, y: position.y }),
    ({ x, y }) => onChange({ ...position, x: Math.max(0, x), y: Math.max(0, y) }),
    { grid: PLAN_GRID, scale },
  );
  const sensorText = numericProperties(device);

  return (
    <div
      className="absolute z-20 flex w-24 -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center gap-1 text-center"
      style={{ left: position.x, top: position.y }}
      {...drag}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <div
        className={[
          "relative flex size-10 items-center justify-center rounded-full border bg-popover text-foreground shadow-lg transition",
          selected ? "border-primary ring-2 ring-primary/30" : "border-border/80",
          !device.online ? "opacity-55" : "",
        ].join(" ")}
        style={markerGlow(device)}
      >
        <Icon className="size-4" />
        {!device.online && (
          <WifiOff className="absolute -right-1 -bottom-1 size-3 rounded-full bg-popover text-muted-foreground" />
        )}
      </div>
      <span className="max-w-24 truncate rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground shadow-sm backdrop-blur">
        {device.name}
      </span>
      {sensorText && (
        <span className="max-w-28 truncate rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {sensorText}
        </span>
      )}
      {editable && (
        <div className="flex gap-1">
          {isLight(device) && canAttachAsStrip && (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="h-6 px-2 text-[10px]"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onMakeStrip();
              }}
            >
              Лента
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label="Убрать устройство с плана"
          >
            ×
          </Button>
        </div>
      )}
    </div>
  );
}
