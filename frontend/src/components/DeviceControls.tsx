import type { Capability, Device, Property } from "@/lib/types";
import { ColorControl } from "@/components/ColorControl";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type CapabilityChangeHandler = (
  deviceId: string,
  entityId: string,
  instance: string,
  value: unknown,
) => void;

type DeviceControlsProps = {
  device: Device;
  onCapabilityChange: CapabilityChangeHandler;
  className?: string;
};

function PropertyRow({ property }: { property: Property }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{property.label}</span>
      <span className="font-medium tabular-nums">
        {property.value === null ? "—" : property.value}
        {property.value !== null && property.unit ? ` ${property.unit}` : ""}
      </span>
    </div>
  );
}

function CapabilityControl({
  device,
  entityId,
  capability,
  disabled,
  onChange,
}: {
  device: Device;
  entityId: string;
  capability: Capability;
  disabled: boolean;
  onChange: CapabilityChangeHandler;
}) {
  const handleChange = (value: unknown) => {
    onChange(device.id, entityId, capability.instance, value);
  };

  if (capability.kind === "switch") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-sm font-normal">
          {capability.label}
        </Label>
        <Switch
          checked={Boolean(capability.value)}
          onCheckedChange={handleChange}
          disabled={disabled}
        />
      </div>
    );
  }

  if (capability.kind === "slider") {
    const value = typeof capability.value === "number" ? capability.value : 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Label className="text-muted-foreground font-normal">
            {capability.label}
          </Label>
          <span className="font-medium tabular-nums">
            {value}
            {capability.unit ?? ""}
          </span>
        </div>
        <Slider
          value={[value]}
          min={capability.min ?? 0}
          max={capability.max ?? 100}
          step={capability.step ?? 1}
          onValueChange={(nextValue) =>
            handleChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)
          }
          disabled={disabled}
        />
      </div>
    );
  }

  if (capability.kind === "mode") {
    const value =
      typeof capability.value === "string"
        ? capability.value
        : (capability.options?.[0] ?? "");
    return (
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground text-sm font-normal">
          {capability.label}
        </Label>
        <Select value={value} onValueChange={handleChange} disabled={disabled}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(capability.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (capability.kind === "color") {
    return (
      <ColorControl
        capability={capability}
        value={capability.value}
        disabled={disabled}
        onChange={handleChange}
      />
    );
  }

  return null;
}

export function DeviceControls({
  device,
  onCapabilityChange,
  className,
}: DeviceControlsProps) {
  const disabled = !device.online;
  const capabilities = device.entities.flatMap((entity) =>
    entity.capabilities.map((capability) => ({
      entityId: entity.id,
      capability,
    })),
  );
  const properties = device.entities.flatMap((entity) => entity.properties);

  if (capabilities.length === 0 && properties.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-sm", className)}>
        Нет доступных функций
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {capabilities.map(({ entityId, capability }) => (
        <CapabilityControl
          key={`${entityId}:${capability.instance}`}
          device={device}
          entityId={entityId}
          capability={capability}
          disabled={disabled}
          onChange={onCapabilityChange}
        />
      ))}
      {properties.length > 0 && (
        <div className="space-y-1.5">
          {properties.map((property) => (
            <PropertyRow
              key={`${device.id}:${property.instance}`}
              property={property}
            />
          ))}
        </div>
      )}
    </div>
  );
}
