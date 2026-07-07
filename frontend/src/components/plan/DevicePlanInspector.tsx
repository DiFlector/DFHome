import { MapPin, Unlink } from "lucide-react";

import type {
  Device,
  PlanDevicePosition,
  PlanRoom,
  Room,
} from "@/lib/types";
import { DeviceControls } from "@/components/DeviceControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import { isLight } from "./plan-utils";

type DevicePlanInspectorProps = {
  device?: Device;
  position?: PlanDevicePosition;
  rooms: Room[];
  planRooms: PlanRoom[];
  onChange: (position: PlanDevicePosition) => void;
  onCapabilityChange: (
    deviceId: string,
    entityId: string,
    instance: string,
    value: unknown,
  ) => void;
  onClear: () => void;
};

const typeLabel: Record<Device["type"], string> = {
  light: "Источник света",
  switch: "Выключатель",
  socket: "Розетка",
  sensor: "Датчик",
  thermostat: "Термостат",
  media_device: "Медиаустройство",
  other: "Устройство",
};

const visualKindLabel: Record<PlanDevicePosition["visualKind"], string> = {
  bulb: "Лампочка",
  strip: "Лента по комнате",
};

export function DevicePlanInspector({
  device,
  position,
  rooms,
  planRooms,
  onChange,
  onCapabilityChange,
  onClear,
}: DevicePlanInspectorProps) {
  if (!device || !position) {
    return (
      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-base">Устройство</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Выберите маркер или ленту на плане, чтобы изменить отображение.
        </CardContent>
      </Card>
    );
  }

  const availableRooms = planRooms
    .map((planRoom) => rooms.find((room) => room.id === planRoom.roomId))
    .filter((room): room is Room => Boolean(room));
  const roomName = rooms.find((room) => room.id === device.roomId)?.name ?? "Без комнаты";

  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-3 text-base">
          <span className="min-w-0 truncate">{device.name}</span>
          <Badge variant={device.online ? "secondary" : "outline"} className="font-normal">
            {device.online ? "online" : "offline"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4" />
            <span>
              {Math.round(position.x)}, {Math.round(position.y)}
            </span>
          </div>
          <div className="text-muted-foreground">
            {typeLabel[device.type]} · {roomName}
          </div>
        </div>

        <DeviceControls
          device={device}
          onCapabilityChange={onCapabilityChange}
        />

        {isLight(device) && (
          <>
            <div className="space-y-2">
              <span className="text-sm font-medium">Отображение на плане</span>
              <Select
                value={position.visualKind}
                onValueChange={(value) =>
                  onChange({
                    ...position,
                    visualKind: value as PlanDevicePosition["visualKind"],
                    attachedRoomId:
                      value === "strip"
                        ? position.attachedRoomId ?? availableRooms[0]?.id ?? null
                        : null,
                  })
                }
              >
                <SelectTrigger>
                  <span>{visualKindLabel[position.visualKind]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bulb">Лампочка</SelectItem>
                  <SelectItem value="strip">Лента по комнате</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {position.visualKind === "strip" && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Комната для ленты</span>
                <Select
                  value={position.attachedRoomId ?? ""}
                  onValueChange={(roomId) =>
                    onChange({ ...position, attachedRoomId: roomId })
                  }
                >
                  <SelectTrigger>
                    <span>
                      {rooms.find((room) => room.id === position.attachedRoomId)
                        ?.name ?? "Выберите комнату"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableRooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <Unlink className="size-4" />
          Снять выбор
        </Button>
      </CardContent>
    </Card>
  );
}
