import { useServices } from "@mapcairn/map";
import { useRef } from "react";

/**
 * Asks the map adapter factory to start fetching the engine on the first
 * render of the component that calls it, once.
 *
 * @remarks The map mounts in an effect, which runs only after the whole app
 *   below it has rendered. Calling this at the top of the app lets the
 *   engine's download run during that render instead of after it. It runs
 *   during render, not in an effect, because an effect here would run after
 *   the same render; `preload` only starts a shared, cached fetch, so a
 *   repeated call (as under Strict Mode) costs nothing.
 */
export function usePreloadMapEngine(): void {
  const { createMapAdapter } = useServices();
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    createMapAdapter.preload?.();
  }
}
