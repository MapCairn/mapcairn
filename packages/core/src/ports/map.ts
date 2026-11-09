import type { BasemapDefinition } from "./basemap";
import type { MapEngineError } from "./errors";
import type { Bounds, LatLng, PixelPoint, ViewState } from "./geometry";

/**
 * The part of an HTML element the map adapters need. A structural subset of
 * `HTMLElement`, so this port names no DOM type.
 */
export interface MapHostElement {
  focus(options?: { preventScroll?: boolean }): void;
  getBoundingClientRect(): {
    readonly width: number;
    readonly height: number;
    readonly left: number;
    readonly top: number;
  };
}

/** Everything the adapter needs when it mounts. */
export interface MapMountOptions {
  readonly view: ViewState;
  readonly basemap: BasemapDefinition;
  /** When true, the engine's own animation (zoom, fade, fly, inertia) is off. */
  readonly reducedMotion: boolean;
}

/** Options for moving the view. */
export interface MapMoveOptions {
  /** Defaults to true. Ignored when animation is disabled. */
  readonly animate?: boolean;
}

/** Options for {@link MapAdapter.fitBounds}. */
export interface MapFitOptions extends MapMoveOptions {
  /** Pixels of space to keep clear on each edge. */
  readonly padding?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** Normalised zoom the fit never goes beyond. */
  readonly maxZoom?: number;
}

/** A pointer click on the map. */
export interface MapClickEvent {
  readonly latlng: LatLng;
  readonly point: PixelPoint;
  /** Opaque descriptions of the rendered features under the pointer. */
  readonly features?: readonly Readonly<Record<string, unknown>>[];
}

/** The events a map adapter emits, with their payloads. */
export interface MapEvents {
  /** The view is changing (fires continuously while moving). */
  move: ViewState;
  /** The view stopped changing. */
  moveEnd: ViewState;
  /** The normalised zoom changed. */
  zoom: ViewState;
  /**
   * The person zoomed with a gesture the engine handles itself: a wheel or
   * trackpad, a pinch, or a double-click or double-tap. Fires as the zoom
   * changes, with the new view, as well as `zoom`. A change made in code
   * (`setView`, `zoomIn`, `fitBounds`, `setBasemap` and the rest) never
   * fires it.
   */
  userZoom: ViewState;
  /** The bearing changed. */
  rotate: ViewState;
  click: MapClickEvent;
  /** The first frame of the current basemap is ready. */
  load: undefined;
  /** True while tiles or the style are loading, false when everything has loaded. */
  loading: boolean;
  /** A tile or style request failed. The map still works. */
  tileError: undefined;
  /**
   * The engine stopped working after it had loaded (for example its worker
   * failed), so the map can no longer draw. The error's reason is
   * `stopped`. A failed tile or source is a `tileError` instead, and a
   * failed `mount` or `setBasemap` rejects its promise.
   */
  fatalError: MapEngineError;
}

/**
 * The map engine, seen from the ui. The MapLibre adapter implements this in
 * its own module, and nothing outside that module may name an engine class,
 * event or DOM node. The port is the boundary between the ui and the engine,
 * and lets the ui run against an in-memory fake in tests.
 *
 * @remarks Keyboard handling and long-press are implemented once in the ui and
 *   call the methods below. {@link MapAdapter.setKeyboardEnabled} turns the
 *   engine's own key handling off for that reason.
 */
export interface MapAdapter {
  /**
   * Creates the engine inside `host`. Rejects with a `MapEngineError` when the
   * engine cannot start (for example, no WebGL).
   */
  mount(host: MapHostElement, options: MapMountOptions): Promise<void>;
  /** Removes the engine and every listener it added. Safe to call twice. */
  destroy(): void;

  getView(): ViewState;
  setView(view: Partial<ViewState>, options?: MapMoveOptions): void;
  zoomIn(options?: MapMoveOptions): void;
  zoomOut(options?: MapMoveOptions): void;
  /** Moves the view by a number of screen pixels (positive x is right, positive y is down). */
  panBy(dx: number, dy: number, options?: MapMoveOptions): void;
  /** Rotates by degrees clockwise. */
  rotateBy(degrees: number, options?: MapMoveOptions): void;
  /** Sets the bearing to north. */
  resetBearing(options?: MapMoveOptions): void;
  fitBounds(bounds: Bounds, options?: MapFitOptions): void;

  /** Normalised zoom limits of the active basemap. */
  getMinZoom(): number;
  getMaxZoom(): number;

  project(latlng: LatLng): PixelPoint;
  unproject(point: PixelPoint): LatLng;
  /** Ground resolution at a latitude (defaults to the view centre) at the current zoom. */
  metresPerPixel(lat?: number): number;

  /**
   * Swaps the basemap, keeping the view. Resolves once the new basemap's
   * style has loaded. If it cannot load, rejects with a `MapEngineError` and
   * leaves the previous basemap and its zoom limits in place, so the map
   * keeps working.
   */
  setBasemap(basemap: BasemapDefinition): Promise<void>;
  /** Turns every engine animation on or off (reduced motion). */
  setAnimationEnabled(enabled: boolean): void;
  /** Turns the engine's own keyboard handling on or off. */
  setKeyboardEnabled(enabled: boolean): void;
  /** Moves keyboard focus to the map host. */
  focus(): void;

  /** Subscribes to an event. Returns the unsubscribe function. */
  on<K extends keyof MapEvents>(
    event: K,
    handler: (payload: MapEvents[K]) => void,
  ): () => void;
}

/**
 * Builds a fresh, unmounted map adapter. The composition root supplies this,
 * so the ui gets an engine without importing one.
 */
export type MapAdapterFactory = () => MapAdapter;
