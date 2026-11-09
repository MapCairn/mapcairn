import type { MarkerShape } from "../layers/definition";
import type { BasemapDefinition } from "./basemap";
import type { MapEngineError } from "./errors";
import type { Bounds, LatLng, PixelPoint, ViewState } from "./geometry";
import type { LayerGeometry } from "./layers";

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
  /** Save data mode: leave out the basemap's `saveDataOmitLayers`. Defaults to false. */
  readonly saveData?: boolean;
}

/** Options for {@link MapAdapter.setBasemap}. */
export interface MapBasemapOptions {
  /** Save data mode: leave out the basemap's `saveDataOmitLayers`. Defaults to false. */
  readonly saveData?: boolean;
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

/**
 * One point of a feed layer, with its look already worked out from the
 * layer's style, so the adapter draws without knowing any style rule.
 */
export interface MapFeature {
  readonly id: string;
  readonly position: LatLng;
  /** A hex colour, such as `#e69f00`. */
  readonly colour: string;
  /** Radius in CSS pixels. */
  readonly radius: number;
  readonly shape: MarkerShape;
}

/** Raster tiles drawn over the basemap, such as satellite imagery or a WMS map. */
export interface MapTileOverlay {
  /**
   * The tile URL template. The adapter fills `{z}`, `{x}` and `{y}`, or
   * `{bbox-epsg-3857}` for a WMS GetMap URL.
   */
  readonly tiles: string;
  readonly tileSize: 256 | 512;
  /** The deepest tile level the service has; the engine scales beyond it. */
  readonly maxzoom: number;
  /** From 0 to 1. */
  readonly opacity: number;
}

/** Polygons and lines drawn on request, such as an event's affected area. */
export interface MapShapes {
  readonly geometries: readonly LayerGeometry[];
  /** A hex colour for the lines and a translucent fill. */
  readonly colour: string;
}

/** A tap or click on a point of a feed layer. */
export interface MapFeatureTap {
  readonly layerId: string;
  readonly featureId: string;
}

/** The events a map adapter emits, with their payloads. */
export interface MapEvents {
  /**
   * A tap or click landed on a point of a feed layer. Fires before the
   * `click` for the same tap, with the topmost point within a finger's reach.
   */
  featureTap: MapFeatureTap;
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
   * keeps working. With `saveData`, the layers the basemap lists in
   * `saveDataOmitLayers` are left out of the style, and every later swap
   * decides again.
   */
  setBasemap(
    basemap: BasemapDefinition,
    options?: MapBasemapOptions,
  ): Promise<void>;
  /** Turns every engine animation on or off (reduced motion). */
  setAnimationEnabled(enabled: boolean): void;
  /** Turns the engine's own keyboard handling on or off. */
  setKeyboardEnabled(enabled: boolean): void;
  /** Moves keyboard focus to the map host. */
  focus(): void;

  /**
   * Draws a feed layer's points under `id`, replacing what was drawn under
   * that id. Data layers are drawn above the basemap in a fixed order: tile
   * overlays lowest, then shapes, then points. They survive `setBasemap`, and
   * may be set before `mount`, which draws them once the map has loaded.
   */
  setFeatureLayer(id: string, features: readonly MapFeature[]): void;
  /** Draws or updates a tile overlay under `id`. An opacity change alone costs no request. */
  setTileLayer(id: string, overlay: MapTileOverlay): void;
  /** Draws polygons and lines under `id`, replacing what was drawn under that id. */
  setShapeLayer(id: string, shapes: MapShapes): void;
  /** Removes whatever is drawn under `id`. Does nothing for an unknown id. */
  removeLayer(id: string): void;

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
