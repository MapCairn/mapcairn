// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapAdapter,
  MapEngineError,
  MapProjection,
  ViewState,
} from "@mapcairn/core";
import { createContext, useContext } from "react";

/** What {@link useMap} returns: the live map, as seen by overlays and chrome. */
export interface MapContextValue {
  /**
   * The mounted adapter, or null while the engine is starting, after it failed
   * and during server rendering. Overlays draw nothing while it is null.
   */
  readonly adapter: MapAdapter | null;
  /**
   * The element the engine is mounted in, or null with no mounted engine.
   * A new element replaces it when a failed mount is retried.
   */
  readonly hostElement: HTMLElement | null;
  /**
   * The current view, updated at most once per animation frame while the map
   * moves, zooms or rotates, so overlays re-project without thrashing.
   */
  readonly view: ViewState;
  /**
   * The shape the map is drawn as, from the settings: flat or a globe.
   * Overlays read it to curve long lines and hide the far side.
   */
  readonly projection: MapProjection;
  /** Normalised zoom limits of the active basemap. */
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  /** True while the engine starts, the basemap changes or tiles load. */
  readonly loading: boolean;
  /** True after a tile or style request failed, until a later load succeeds without one. */
  readonly tileError: boolean;
  /**
   * Why the engine could not start, or why it stopped after it loaded
   * (reason `stopped`), or null. The app decides the fallback.
   */
  readonly error: MapEngineError | null;
  /**
   * Re-applies the active basemap after a tile error. After an engine error it
   * mounts the engine again instead.
   */
  readonly retry: () => void;
  /** Moves keyboard focus to the map region without scrolling. */
  readonly focusMap: () => void;
  /**
   * Calls `listener` each time the person zooms the map itself: with the
   * zoom keys on the map region, or with a gesture the engine handles (a
   * wheel, a pinch, a double-click). Zooms made in code, such as restoring a
   * permalink or applying a basemap's limits, never call it. Returns the
   * function that unsubscribes.
   */
  readonly onUserZoom: (listener: () => void) => () => void;
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
