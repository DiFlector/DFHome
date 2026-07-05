import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { apiErrorMessage, endpoints } from "../api/client";
import type { ControlSpec, DeviceView } from "../api/types";
import {
  hexToHsv,
  hexToRgbInt,
  hsvToHex,
  rgbIntToHex,
  type HsvValue,
} from "../utils/color";
import ModeSelect from "./controls/ModeSelect";
import SliderControl from "./controls/SliderControl";
import SwitchControl from "./controls/SwitchControl";
import { ChevronLeftIcon, SettingsIcon, deviceTypeIcon } from "./icons";

export interface PopoverAnchor {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  device: DeviceView;
  anchor: PopoverAnchor;
  onClose: () => void;
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(raw: string): string {
  return raw.startsWith("#") ? raw.toLowerCase() : `#${raw.toLowerCase()}`;
}

// Rendered into a body-level portal for the same reason as the color picker
// popover: .plan-canvas has overflow + backdrop-filter (its own stacking
// context and clip box), so an absolutely positioned child could never
// escape it. Fixed positioning against the marker's viewport rect can.
export default function DevicePopover({ device, anchor, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"main" | "settings">("main");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
  });

  const onOff = device.controls.find(
    (c) => c.capability_type === "devices.capabilities.on_off",
  );
  const brightness = device.controls.find(
    (c) => c.kind === "slider" && c.instance === "brightness",
  );
  const colorControl = device.controls.find(
    (c) => c.kind === "color" && (c.color_model === "hsv" || c.color_model === "rgb"),
  );
  const tempControl = device.controls.find(
    (c) => c.kind === "color" && c.color_model === "temperature_k",
  );
  const otherControls = device.controls.filter(
    (c) => c !== onOff && c !== brightness && c !== colorControl && c !== tempControl,
  );
  const hasSettings =
    Boolean(brightness || colorControl || tempControl) || otherControls.length > 0;

  const [colorTab, setColorTab] = useState<"color" | "temperature">(
    colorControl ? "color" : "temperature",
  );

  const deviceHex = colorControl
    ? colorControl.color_model === "rgb"
      ? rgbIntToHex(typeof colorControl.value === "number" ? colorControl.value : 0xffffff)
      : hsvToHex((colorControl.value as HsvValue) ?? { h: 0, s: 0, v: 100 })
    : "#ffffff";
  const [draftHex, setDraftHex] = useState(deviceHex);
  const [hexInput, setHexInput] = useState(deviceHex);

  const disabled = mutation.isPending || !device.online;

  // The settings view is taller than the main one, so re-clamp against the
  // viewport whenever the view (and thus the popover's size) changes.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 10;
    const gap = 12;
    let left = anchor.left + anchor.width + gap;
    if (left + width > window.innerWidth - margin) {
      left = anchor.left - width - gap;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = anchor.top + anchor.height / 2 - height / 2;
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    setPos({ top, left });
  }, [anchor, view, device.controls.length, device.properties.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // The anchor rect is a snapshot: scrolling the page or the plan canvas
    // moves the marker out from under the popover, so just close instead of
    // tracking it. Scrolls inside the popover itself are fine.
    const handleScroll = (e: Event) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const onHexInput = (raw: string) => {
    setHexInput(raw);
    if (HEX_RE.test(raw)) setDraftHex(normalizeHex(raw));
  };

  const applyColor = () => {
    if (!colorControl) return;
    const value =
      colorControl.color_model === "rgb" ? hexToRgbInt(draftHex) : hexToHsv(draftHex);
    mutation.mutate({ control: colorControl, value });
  };

  const renderOtherControl = (control: ControlSpec) => {
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
      default:
        return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>не поддерживается</span>;
    }
  };

  const showTabs = Boolean(colorControl && tempControl);
  const activeTab = colorControl && tempControl ? colorTab : colorControl ? "color" : "temperature";

