import type { CSSProperties } from "react";

import type { Device, PlanRoom } from "@/lib/types";

export const PLAN_WIDTH = 900;
export const PLAN_HEIGHT = 560;
export const PLAN_GRID = 24;

export function roomAtPoint(rooms: PlanRoom[], x: number, y: number) {
  return rooms.find(
    (room) =>
      x >= room.x &&
      x <= room.x + room.width &&
      y >= room.y &&
      y <= room.y + room.height,
  );
}

export function isLight(device: Device) {
  return device.type === "light";
}

export function getCapabilityValue<T = unknown>(
  device: Device,
  instance: string,
): T | undefined {
  for (const entity of device.entities) {
    const capability = entity.capabilities.find((cap) => cap.instance === instance);
    if (capability) {
      return capability.value as T;
    }
  }

  return undefined;
}

function rgbIntToParts(value: number) {
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function resolveLight(device: Device) {
  const on = Boolean(getCapabilityValue(device, "on"));
  const brightness = Number(getCapabilityValue(device, "brightness") ?? 100);
  const color = getCapabilityValue<number>(device, "color");
  const rgb = typeof color === "number" ? rgbIntToParts(color) : { r: 255, g: 214, b: 140 };

  return {
    on,
    brightness: Number.isFinite(brightness) ? Math.max(0, Math.min(100, brightness)) : 100,
    rgb,
  };
}

export function markerGlow(device: Device): CSSProperties | undefined {
  if (!isLight(device)) {
    return undefined;
  }

  const light = resolveLight(device);
  if (!device.online || !light.on) {
    return undefined;
  }

  const glow = light.brightness / 100;
  return {
    boxShadow: `0 0 ${14 + glow * 34}px ${4 + glow * 8}px rgba(${light.rgb.r}, ${light.rgb.g}, ${light.rgb.b}, ${0.3 + glow * 0.35})`,
  };
}

export function stripGlow(device: Device): CSSProperties {
  const light = resolveLight(device);
  const glow = device.online && light.on ? light.brightness / 100 : 0;
  const alpha = device.online && light.on ? 0.72 : 0.16;

  return {
    borderColor: `rgba(${light.rgb.r}, ${light.rgb.g}, ${light.rgb.b}, ${alpha})`,
    boxShadow:
      device.online && light.on
        ? `inset 0 0 ${18 + glow * 32}px ${4 + glow * 8}px rgba(${light.rgb.r}, ${light.rgb.g}, ${light.rgb.b}, ${0.22 + glow * 0.26})`
        : undefined,
  };
}
