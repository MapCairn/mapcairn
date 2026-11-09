import type {
  BasemapEngineId,
  MapAdapter,
  MapCapabilities,
  MapEngineError,
  ViewState,
} from "@karta/core";
import { createContext, useContext } from "react";

/** What {@link useMap} returns: the live map, as seen by overlays and chrome. */
export interface MapContextValue {
  /**
   * The mounted adapter, or null while the engine is starting, after it failed
   * and during server rendering. Overlays draw nothing while it is null.
   */
  readonly adapter: MapAdapter | null;
  /**
   * The element the current engine is mounted in, or null with no mounted
   * engine. A new element replaces it on every engine switch.
   */
  readonly hostElement: HTMLElement | null;
  /**
   * The current view, updated at most once per animation frame while the map
   * moves, zooms or rotates, so overlays re-project without thrashing.
   */
  readonly view: ViewState;
  /** The engine of the active basemap. Only for diagnostics; the ui branches on `capabilities`. */
  readonly engine: BasemapEngineId;
  readonly capabilities: MapCapabilities;
  /** Normalised zoom limits of the active basemap. */
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  /** True while the engine starts, the basemap changes or tiles load. */
  readonly loading: boolean;
  /** True after a tile or style request failed, until a later load succeeds without one. */
  readonly tileError: boolean;
  /** Why the engine could not start, or null. The app decides the fallback. */
  readonly error: MapEngineError | null;
  /**
   * Re-applies the active basemap after a tile error. After an engine error it
   * mounts the engine again instead.
   */
  readonly retry: () => void;
  /** Moves keyboard focus to the map region without scrolling. */
  readonly focusMap: () => void;
}

/** The map context. Provided by `MapView`; read it with {@link useMap}. */
export const MapContext = createContext<MapContextValue | null>(null);

/**
 * Returns the live map. Throws outside a `MapView`, because a missing map is a
 * wiring bug, not a runtime condition.
 */
export function useMap(): MapContextValue {
  const value = useContext(MapContext);
  if (!value) {
    throw new Error("useMap must be used inside a MapView.");
  }
  return value;
}
