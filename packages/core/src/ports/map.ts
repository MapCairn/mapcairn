import type { BasemapDefinition } from "./basemap";
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

/** What a map engine can do. The ui branches on these, never on an engine name. */
export interface MapCapabilities {
  /** The map can be rotated, so a compass and rotation keys make sense. */
  readonly supportsRotation: boolean;
  /** Tapping the map can report the features under the pointer. */
  readonly supportsFeatureQuery: boolean;
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
  /** Opaque feature descriptions, only when `supportsFeatureQuery`. */
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
  /** The bearing changed. Only emitted when `supportsRotation`. */
  rotate: ViewState;
  click: MapClickEvent;
  /** The first frame of the current basemap is ready. */
  load: undefined;
  /** True while tiles or the style are loading, false when everything has loaded. */
  loading: boolean;
  /** A tile or style request failed. */
  tileError: undefined;
}

/**
 * One map engine, seen from the ui. Leaflet and MapLibre each implement this
 * in their own module, and nothing outside those two modules may name an
 * engine class, event or DOM node.
 *
 * @remarks Keyboard handling and long-press are implemented once in the ui and
 *   call the methods below, so both engines respond identically.
 *   {@link MapAdapter.setKeyboardEnabled} turns the engine's own key handling
 *   off for that reason. Capability flags describe real differences; the
 *   interface does not pretend the engines are equal.
 */
export interface MapAdapter {
  readonly capabilities: MapCapabilities;
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
  /** Rotates by degrees clockwise. A no-op unless `supportsRotation`. */
  rotateBy(degrees: number, options?: MapMoveOptions): void;
  /** Sets the bearing to north. A no-op unless `supportsRotation`. */
  resetBearing(options?: MapMoveOptions): void;
  fitBounds(bounds: Bounds, options?: MapFitOptions): void;

  /** Normalised zoom limits of the active basemap. */
  getMinZoom(): number;
  getMaxZoom(): number;

  project(latlng: LatLng): PixelPoint;
  unproject(point: PixelPoint): LatLng;
  /** Ground resolution at a latitude (defaults to the view centre) at the current zoom. */
  metresPerPixel(lat?: number): number;

  /** Swaps the basemap on this engine. The caller mounts the other engine when `basemap.engine` differs. */
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
 * Builds a map adapter for a basemap. The composition root supplies this, so
 * the ui picks an engine without importing one.
 */
export type MapAdapterFactory = (basemap: BasemapDefinition) => MapAdapter;
