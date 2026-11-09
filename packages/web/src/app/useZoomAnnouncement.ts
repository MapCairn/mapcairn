import { announceZoom } from "@karta/core";
import { type MapContextValue, useAnnounce } from "@karta/map";
import { useLatestRef } from "@karta/react";
import { useCallback, useEffect, useRef } from "react";

/** How long the zoom must settle before its level is announced. */
export const ZOOM_ANNOUNCE_DELAY_MS = 600;

/**
 * Announces the settled zoom level, politely and once, after every zoom the
 * person makes: the zoom buttons (call the returned function), and, through
 * `map.onUserZoom`, the zoom keys on the map region and the engine's own
 * gestures (wheel, pinch, double-click or double-tap). Zooms made in code,
 * such as restoring a permalink, flying to a search result or a basemap's
 * zoom limits, are never announced.
 *
 * @remarks Each user zoom restarts a {@link ZOOM_ANNOUNCE_DELAY_MS} timer,
 *   and so does any zoom change while one is waiting (a button's animation),
 *   so a gesture of many steps is read once, at its final level. The request
 *   ends when it is announced, so a later change made in code stays silent.
 *   The shared announcer also drops a repeat of the same message.
 */
export function useZoomAnnouncement(
  map: Pick<MapContextValue, "view" | "onUserZoom">,
): () => void {
  const announce = useAnnounce();
  const zoom = map.view.zoom;
  const zoomRef = useLatestRef(zoom);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const request = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      announce(announceZoom(zoomRef.current));
    }, ZOOM_ANNOUNCE_DELAY_MS);
  }, [announce, zoomRef]);

  useEffect(() => map.onUserZoom(request), [map.onUserZoom, request]);

  // While a request waits, the zoom still moving pushes it back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the zoom is the trigger; the request reads it through a ref.
  useEffect(() => {
    if (timer.current !== null) {
      request();
    }
  }, [zoom, request]);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return request;
}
