"use client";

import { type TouchEvent, useCallback, useRef } from "react";

/** Dismiss a left-side mobile drawer with a deliberate leftward swipe.
 * Vertical scrolling and short taps are unaffected. */
export function useSidebarSwipeClose(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    start.current =
      event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  }, []);
  const onTouchEnd = useCallback(
    (event: TouchEvent<HTMLElement>) => {
      const origin = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!origin || !touch) return;
      const deltaX = touch.clientX - origin.x;
      const deltaY = touch.clientY - origin.y;
      if (deltaX < -80 && Math.abs(deltaX) > 1.5 * Math.abs(deltaY)) onClose();
    },
    [onClose],
  );
  const onTouchCancel = useCallback(() => {
    start.current = null;
  }, []);
  return { onTouchStart, onTouchEnd, onTouchCancel };
}