  return createPortal(
    <div
      className="device-popover"
      ref={popoverRef}
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: anchor.top, left: anchor.left, visibility: "hidden" }
      }
    >
      <div className="device-popover-header">
        {view === "settings" ? (
          <button
            type="button"
            className="device-popover-icon-btn"
            onClick={() => setView("main")}
            aria-label="Назад"
          >
            <ChevronLeftIcon width={15} height={15} />
          </button>
        ) : (
          <span className="icon-badge">{deviceTypeIcon(device.type, { width: 16, height: 16 })}</span>
        )}
        <div className="device-popover-title">
          <h3>{view === "settings" ? "Настройки" : device.name}</h3>
          <div className="subtitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={`status-dot${device.online ? "" : " offline"}`} />
            {view === "settings" ? device.name : device.type.replace("devices.types.", "")}
          </div>
        </div>
        {view === "main" && hasSettings && (
          <button
            type="button"
            className="device-popover-icon-btn"
            onClick={() => setView("settings")}
            aria-label="Настройки устройства"
          >
            <SettingsIcon width={15} height={15} />
          </button>
        )}
        <button
          type="button"
          className="device-popover-icon-btn"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      {!device.online && <span className="offline-badge">офлайн</span>}

      {view === "main" ? (
        <>
          {onOff && (
            <div className="control-row" style={{ marginBottom: 0 }}>
              <label>{onOff.label}</label>
              <SwitchControl
                checked={Boolean(onOff.value)}
                disabled={disabled}
                onChange={(value) => mutation.mutate({ control: onOff, value })}
              />
            </div>
          )}
          {device.properties.map((prop) => (
            <div className="property-row" key={`${prop.property_type}:${prop.instance}`}>
              <span>{prop.label}</span>
              <span>
                {String(prop.value)}
                {prop.unit || ""}
              </span>
            </div>
          ))}
          {!onOff && device.properties.length === 0 && (
            <p className="device-popover-empty">Нет данных</p>
          )}
        </>
      ) : (
        <>
          {brightness && (
            <div className="device-popover-section">
              <label className="device-popover-label">
                Яркость <span>({Number(brightness.value) || 0}{brightness.unit || "%"})</span>
              </label>
              <div className="control-row" style={{ marginBottom: 0 }}>
                <SliderControl
                  value={Number(brightness.value) || 0}
                  min={brightness.min ?? 1}
                  max={brightness.max ?? 100}
                  step={brightness.precision ?? 1}
                  unit={brightness.unit}
                  disabled={disabled}
                  onChange={(value) => mutation.mutate({ control: brightness, value })}
                />
              </div>
            </div>
          )}

          {showTabs && (
            <div className="popover-tabs">
              <button
                type="button"
                className={`popover-tab${activeTab === "color" ? " active" : ""}`}
                onClick={() => setColorTab("color")}
              >
                Цвет
              </button>
              <button
                type="button"
                className={`popover-tab${activeTab === "temperature" ? " active" : ""}`}
                onClick={() => setColorTab("temperature")}
              >
                Температура
              </button>
            </div>
          )}

          {colorControl && activeTab === "color" && (
            <div className="device-popover-section">
              {!showTabs && <label className="device-popover-label">Цвет</label>}
              <HexColorPicker color={draftHex} onChange={onHexInput} />
              <div className="hex-input-row">
                <span className="hex-preview" style={{ background: draftHex }} />
                <input
                  type="text"
                  value={hexInput}
                  spellCheck={false}
                  placeholder="#ffaa00"
                  onChange={(e) => onHexInput(e.target.value)}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={disabled || !HEX_RE.test(hexInput)}
                  onClick={applyColor}
                >
                  Применить
                </button>
              </div>
            </div>
          )}

          {tempControl && activeTab === "temperature" && (
            <div className="device-popover-section">
              {!showTabs && <label className="device-popover-label">Температура</label>}
              <div className="control-row" style={{ marginBottom: 0 }}>
                <SliderControl
                  value={typeof tempControl.value === "number" ? tempControl.value : 4500}
                  min={tempControl.min ?? 2000}
                  max={tempControl.max ?? 9000}
                  step={100}
                  unit="K"
                  disabled={disabled}
                  onChange={(value) => mutation.mutate({ control: tempControl, value })}
                />
              </div>
            </div>
          )}

          {otherControls.map((control) => (
            <div className="control-row" key={`${control.capability_type}:${control.instance}`} style={{ marginBottom: 0 }}>
              <label>{control.label}</label>
              {renderOtherControl(control)}
            </div>
          ))}
        </>
      )}

      {mutation.isError && (
        <div className="banner error" style={{ margin: 0 }}>
          {apiErrorMessage(mutation.error)}
        </div>
      )}
    </div>,
    document.body,
  );
}
