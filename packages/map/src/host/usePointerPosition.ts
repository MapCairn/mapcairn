// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng, MapAdapter } from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";

/** Options for {@link usePointerPosition}. */
export interface UsePointerPositionOptions {
  /** The map region; positions are measured from its top-left corner. */
  readonly hostRef: RefObject<HTMLElement | null>;
  /** Returns the mounted adapter, or null while there is none. */
  readonly getAdapter: () => MapAdapter | null;
  /** Receives the position under a mouse or pen, or null when it leaves the map. */
  readonly onPointerMove?: (latlng: LatLng | null) => void;
}

/** The handlers to spread on the map region. */
export interface UsePointerPosition {
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerLeave: (event: ReactPointerEvent) => void;
}

/**
 * Reports the geographic position under a mouse or pen, at most once per
 * animation frame, for the cursor coordinates readout. Touch is ignored,
 * because a finger has no hover position. Leaving the map reports null and
 * drops any pending frame.
 */
export function usePointerPosition(
  options: UsePointerPositionOptions,
): UsePointerPosition {
  const optionsRef = useLatestRef(options);
  const frame = useRef(0);
  const client = useRef({ x: 0, y: 0 });

  const handlers = useMemo<UsePointerPosition>(() => {
    const report = () => {
      frame.current = 0;
      const { hostRef, getAdapter, onPointerMove } = optionsRef.current;
      const adapter = getAdapter();
      const host = hostRef.current;
      if (!adapter || !host || !onPointerMove) {
        return;
      }
      const rect = host.getBoundingClientRect();
      onPointerMove(
        adapter.unproject({
          x: client.current.x - rect.left,
          y: client.current.y - rect.top,
        }),
      );
    };
    return {
      onPointerMove: (event) => {
        if (
          event.pointerType === "touch" ||
          !optionsRef.current.onPointerMove
        ) {
          return;
        }
        client.current = { x: event.clientX, y: event.clientY };
        if (frame.current === 0) {
          frame.current = requestAnimationFrame(report);
        }
      },
      onPointerLeave: (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        optionsRef.current.onPointerMove?.(null);
      },
    };
  }, [optionsRef]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  return handlers;
}
