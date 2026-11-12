import type { FillPattern, LineDash, MarkerShape } from "../layers/definition";
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

/**
 * The shape the map is drawn in: a flat Web Mercator map, or a globe.
 * @remarks The app's choice always wins: a basemap style that asks for a
 *   different projection is ignored. Zoom, the address hash and the camera
 *   (north-up, no pitch) mean the same in both.
 */
export type MapProjection = "flat" | "globe";

/** Everything the adapter needs when it mounts. */
export interface MapMountOptions {
  readonly view: ViewState;
  readonly basemap: BasemapDefinition;
  /** When true, the engine's own animation (zoom, fade, fly, inertia) is off. */
  readonly reducedMotion: boolean;
  /** Save data mode: leave out the basemap's `saveDataOmitLayers`. Defaults to false. */
  readonly saveData?: boolean;
  /** The map's shape, kept through every later basemap swap. Defaults to `"flat"`. */
  readonly projection?: MapProjection;
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
  /**
   * `[west, south, east, north]` in degrees. The engine requests no tile
   * outside this box. Without it, every tile of the world is requested.
   */
  readonly bounds?: readonly [number, number, number, number];
  /** From 0 to 1. */
  readonly opacity: number;
}

/** Polygons and lines drawn on request, such as an event's affected area. */
export interface MapShapes {
  readonly geometries: readonly LayerGeometry[];
  /** A hex colour for the lines and a translucent fill. */
  readonly colour: string;
  /** The width of lines and outlines, in CSS pixels. Defaults to 2. */
  readonly lineWidth?: number;
}

/**
 * How one polygon or line is drawn, already worked out from its layer's
 * style. The adapter fills `colour` at `fillOpacity` (polygons) or strokes
 * with it (lines), draws a polygon's outline in the palette's ink, hatches
 * with `pattern` in that ink, and dashes with `dash`.
 */
export interface MapShapeLook {
  /** A hex colour, such as `#e69f00`. */
  readonly colour: string;
  /** From 0 to 1. Polygons only. */
  readonly fillOpacity: number;
  readonly pattern: FillPattern;
  readonly dash: LineDash;
  /** Line width, or outline width for a polygon, in CSS pixels. */
  readonly width: number;
}

/** One polygon or line of a styled shape layer. */
export interface MapStyledShape {
  readonly id: string;
  readonly geometry: LayerGeometry;
  readonly look: MapShapeLook;
  /** Text drawn on the shape, when the layer has labels and the engine can draw them. */
  readonly label?: string;
}

/**
 * Polygons or lines drawn with a per-shape look, such as a choropleth. A
 * layer draws one kind of geometry; the other kind is ignored. Shapes can be
 * tapped like points.
 */
export interface MapStyledShapes {
  readonly geometry: "area" | "line";
  readonly shapes: readonly MapStyledShape[];
  /** Labels appear from this normalised zoom. */
  readonly labelMinZoom?: number;
}

/** A source of vector tiles. */
export interface MapVectorSource {
  /** A tile URL template with `{z}`, `{x}` and `{y}`. */
  readonly tiles: string;
  /** The shallowest and deepest tile levels the service has; the engine scales beyond them. */
  readonly minzoom: number;
  readonly maxzoom: number;
}

/**
 * How a vector tile layer picks the look of each of its features from one
 * property. The engine evaluates it, because the features are in the tiles
 * and the ui never sees them.
 */
export type MapLookRule =
  | { readonly kind: "fixed"; readonly look: MapShapeLook }
  | {
      readonly kind: "category";
      readonly field: string;
      readonly cases: readonly {
        readonly value: string | number;
        readonly look: MapShapeLook;
      }[];
      /** For a value no case names, and for a missing one. */
      readonly fallback: MapShapeLook;
    }
  | {
      readonly kind: "steps";
      readonly field: string;
      /** Ascending. The first look applies to everything below the second minimum, and to a missing value. */
      readonly steps: readonly {
        readonly min: number;
        readonly look: MapShapeLook;
      }[];
    };

/** One layer of a vector tile source, drawn as polygons or lines. */
export interface MapVectorSourceLayer {
  /** The layer's name inside the tiles. */
  readonly sourceLayer: string;
  readonly geometry: "area" | "line";
  readonly rule: MapLookRule;
  /** Visible from and to these normalised zoom levels. */
  readonly minzoom?: number;
  readonly maxzoom?: number;
  /** Draws the property's value on each feature. */
  readonly label?: { readonly field: string; readonly minzoom?: number };
}

