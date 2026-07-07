import { RotateCcw, Save, SquareDashedMousePointer } from "lucide-react";

import type { Device, Room } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type PlanToolbarProps = {
  editable: boolean;
  availableRooms: Room[];
  availableDevices: Device[];
  onEditableChange: (value: boolean) => void;
  onAddRoom: (roomId: string) => void;
  onAddDevice: (deviceId: string) => void;
  onSave: () => void;
  onReset: () => void;
};

export function PlanToolbar({
  editable,
  availableRooms,
  availableDevices,
  onEditableChange,
  onAddRoom,
  onAddDevice,
  onSave,
  onReset,
}: PlanToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/70 p-2 shadow-sm backdrop-blur">
      <div className="mr-2 flex items-center gap-2 px-2">
        <SquareDashedMousePointer className="size-4 text-muted-foreground" />
        <span className="text-sm">Редактировать</span>
        <Switch checked={editable} onCheckedChange={onEditableChange} />
      </div>

      <Select
        value=""
        onValueChange={(value) => {
          if (value) {
            onAddRoom(value);
          }
        }}
        disabled={!editable || availableRooms.length === 0}
      >
        <SelectTrigger size="sm" className="min-w-40">
          <SelectValue placeholder="Добавить комнату" />
        </SelectTrigger>
        <SelectContent>
          {availableRooms.map((room) => (
            <SelectItem key={room.id} value={room.id}>
              {room.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value=""
        onValueChange={(value) => {
          if (value) {
            onAddDevice(value);
          }
        }}
        disabled={!editable || availableDevices.length === 0}
      >
        <SelectTrigger size="sm" className="min-w-44">
          <SelectValue placeholder="Добавить устройство" />
        </SelectTrigger>
        <SelectContent>
          {availableDevices.map((device) => (
            <SelectItem key={device.id} value={device.id}>
              {device.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onSave}>
          <Save className="size-4" />
          Сохранить
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" />
          Сбросить
        </Button>
      </div>
    </div>
  );
}
