import * as React from "react";

import type { Device, PlanDevicePosition, PlanLayout, PlanRoom, Room } from "@/lib/types";
import { Card } from "@/components/ui/card";

import { DeviceMarker } from "./DeviceMarker";
import { DeviceStrip } from "./DeviceStrip";
import { PLAN_HEIGHT, PLAN_WIDTH, roomAtPoint } from "./plan-utils";
import { RoomRect } from "./RoomRect";

type PlanCanvasProps = {
  rooms: Room[];
  devices: Device[];
  layout: PlanLayout;
  editable: boolean;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
  onChangeRoom: (room: PlanRoom) => void;
  onRemoveRoom: (roomId: string) => void;
  onChangeDevice: (position: PlanDevicePosition) => void;
  onRemoveDevice: (deviceId: string) => void;
  onMakeStrip: (deviceId: string, roomId: string) => void;
};

export function PlanCanvas({
  rooms,
  devices,
  layout,
  editable,
  selectedDeviceId,
  onSelectDevice,
  onChangeRoom,
  onRemoveRoom,
  onChangeDevice,
  onRemoveDevice,
  onMakeStrip,
}: PlanCanvasProps) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);
  const roomById = React.useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );
  const deviceById = React.useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );

  React.useEffect(() => {
    const element = wrapRef.current;
    if (!element) {
      return undefined;
    }

    const update = () => {
      const nextScale = Math.min(1, Math.max(0.45, element.clientWidth / PLAN_WIDTH));
      setScale(nextScale);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Card className="overflow-hidden bg-card/70 p-3">
      <div ref={wrapRef} className="w-full overflow-auto">
        <div
          className="relative mx-auto"
          style={{
            width: PLAN_WIDTH * scale,
            height: PLAN_HEIGHT * scale,
          }}
        >
          <div
            className="absolute origin-top-left overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            style={{
              width: PLAN_WIDTH,
              height: PLAN_HEIGHT,
              transform: `scale(${scale})`,
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklch, var(--border), transparent 64%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--border), transparent 64%) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
            onClick={() => onSelectDevice(null)}
          >
            <div className="absolute inset-0 bg-primary/[0.03]" />

            {layout.rooms.map((room) => (
              <RoomRect
                key={room.roomId}
                room={room}
                sourceRoom={roomById.get(room.roomId)}
                editable={editable}
                scale={scale}
                onChange={onChangeRoom}
                onRemove={() => onRemoveRoom(room.roomId)}
              />
            ))}

            {layout.devices.map((position) => {
              const device = deviceById.get(position.deviceId);
              if (!device) {
                return null;
              }

              if (position.visualKind === "strip" && position.attachedRoomId) {
                const attachedRoom = layout.rooms.find(
                  (room) => room.roomId === position.attachedRoomId,
                );
                if (attachedRoom) {
                  return (
                    <DeviceStrip
                      key={position.deviceId}
                      device={device}
                      room={attachedRoom}
                      editable={editable}
                      selected={selectedDeviceId === device.id}
                      position={position}
                      onSelect={() => onSelectDevice(device.id)}
                      onChange={onChangeDevice}
                      onRemove={() => onRemoveDevice(device.id)}
                    />
                  );
                }
              }

              const roomUnderMarker = roomAtPoint(layout.rooms, position.x, position.y);
              return (
                <DeviceMarker
                  key={position.deviceId}
                  device={device}
                  position={position}
                  editable={editable}
                  scale={scale}
                  selected={selectedDeviceId === device.id}
                  canAttachAsStrip={Boolean(roomUnderMarker)}
                  onSelect={() => onSelectDevice(device.id)}
                  onChange={onChangeDevice}
                  onRemove={() => onRemoveDevice(device.id)}
                  onMakeStrip={() => {
                    if (roomUnderMarker) {
                      onMakeStrip(device.id, roomUnderMarker.roomId);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
