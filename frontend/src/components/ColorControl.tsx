import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { HexColorPicker, HsvColorPicker } from "react-colorful"

import type { Capability } from "@/lib/types"
import {
  hexToHsv,
  hexToRgbInt,
  hsvToHex,
  rgbIntToHex,
  type HsvValue,
} from "@/lib/color"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface ColorControlProps {
  capability: Capability
  value: unknown
  disabled?: boolean
  onChange: (value: unknown) => void
}

const COLOR_PRESETS = [
  { label: "Белый", hex: "#ffffff" },
  { label: "Лунный", hex: "#b8cce8" },
  { label: "Тёплый", hex: "#e8ccb8" },
  { label: "Красный", hex: "#ff0000" },
  { label: "Синий", hex: "#0000ff" },
  { label: "Зелёный", hex: "#00ff00" },
] as const

export function ColorControl({
  capability,
  value,
  disabled,
  onChange,
}: ColorControlProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    const handleDismiss = () => setOpen(false)
    document.addEventListener("mousedown", handleClickOutside)
    window.addEventListener("scroll", handleDismiss, true)
    window.addEventListener("resize", handleDismiss)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("scroll", handleDismiss, true)
      window.removeEventListener("resize", handleDismiss)
    }
  }, [open])

  if (capability.colorModel === "temperature_k") {
    const kelvin = typeof value === "number" ? value : 4500
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Label className="text-muted-foreground font-normal">
            {capability.label}
          </Label>
          <span className="font-medium tabular-nums">{kelvin} K</span>
        </div>
        <Slider
          value={[kelvin]}
          min={capability.min ?? 2000}
          max={capability.max ?? 9000}
          step={capability.step ?? 100}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
          disabled={disabled}
        />
      </div>
    )
  }

  const isRgb = capability.colorModel === "rgb"
  const hsv = !isRgb
    ? ((value as HsvValue | undefined) ?? { h: 30, s: 80, v: 100 })
    : null
  const hex = isRgb
    ? rgbIntToHex(typeof value === "number" ? value : 0xffa040)
    : hsvToHex(hsv!)

  const openPicker = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(true)
  }

  const applyPreset = (presetHex: string) => {
    onChange(isRgb ? hexToRgbInt(presetHex) : hexToHsv(presetHex))
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-muted-foreground text-sm font-normal">
        {capability.label}
      </Label>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "size-8 shrink-0 rounded-md border shadow-sm transition-opacity",
          disabled && "pointer-events-none opacity-50",
        )}
        style={{ backgroundColor: hex }}
        disabled={disabled}
        aria-label="Выбрать цвет"
        onClick={() => (open ? setOpen(false) : openPicker())}
      />
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="color-picker-popover"
            style={{
              position: "fixed",
              top: position.top,
              right: position.right,
            }}
          >
            {isRgb ? (
              <HexColorPicker
                color={hex}
                onChange={(nextHex) => onChange(hexToRgbInt(nextHex))}
              />
            ) : (
              <HsvColorPicker
                color={hsv!}
                onChange={(nextHsv) => onChange(nextHsv)}
              />
            )}
            <div className="grid grid-cols-3 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.label}
                  aria-label={preset.label}
                  className={cn(
                    "aspect-square w-full rounded-md border shadow-sm transition-transform hover:scale-105",
                    hex.toLowerCase() === preset.hex && "ring-2 ring-ring ring-offset-1 ring-offset-popover",
                  )}
                  style={{ backgroundColor: preset.hex }}
                  onClick={() => applyPreset(preset.hex)}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Готово
            </Button>
          </div>,
          document.body,
        )}
    </div>
  )
}
