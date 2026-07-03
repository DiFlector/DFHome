import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiErrorMessage, endpoints } from "../api/client";
import type { ControlSpec, DeviceView } from "../api/types";
import ColorControl from "./controls/ColorControl";
import ModeSelect from "./controls/ModeSelect";
import SliderControl from "./controls/SliderControl";
import SwitchControl from "./controls/SwitchControl";
import { deviceTypeIcon } from "./icons";

interface Props {
  device: DeviceView;
}

export default function DeviceCard({ device }: Props) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: { control: ControlSpec; value: unknown }) =>
      endpoints.deviceAction(
        device.id,
        params.control.capability_type,
        params.control.instance,
        params.value,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home"] });
      queryClient.invalidateQueries({ queryKey: ["device", device.id] });
    },
  });

  const renderControl = (control: ControlSpec) => {
    const disabled = mutation.isPending || !device.online;
    switch (control.kind) {
      case "switch":
        return (
          <SwitchControl
            checked={Boolean(control.value)}
            disabled={disabled}
            onChange={(value) => mutation.mutate({ control, value })}
          />
        );
      case "slider":
        return (
          <SliderControl
            value={Number(control.value) || 0}
            min={control.min ?? 0}
            max={control.max ?? 100}
            step={control.precision ?? 1}
            unit={control.unit}
            disabled={disabled}
            onChange={(value) => mutation.mutate({ control, value })}
          />
        );
      case "mode":
        return (
          <ModeSelect
            value={String(control.value ?? "")}
            options={control.options ?? []}
            disabled={disabled}
            onChange={(value) => mutation.mutate({ control, value })}
          />
        );
      case "color":
        return (
          <ColorControl
            value={control.value}
            colorModel={control.color_model}
            min={control.min}
            max={control.max}
            disabled={disabled}
            onChange={(value) => mutation.mutate({ control, value })}
          />
        );
      default:
        return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>не поддерживается</span>;
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span className="icon-badge">{deviceTypeIcon(device.type, { width: 18, height: 18 })}</span>
          <div style={{ minWidth: 0 }}>
            <h3>
              <Link to={`/devices/${device.id}`}>{device.name}</Link>
            </h3>
            <div className="subtitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className={`status-dot${device.online ? "" : " offline"}`} />
              {device.type.replace("devices.types.", "")}
            </div>
          </div>
        </div>
        {!device.online && <span className="offline-badge">офлайн</span>}
      </div>

      {device.controls.map((control) => (
        <div className="control-row" key={`${control.capability_type}:${control.instance}`}>
          <label>{control.label}</label>
          {renderControl(control)}
        </div>
      ))}

      {device.properties.map((prop) => (
        <div className="property-row" key={`${prop.property_type}:${prop.instance}`}>
          <span>{prop.label}</span>
          <span>
            {String(prop.value)}
            {prop.unit || ""}
          </span>
        </div>
      ))}

      {mutation.isError && (
        <div className="banner error" style={{ marginTop: 8, marginBottom: 0 }}>
          {apiErrorMessage(mutation.error)}
        </div>
      )}
    </div>
  );
}
