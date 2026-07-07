import * as React from "react";

export type Point = { x: number; y: number };

export function snapToGrid(value: number, grid = 24) {
  return Math.round(value / grid) * grid;
}

export function usePlanDrag(
  enabled: boolean,
  getStart: () => Point,
  onMove: (point: Point) => void,
  options?: {
    grid?: number;
    scale?: number;
  },
) {
  const dragRef = React.useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    start: Point;
  } | null>(null);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        start: getStart(),
      };
    },
    [enabled, getStart],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const scale = options?.scale ?? 1;
      const grid = options?.grid ?? 24;
      const x =
        drag.start.x + (event.clientX - drag.startClientX) / Math.max(scale, 0.1);
      const y =
        drag.start.y + (event.clientY - drag.startClientY) / Math.max(scale, 0.1);

      onMove({ x: snapToGrid(x, grid), y: snapToGrid(y, grid) });
    },
    [onMove, options?.grid, options?.scale],
  );

  const stop = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: stop,
    onPointerCancel: stop,
  };
}
