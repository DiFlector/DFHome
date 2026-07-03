import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker, HsvColorPicker } from "react-colorful";
import { hexToRgbInt, hsvToHex, rgbIntToHex, type HsvValue } from "../../utils/color";

interface Props {
  value: HsvValue | number | unknown;
  colorModel?: string | null;
  min?: number | null;
  max?: number | null;
  disabled?: boolean;
  onChange: (value: HsvValue | number) => void;
}

export default function ColorControl({ value, colorModel, min, max, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Cards use backdrop-filter, which creates its own CSS stacking context —
  // a popover nested inside one card can never paint above a *different*
  // card, no matter its z-index. Rendering into a body-level portal escapes
  // that entirely instead of fighting stacking contexts with z-index.
  const openPicker = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    // Closing on scroll avoids tracking/repositioning a fixed popover while
    // its anchor moves — simplest correct behavior for a short-lived picker.
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  if (colorModel === "temperature_k") {
    const kelvin = typeof value === "number" ? value : 4500;
    return (
      <input
        type="range"
        min={min ?? 2000}
        max={max ?? 9000}
        step={100}
        value={kelvin}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }

  const isRgb = colorModel === "rgb";
  const hsv = !isRgb ? ((value as HsvValue) ?? { h: 0, s: 0, v: 100 }) : null;
  const hex = isRgb ? rgbIntToHex(typeof value === "number" ? value : 0xffffff) : null;
  const swatchColor = isRgb ? hex! : hsvToHex(hsv!);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="color-swatch"
        style={{ background: swatchColor }}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-label="Выбрать цвет"
      />
      {open &&
        createPortal(
          <div
            className="color-picker-popover"
            ref={popoverRef}
            style={{ position: "fixed", top: position.top, right: position.right }}
          >
            {isRgb ? (
              <HexColorPicker color={hex!} onChange={(newHex) => onChange(hexToRgbInt(newHex))} />
            ) : (
              <HsvColorPicker color={hsv!} onChange={(newHsv) => onChange(newHsv)} />
            )}
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              Готово
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
