import { useRafScheduledValue } from "@karta/map";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { resolveSheetDetent, type SheetDetent } from "../stores/useMapUiStore";

const DRAG_THRESHOLD_PX = 36;
const DRAG_MIN_VELOCITY_DELTA_PX = 12;
const DRAG_PREVIEW_LIMIT_PX = 96;
const PROJECTION_DECELERATION = 0.992;
const VELOCITY_SAMPLE_WINDOW_MS = 140;

interface PointerSample {
  timestamp: number;
  y: number;
}

interface UseSheetGestureOptions {
  isDesktopViewport: boolean;
  detent: SheetDetent;
  setDetent: (detent: SheetDetent) => void;
  close: () => void;
}

function pruneStalePointerSamples(samples: PointerSample[], now: number) {
  while (samples.length > 1) {
    const oldest = samples[0];
    if (!oldest || now - oldest.timestamp <= VELOCITY_SAMPLE_WINDOW_MS) {
      break;
    }
    samples.shift();
  }
}

function projectSheetDragDelta(
  delta: number,
  firstSample: PointerSample,
  lastSample: PointerSample,
): number {
  const elapsedMs = Math.max(1, lastSample.timestamp - firstSample.timestamp);
  const velocityPxPerSecond =
    ((lastSample.y - firstSample.y) / elapsedMs) * 1000;
  return (
    delta +
    (velocityPxPerSecond / 1000) *
      (PROJECTION_DECELERATION / (1 - PROJECTION_DECELERATION))
  );
}

function isDeliberateSheetDrag(delta: number, projectedDelta: number): boolean {
  return (
    Math.abs(delta) >= DRAG_THRESHOLD_PX ||
    (Math.abs(delta) >= DRAG_MIN_VELOCITY_DELTA_PX &&
      Math.abs(projectedDelta) >= DRAG_THRESHOLD_PX)
  );
}

function nextDetent(
  current: SheetDetent,
  projectedDelta: number,
): SheetDetent | null {
  return resolveSheetDetent(current, projectedDelta);
}

/** Owns pointer sampling and snap transitions for the mobile map sheet. */
export function useSheetGesture({
  isDesktopViewport,
  detent,
  setDetent,
  close,
}: UseSheetGestureOptions) {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const suppressNextClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { schedule, cancel } = useRafScheduledValue(setDragOffset);

  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    };
  }, []);

  const dragDirection =
    dragOffset < -4 ? "up" : dragOffset > 4 ? "down" : "none";

  function onHandleClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
        suppressClickTimerRef.current = null;
      }
      return;
    }
    if (isDesktopViewport) {
      return;
    }
    setDetent(detent === "full" ? "half" : detent === "half" ? "full" : "half");
  }

  function onHandlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (
      isDesktopViewport ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    const handle = event.currentTarget;
    const startY = event.clientY;
    let latestY = startY;
    const samples = [{ timestamp: performance.now(), y: startY }];
    activePointerIdRef.current = event.pointerId;
    setDragging(true);
    schedule(0);
    handle.setPointerCapture(event.pointerId);

    function onPointerMove(pointerEvent: globalThis.PointerEvent) {
      if (pointerEvent.pointerId !== activePointerIdRef.current) {
        return;
      }
      latestY = pointerEvent.clientY;
      const now = performance.now();
      samples.push({ timestamp: now, y: latestY });
      pruneStalePointerSamples(samples, now);
      const delta = Math.max(
        -DRAG_PREVIEW_LIMIT_PX,
        Math.min(DRAG_PREVIEW_LIMIT_PX, latestY - startY),
      );
      schedule(delta);
    }

    function cleanup() {
      cleanupRef.current = null;
      setDragging(false);
      schedule(0);
      activePointerIdRef.current = null;
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointercancel", cleanup);
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }

    function onPointerUp(pointerEvent: globalThis.PointerEvent) {
      if (pointerEvent.pointerId !== activePointerIdRef.current) {
        return;
      }
      const now = performance.now();
      samples.push({ timestamp: now, y: pointerEvent.clientY });
      pruneStalePointerSamples(samples, now);
      const firstSample = samples[0];
      const lastSample = samples[samples.length - 1];
      if (!firstSample || !lastSample) {
        cleanup();
        return;
      }
      const delta = latestY - startY;
      const projectedDelta = projectSheetDragDelta(
        delta,
        firstSample,
        lastSample,
      );
      if (!isDeliberateSheetDrag(delta, projectedDelta)) {
        cleanup();
        return;
      }
      suppressNextClickRef.current = true;
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = false;
        suppressClickTimerRef.current = null;
      }, 0);
      const resolvedDetent = nextDetent(detent, projectedDelta);
      if (resolvedDetent === null) {
        close();
      } else {
        setDetent(resolvedDetent);
      }
      cleanup();
    }

    cleanupRef.current = cleanup;
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointercancel", cleanup);
  }

  return {
    dragOffset,
    dragging,
    dragDirection,
    onHandleClick,
    onHandlePointerDown,
  };
}
