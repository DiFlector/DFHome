import { Pin, WifiOff, X } from "lucide-react";

import type { Device, PlanDevicePosition, PlanRoom } from "@/lib/types";
import { Button } from "@/components/ui/button";

import { stripGlow } from "./plan-utils";

type DeviceStripProps = {
  device: Device;
  room: PlanRoom;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (position: PlanDevicePosition) => void;
  position: PlanDevicePosition;
  onRemove: () => void;
};

export function DeviceStrip({
  device,
  room,
  editable,
  selected,
  onSelect,
  onChange,
  position,
  onRemove,
}: DeviceStripProps) {
  return (
    <div
      className={[
        "pointer-events-none absolute z-10 rounded-xl border-2 transition",
        selected ? "ring-2 ring-primary/35" : "",
        !device.online ? "opacity-55" : "",
      ].join(" ")}
      style={{
        left: room.x,
        top: room.y,
        width: room.width,
        height: room.height,
        ...stripGlow(device),
      }}
    >
      <button
        type="button"
        className="pointer-events-auto absolute -top-3 left-4 flex max-w-48 items-center gap-1 rounded-full border bg-popover px-2 py-1 text-[10px] font-medium text-foreground shadow"
        title={device.name}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        {!device.online ? <WifiOff className="size-3" /> : <span className="size-2 rounded-full bg-primary" />}
        <span className="truncate">{device.name}</span>
      </button>

      {editable && (
        <span className="pointer-events-auto absolute -top-3 right-4 flex gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            title="Вернуть точечный маркер"
            onClick={(event) => {
              event.stopPropagation();
              onChange({
                ...position,
                visualKind: "bulb",
                attachedRoomId: null,
                x: room.x + room.width / 2,
                y: room.y + room.height / 2,
              });
            }}
            aria-label="Вернуть точечный маркер"
          >
            <Pin className="size-3" />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label="Убрать устройство с плана"
          >
            <X className="size-3" />
          </Button>
        </span>
      )}
    </div>
  );
}
