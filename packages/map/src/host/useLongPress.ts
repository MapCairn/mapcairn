import type { LatLng, MapAdapter, PixelPoint } from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";

/** How long a still press must last to count as a long-press, in milliseconds. */
export const LONG_PRESS_DELAY_MS = 500;

/** How far, in CSS pixels, the pointer may wander before the press is cancelled. */
export const LONG_PRESS_TOLERANCE_PX = 10;

/** Where a long-press (or right-click) happened. */
export interface MapLongPressEvent {
  readonly latlng: LatLng;
  /** Pixels from the top-left corner of the map host. */
  readonly point: PixelPoint;
}

/** Options for {@link useLongPress}. */
export interface UseLongPressOptions {
  /** The map region element; points are measured from its top-left corner. */
  readonly hostRef: RefObject<HTMLElement | null>;
  /** Returns the mounted adapter, or null while there is none. */
  readonly getAdapter: () => MapAdapter | null;
  /** Called once per long-press. Without it, presses are ignored. */
  readonly onLongPress?: (event: MapLongPressEvent) => void;
}

/** The pointer handlers to spread on the host, plus hooks for the map engine. */
export interface UseLongPress {
  readonly handlers: {
    readonly onPointerDown: (event: ReactPointerEvent) => void;
    readonly onPointerMove: (event: ReactPointerEvent) => void;
    readonly onPointerUp: (event: ReactPointerEvent) => void;
    readonly onPointerCancel: (event: ReactPointerEvent) => void;
    readonly onContextMenu: (event: ReactMouseEvent) => void;
  };
  /** Cancels a pending press. Call it when the map moves. */
  readonly cancel: () => void;
  /**
   * Returns true, once, for the engine click that follows a long-press, so the
   * caller can drop it. A new press clears the flag, so a missing engine click
   * never swallows a later one.
   */
  readonly consumeClick: () => boolean;
}

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Long-press on the map, implemented once with pointer events so it behaves
 * the same on every engine. A press fires after {@link LONG_PRESS_DELAY_MS}
 * unless the pointer moves more than {@link LONG_PRESS_TOLERANCE_PX}, a second
 * pointer joins (pinch), the pointer is released or cancelled, or the map
 * moves (`cancel`). Right-click fires it at once and suppresses the browser's
 * context menu.
 *
 * @remarks Android raises `contextmenu` during a touch long-press as well, so a
 *   press fires at most once whichever comes first. Only the primary button
 *   starts a timed press.
 */
export function useLongPress(options: UseLongPressOptions): UseLongPress {
  const optionsRef = useLatestRef(options);
  const press = useRef<Press | null>(null);
  const pointers = useRef(new Set<number>());
  const firedForPress = useRef(false);
  const suppressClick = useRef(false);

  const api = useMemo<UseLongPress>(() => {
    const cancel = () => {
      if (press.current) {
        clearTimeout(press.current.timer);
        press.current = null;
      }
    };

    const fire = (clientX: number, clientY: number) => {
      const { hostRef, getAdapter, onLongPress } = optionsRef.current;
      const adapter = getAdapter();
      const host = hostRef.current;
      if (!adapter || !host || !onLongPress) {
        return;
      }
      const rect = host.getBoundingClientRect();
      const point = { x: clientX - rect.left, y: clientY - rect.top };
      firedForPress.current = true;
      suppressClick.current = true;
      onLongPress({ latlng: adapter.unproject(point), point });
    };

    const canFire = () =>
      Boolean(
        optionsRef.current.onLongPress && optionsRef.current.getAdapter(),
      );

    const release = (event: ReactPointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (press.current?.pointerId === event.pointerId) {
        cancel();
      }
    };

    return {
      cancel,
      consumeClick: () => {
        const suppressed = suppressClick.current;
        suppressClick.current = false;
        return suppressed;
      },
      handlers: {
        onPointerDown: (event) => {
          if (event.isPrimary) {
            pointers.current.clear();
          }
          pointers.current.add(event.pointerId);
          cancel();
          if (pointers.current.size > 1) {
            return;
          }
          firedForPress.current = false;
          suppressClick.current = false;
          if (event.button !== 0 || !canFire()) {
            return;
          }
          const { clientX, clientY } = event;
          press.current = {
            pointerId: event.pointerId,
            x: clientX,
            y: clientY,
            timer: setTimeout(() => {
              press.current = null;
              fire(clientX, clientY);
            }, LONG_PRESS_DELAY_MS),
          };
        },
        onPointerMove: (event) => {
          const current = press.current;
          if (!current || current.pointerId !== event.pointerId) {
            return;
          }
          const distance = Math.hypot(
            event.clientX - current.x,
            event.clientY - current.y,
          );
          if (distance > LONG_PRESS_TOLERANCE_PX) {
            cancel();
          }
        },
        onPointerUp: release,
        onPointerCancel: release,
        onContextMenu: (event) => {
          if (!canFire()) {
            return;
          }
          event.preventDefault();
          if (firedForPress.current) {
            return;
          }
          cancel();
          fire(event.clientX, event.clientY);
        },
      },
    };
  }, [optionsRef]);

  useEffect(() => api.cancel, [api]);

  return api;
}