/** A vector tile layer: one source, drawn from one or more of its source layers. */
export interface MapVectorTiles {
  readonly source: MapVectorSource;
  readonly layers: readonly MapVectorSourceLayer[];
  /** Normalised zoom levels the whole layer is visible between. */
  readonly minzoom?: number;
  readonly maxzoom?: number;
}

/** How a heatmap is drawn. */
export interface MapHeatmapStyle {
  /** Pixels each point spreads over. */
  readonly radius: number;
  /** Multiplies every point's weight. */
  readonly intensity: number;
  /** From 0 to 1. */
  readonly opacity: number;
  /** Hex colours from the lowest density to the highest. At least two. */
  readonly ramp: readonly string[];
}

/** What a heatmap is made from: loaded points, or a vector tile source layer of points. */
export type MapHeatmapSource =
  | {
      readonly kind: "points";
      readonly points: readonly {
        readonly position: LatLng;
        /** Defaults to 1. */
        readonly weight?: number;
      }[];
    }
  | {
      readonly kind: "vector";
      readonly source: MapVectorSource;
      readonly sourceLayer: string;
      /** The property that weights each point. Each counts 1 without it. */
      readonly weightField?: string;
      readonly minzoom?: number;
      readonly maxzoom?: number;
    };

/** Point density drawn as a heatmap. It has no tappable features. */
export interface MapHeatmap {
  readonly source: MapHeatmapSource;
  readonly style: MapHeatmapStyle;
}

/** One feature of a data layer under a tap. */
export interface MapFeatureHit {
  readonly layerId: string;
  readonly featureId: string;
}

/**
 * A tap or click on a point, polygon or line of a feed layer: the topmost
 * feature, and every feature under the tap (it included), topmost first
 * and listed once each.
 */
export interface MapFeatureTap extends MapFeatureHit {
  readonly hits: readonly MapFeatureHit[];
}

/**
 * One thing the ui draws over the map itself, in positions, for an image to
 * include. The engine never holds it, so the adapter draws it from this.
 */
export type MapImageMark =
  | {
      readonly kind: "path";
      readonly positions: readonly LatLng[];
      /** Joins the last position back to the first. */
      readonly closed: boolean;
      /** Fills the inside, translucently. */
      readonly fill: boolean;
      readonly dashed: boolean;
    }
  | { readonly kind: "dot"; readonly position: LatLng };

/** Marks to draw over the map in an image, with the two hex colours they use. */
export interface MapImageDrawing {
  /** The colour of lines, fills and dots. */
  readonly colour: string;
  /** The colour of the outline that separates a mark from the map beneath. */
  readonly halo: string;
  readonly marks: readonly MapImageMark[];
}

/** Options for {@link MapAdapter.toImage}. */
export interface MapImageOptions {
  /**
   * What the ui draws over the map (such as shapes a person has drawn), put
   * into the image above the data layers and below the credit text.
   */
  readonly drawing?: MapImageDrawing;
  /**
   * Credit text drawn along the bottom edge of the image, so a saved image
   * keeps its sources. Nothing is drawn when it is empty or omitted.
   */
  readonly attribution?: string;
}

/** What a draggable handle on the map stands for. */
export type MapEditHandleKind = "vertex" | "midpoint" | "radius";

/**
 * A point the person can press and drag, such as the vertex of a shape being
 * edited. The ui draws the handle itself; the adapter only owns the gesture,
 * because only the engine can stop a press from also panning the map.
 */
export interface MapEditHandle {
  /** Names the handle in `handleDrag` and `handleHover`. Unique among the handles set. */
  readonly id: string;
  readonly position: LatLng;
  readonly kind: MapEditHandleKind;
}

/**
 * One step of a press on an edit handle. A press that starts on a handle
 * never pans the map and never produces a `click`.
 */
export interface MapHandleDrag {
  /** The handle that was pressed, as it was when the press began. */
  readonly id: string;
  /**
   * `start` when the pointer goes down on the handle, `move` while it travels
   * (only once it has left the click tolerance), `end` when it is released
   * or cancelled.
   */
  readonly phase: "start" | "move" | "end";
  /** Where the pointer is. */
  readonly latlng: LatLng;
  /**
   * True once the pointer has travelled beyond the click tolerance since it
   * went down. An `end` with `moved` false is a tap on the handle.
   */
  readonly moved: boolean;
}

