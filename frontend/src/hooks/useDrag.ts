import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Pointer-capture-based drag: works for both moving (x/y) and resizing
 * (width/height) since both are just "two numbers that change by the same
 * delta the pointer moved". Pointer capture keeps events flowing to the
 * element even if the cursor leaves it mid-drag — no document-level
 * listeners needed. */
export function useDrag(
  enabled: boolean,
  getStart: () => { x: number; y: number },
  onChange: (x: number, y: number) => void,
) {
  const state = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = getStart();
    state.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!state.current) return;
    const dx = e.clientX - state.current.startX;
    const dy = e.clientY - state.current.startY;
    onChange(state.current.origX + dx, state.current.origY + dy);
  };

  const onPointerUp = () => {
    state.current = null;
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