/** The events a map adapter emits, with their payloads. */
export interface MapEvents {
  /** A press on an edit handle moved, or started or ended. See {@link MapHandleDrag}. */
  handleDrag: MapHandleDrag;
  /**
   * A mouse or pen moved over an edit handle (its id) or off every handle
   * (null). Not emitted for touch, which has no hover.
   */
  handleHover: string | null;
  /**
   * A tap or click landed on a point, polygon or line of a feed layer. Fires
   * before the `click` for the same tap, with the topmost feature within a
   * finger's reach and every feature found there.
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
   * The basemap's own tiles all failed and none loaded, counted from its style
   * loading to the moment the map settled: its provider is down or
   * unreachable (an expired certificate looks like this too). Data layers do
   * not count. It carries the basemap whose style those tiles belong to, so a
   * report that arrives before a mount has resolved, or after another basemap
   * was asked for, still names the right one. It is reported at most once each
   * time a basemap's style loads, and never once any tile of it has loaded.
   */
  basemapUnavailable: BasemapDefinition;
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

  /**
   * The pixel of a position on the map host. On a flat map the longitude
   * names the copy of the world: 190 is one world east of -170, so the ui
   * picks the copy it draws (`placePoint`, `placePath`).
   */
  project(latlng: LatLng): PixelPoint;
  /** The position under a pixel, with its longitude in [-180, 180). */
  unproject(point: PixelPoint): LatLng;
  /**
   * Whether a place is on the side of the map the person can see. Always true
   * on a flat map. On a globe it is false for a place beyond the horizon,
   * where `project` still returns a pixel that must not be drawn.
   */
  isVisible(latlng: LatLng): boolean;
  /**
   * Ground resolution at a latitude (defaults to the view centre) at the
   * current zoom. On a globe it is the view centre's resolution wherever
   * asked, because the sphere has one scale (`mapMetresPerPixel`).
   */
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
  /**
   * Draws the map flat or as a globe. The adapter applies it again after every
   * style load, so a basemap swap keeps it and a style's own request for a
   * different shape is ignored.
   */
  setProjection(projection: MapProjection): void;
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
  /**
   * Draws polygons or lines with a look each under `id`, replacing what was
   * drawn under that id. They sit between tile overlays and points, and
   * survive `setBasemap` like the other data layers.
   */
  setStyledShapes(id: string, layer: MapStyledShapes): void;
  /**
   * Draws a vector tile layer under `id`, replacing what was drawn under that
   * id. Its features are not tappable, because the ui never receives them.
   */
  setVectorLayer(id: string, layer: MapVectorTiles): void;
  /**
   * Draws point density as a heatmap under `id`, replacing what was drawn
   * under that id. A heatmap sits above styled shapes and below points.
   */
  setHeatmapLayer(id: string, heatmap: MapHeatmap): void;
  /** Removes whatever is drawn under `id`. Does nothing for an unknown id. */
  removeLayer(id: string): void;

  /**
   * Every tappable feature of the data layers at a pixel of the map (a
   * fingertip's reach for points and lines, exactly for polygons), topmost
   * first, each listed once. Empty when nothing is there or the map is not
   * ready. The ui calls it for the keyboard route to the list a multi-feature
   * tap opens.
   */
  featuresAt(point: PixelPoint): readonly MapFeatureHit[];
  /** The box of latitudes and longitudes the map shows now, covering a rotated map. */
  getBounds(): Bounds;
  /**
   * Draws the map as it is now, with its data layers, as a PNG. It never
   * requests anything the map has not already loaded. Rejects with a
   * `MapEngineError` whose reason is `export-failed` when the engine cannot
   * produce an image, and also while a basemap swap is still loading, so a
   * half-swapped map is never saved. That is checked again just before the
   * pixels are copied, so a swap that starts meanwhile is caught.
   */
  toImage(options?: MapImageOptions): Promise<Blob>;

  /**
   * Replaces the handles the person can press and drag. A press within reach
   * of a handle (12 px for a mouse, 22 px for a finger, the nearest wins) is
   * reported as `handleDrag` and does not pan the map or produce a `click`.
   * An empty list turns handle gestures off. Handles belong to the adapter,
   * not to the style, so they survive `setBasemap`. A press already in
   * progress carries on with the handle it began on.
   */
  setEditHandles(handles: readonly MapEditHandle[]): void;

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
