import type {
  BasemapDefinition,
  Bounds,
  LatLng,
  MapAdapter,
  MapClickEvent,
  MapEvents,
  MapFeature,
  MapFeatureTap,
  MapFitOptions,
  MapHostElement,
  MapMountOptions,
  MapMoveOptions,
  MapShapes,
  MapTileOverlay,
  PixelPoint,
  ViewState,
} from "@karta/core";
import {
  clampZoom,
  MapEngineError,
  metresPerPixel,
  toEngineZoom,
  toNormalisedZoom,
} from "@karta/core";
import type {
  AnimationOptions,
  GeoJSONSourceSpecification,
  MapEventType,
  Map as MapLibreMap,
  MapOptions,
  StyleSpecification,
  Subscription,
} from "maplibre-gl";
import { Emitter } from "../shared/emitter";
import {
  MARKER_BASE_RADIUS,
  MARKER_PIXEL_RATIO,
  markerImage,
  markerImageName,
} from "./markerImages";

type MapLibreModule = typeof import("maplibre-gl");

let engineLoader: Promise<MapLibreModule> | undefined;

/**
 * Loads `maplibre-gl` and its stylesheet once, and points MapLibre at its
 * bundled worker before any map exists.
 * @remarks MapLibre finds its worker from `import.meta.url`, which inside a
 *   bundle names the current chunk rather than the worker, so without
 *   `setWorkerUrl` the worker never starts and the map stays blank
 *   (maplibre/maplibre-gl-js#8002). Vite's `?worker&url` builds the worker as
 *   a self-contained same-origin asset, so the production CSP's
 *   `worker-src 'self'` covers it, including on iOS. The worker URL is
 *   imported dynamically too: the build groups every `maplibre-gl` module
 *   into one vendor chunk, so a static import of the URL would load the whole
 *   engine with this module. A rejected load is not cached, so a chunk that
 *   failed to download (for example offline) is fetched again on the next
 *   mount.
 */
function loadEngine(): Promise<MapLibreModule> {
  engineLoader ??= Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ])
    .then(([maplibre, worker]) => {
      maplibre.setWorkerUrl(worker.default);
      return maplibre;
    })
    .catch((error: unknown) => {
      engineLoader = undefined;
      throw error;
    });
  return engineLoader;
}

/** Bearing in degrees clockwise, in the range [0, 360) and never -0. */
function normaliseBearing(bearing: number): number {
  const normalised = ((bearing % 360) + 360) % 360;
  return normalised === 0 ? 0 : normalised;
}

/** Keeps only JSON primitives, so no engine object or geometry leaves the adapter. */
function toPropertyBag(properties: unknown): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  if (typeof properties !== "object" || properties === null) {
    return bag;
  }
  for (const [key, value] of Object.entries(properties)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      bag[key] = value;
    }
  }
  return bag;
}

/** MapLibre tags errors from a tile or a source with these fields; style and worker failures carry neither. */
function isTileOrSourceError(event: object): boolean {
  const { tile, sourceId } = event as { tile?: unknown; sourceId?: unknown };
  return tile !== undefined || sourceId !== undefined;
}

/**
 * The message maplibre-gl (6.17) gives the `error` event it fires for any
 * `error` event of a web worker (`createActors` in `src/util/actor.ts`): a
 * worker script that never loaded, but also an uncaught exception inside a
 * running worker. The event has no type, tile or source of its own, so the
 * message is the only way to tell it from other source-less errors.
 */
const WORKER_FAILED_MESSAGE = "Worker failed to load.";

/** Whether an engine `error` event came from a web worker. */
function isWorkerFailure(event: object): boolean {
  const { error } = event as { error?: unknown };
  return (
    !isTileOrSourceError(event) &&
    error instanceof Error &&
    error.message.startsWith(WORKER_FAILED_MESSAGE)
  );
}

/**
 * How long, after a worker error on a loaded map, the adapter waits for signs
 * that the engine still works before it reports `fatalError`.
 */
export const WORKER_FAILURE_GRACE_MS = 5000;

/** Options for {@link MapLibreMapAdapter}. */
export interface MapLibreMapAdapterOptions {
  /** Overrides {@link WORKER_FAILURE_GRACE_MS}, for example 0 in a test. */
  readonly workerFailureGraceMs?: number;
}

/** Whether a camera event came from the person (a gesture), not from code. */
function isUserEvent(event: object): boolean {
  return (event as { originalEvent?: unknown }).originalEvent !== undefined;
}

/** The id of the source and layer of an inline raster style. */
const RASTER_ID = "basemap";

/**
 * The engine ids for one data layer: its source and the style layers drawn
 * from it. All start with `karta:` so they never meet a basemap's own ids.
 */
export function dataLayerEngineIds(id: string) {
  return {
    source: `karta:${id}`,
    points: `karta:${id}:points`,
    tiles: `karta:${id}:tiles`,
    fill: `karta:${id}:fill`,
    line: `karta:${id}:line`,
  } as const;
}

/** A data layer the adapter keeps, so it can draw it again after a basemap swap. */
type DataLayer =
  | { readonly kind: "features"; readonly features: readonly MapFeature[] }
  | { readonly kind: "tiles"; readonly overlay: MapTileOverlay }
  | { readonly kind: "shapes"; readonly shapes: MapShapes };

/** Lowest first: imagery under shapes under points. */
const DATA_KIND_ORDER: readonly DataLayer["kind"][] = [
  "tiles",
  "shapes",
  "features",
];

/** How far from a tap, in CSS pixels, a point still counts as tapped (a fingertip). */
const TAP_TOLERANCE_PX = 16;

/** The translucent fill of a shape layer, so the map under it stays readable. */
const SHAPE_FILL_OPACITY = 0.18;

/** The engine style layers of a data layer, bottom first. */
function engineLayerIds(id: string, layer: DataLayer): string[] {
  const ids = dataLayerEngineIds(id);
  switch (layer.kind) {
    case "features":
      return [ids.points];
    case "tiles":
      return [ids.tiles];
    case "shapes":
      return [ids.fill, ids.line];
  }
}

function pointCollection(id: string, features: readonly MapFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [feature.position.lng, feature.position.lat],
      },
      properties: {
        "karta:layer": id,
        "karta:id": feature.id,
        icon: markerImageName(feature.shape, feature.colour),
        size: feature.radius / MARKER_BASE_RADIUS,
        // Larger points are drawn first, so smaller ones stay on top and tappable.
        sort: -feature.radius,
      },
    })),
  };
}

function shapeCollection(shapes: MapShapes) {
  return {
    type: "FeatureCollection" as const,
    features: shapes.geometries.map((geometry) => ({
      type: "Feature" as const,
      geometry,
      properties: {},
    })),
  };
}

function sameTiles(a: MapTileOverlay, b: MapTileOverlay): boolean {
  return (
    a.tiles === b.tiles && a.tileSize === b.tileSize && a.maxzoom === b.maxzoom
  );
}

/**
 * What MapLibre draws for a basemap: a vector basemap's style URL, or an
 * inline style with one raster source and layer for a raster basemap.
 * @remarks `tileSize` must be passed: MapLibre assumes 512 px raster tiles
 *   otherwise and would request the wrong level. The source `maxzoom` is a
 *   tile level, which for 256 px tiles is the normalised zoom, so it is the
 *   basemap's `maxZoom` unconverted; MapLibre overzooms nothing beyond it.
 *   Credits are shown by the ui, so the source carries no attribution.
 */
function styleFor(basemap: BasemapDefinition): string | StyleSpecification {
  const { source } = basemap;
  if (source.kind === "vector") {
    return source.styleUrl;
  }
  return {
    version: 8,
    sources: {
      [RASTER_ID]: {
        type: "raster",
        tiles: [source.tileUrl],
        tileSize: source.tileSize,
        maxzoom: basemap.maxZoom,
      },
    },
    layers: [{ id: RASTER_ID, type: "raster", source: RASTER_ID }],
  };
}

function isElement(host: MapHostElement): host is MapHostElement & HTMLElement {
  return typeof HTMLElement !== "undefined" && host instanceof HTMLElement;
}

/**
 * Removes MapLibre's own accessibility semantics so the ui's map host stays
 * the single focus stop and the single "Map" region.
 * @remarks MapLibre sets `role="region"`, `aria-label="Map"` and
 *   `tabindex="0"` on its `<canvas>` (not the canvas container) once, when the
 *   map is built. This removes all three and sets `aria-hidden="true"` on the
 *   canvas. Without a `tabindex` the canvas is not focusable, so clicking it
 *   focuses the host. MapLibre's keyboard handler listens on the canvas
 *   container, so it can only receive keys while focus is inside it.
 */
function neutraliseEngineAccessibility(map: MapLibreMap): void {
  const canvas = map.getCanvas();
  canvas.removeAttribute("role");
  canvas.removeAttribute("aria-label");
  canvas.removeAttribute("tabindex");
  canvas.setAttribute("aria-hidden", "true");
}

interface PendingLoad {
  readonly settleOn: "load" | "style.load";
  readonly resolve: () => void;
  readonly reject: (error: MapEngineError) => void;
  /**
   * True once the style document of this load has been parsed
   * (`style.load`). MapLibre fetches the sprite and glyphs only after that,
   * so a source-less error from then on is not the style document's.
   */
  styleLoaded: boolean;
}

/** A running check of whether the engine survived a worker error. */
interface WorkerCheck {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly idle: Subscription;
}

/**
 * The {@link MapAdapter}, running `maplibre-gl` natively with MapLibre owning
 * every pointer and touch gesture. Vector basemaps load their style URL;
 * raster basemaps are drawn from an inline raster style.
 * @remarks The port speaks normalised (256 px tile) zoom, and MapLibre counts
 *   512 px tiles, so every zoom crossing the boundary goes through
 *   `toEngineZoom` and `toNormalisedZoom`. Pitch is locked at 0 because the
 *   app is a flat 2D map; rotation is supported. The adapter adds no controls,
 *   markers or popups: the pin, measure line and other overlays are drawn by
 *   the ui from `project()`. Data layers (feed points, tile overlays, detail
 *   shapes) are the exception, because hundreds of points or a tiled image
 *   belong in the engine: each is kept by id, drawn as `karta:<id>` sources
 *   and layers above the basemap (tiles, then shapes, then points), and drawn
 *   again after every `style.load`, because a full style swap drops them.
 *   Points are symbols whose images are rasterised in `markerImages.ts`, so
 *   squares and triangles carry meaning beside colour.
 *   `maplibre-gl` and its stylesheet are imported the first time `mount` runs.
 *
 *   Engine `error` events are classified once:
 *   - a tile or source failure leaves the map working (`tileError`);
 *   - a source-less error before the pending style document has loaded
 *     (`style.load`) means that document failed: it rejects the pending
 *     mount or swap, and a failed swap puts the last basemap that loaded
 *     back. A worker error also rejects a pending mount, which could never
 *     finish without its workers;
 *   - a worker error on a loaded map starts a grace check of
 *     `workerFailureGraceMs`: if the map goes idle meanwhile, or has
 *     everything loaded when it ends, the engine still works and the error
 *     is a `tileError`; otherwise it is a `fatalError`. MapLibre reports an
 *     uncaught exception inside a running worker with the same message as a
 *     worker that never started, so the message alone cannot tell them apart;
 *   - anything else, such as a missing sprite or glyph, is a `tileError`.
 */
export class MapLibreMapAdapter implements MapAdapter {
  private readonly emitter = new Emitter<MapEvents>();
  private readonly workerFailureGraceMs: number;
  private map: MapLibreMap | undefined;
  private host: MapHostElement | undefined;
  private basemap: BasemapDefinition | undefined;
  /** The basemap whose style document last loaded: what a failed swap goes back to. */
  private committedBasemap: BasemapDefinition | undefined;
  private mountView: ViewState | undefined;
  private subscriptions: Subscription[] = [];
  private pending: PendingLoad | undefined;
  private workerCheck: WorkerCheck | undefined;
  private started = false;
  private destroyed = false;
  private animationEnabled = true;
  private loadEmitted = false;
  private loading = false;
  /** Data layers by id, in the order they were first set. */
  private readonly dataLayers = new Map<string, DataLayer>();
  /** True between a style's `style.load` and the next swap: only then can sources be added. */
  private styleReady = false;

  constructor(options: MapLibreMapAdapterOptions = {}) {
    this.workerFailureGraceMs =
      options.workerFailureGraceMs ?? WORKER_FAILURE_GRACE_MS;
  }

  async mount(host: MapHostElement, options: MapMountOptions): Promise<void> {
    if (this.started || this.destroyed) {
      throw new MapEngineError(
        "load-failed",
        "This map adapter has already been mounted or destroyed.",
      );
    }
    this.started = true;
    const { basemap, view, reducedMotion } = options;
    if (!isElement(host)) {
      throw new MapEngineError(
        "load-failed",
        "The map host is not an HTML element.",
      );
    }
    this.host = host;
    this.basemap = basemap;
    this.mountView = view;
    this.animationEnabled = !reducedMotion;

    let maplibre: MapLibreModule;
    try {
      maplibre = await loadEngine();
    } catch (error) {
      throw new MapEngineError(
        "load-failed",
        `MapLibre could not be loaded: ${String(error)}`,
      );
    }
    if (this.destroyed) {
      return;
    }

    let map: MapLibreMap;
    try {
      map = new maplibre.Map(this.createOptions(host, view, reducedMotion));
    } catch (error) {
      // MapLibre throws its exported GPUInitializationError when it cannot
      // create a WebGL2 context.
      const reason =
        error instanceof maplibre.GPUInitializationError
          ? "webgl-unavailable"
          : "load-failed";
      throw new MapEngineError(
        reason,
        `MapLibre could not start: ${String(error)}`,
      );
    }
    this.map = map;
    neutraliseEngineAccessibility(map);
    this.applyInertia();

    const loaded = new Promise<void>((resolve, reject) => {
      this.pending = { settleOn: "load", resolve, reject, styleLoaded: false };
    });
    this.subscribe(map);
    // The constructor already fired "dataloading" for the style, before these listeners existed.
    this.setLoading(true);
    try {
      await loaded;
    } catch (error) {
      this.teardownMap();
      throw error;
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    // An intentional teardown is not a failure, so a waiting caller just resolves.
    this.settlePending();
    this.teardownMap();
    this.emitter.clear();
  }

  getView(): ViewState {
    const map = this.map;
    if (!map) {
      return (
        this.mountView ?? { center: { lat: 0, lng: 0 }, zoom: 0, bearing: 0 }
      );
    }
    const center = map.getCenter();
    return {
      center: { lat: center.lat, lng: center.lng },
      zoom: toNormalisedZoom(map.getZoom()),
      bearing: normaliseBearing(map.getBearing()),
    };
  }

  setView(view: Partial<ViewState>, options?: MapMoveOptions): void {
    const camera: {
      center?: [number, number];
      zoom?: number;
      bearing?: number;
    } = {};
    if (view.center) {
      camera.center = [view.center.lng, view.center.lat];
    }
    if (view.zoom !== undefined) {
      camera.zoom = this.engineZoom(view.zoom);
    }
    if (view.bearing !== undefined) {
      camera.bearing = view.bearing;
    }
    this.moveCamera(camera, options);
  }

  zoomIn(options?: MapMoveOptions): void {
    this.map?.zoomIn(this.animation(options));
  }

  zoomOut(options?: MapMoveOptions): void {
    this.map?.zoomOut(this.animation(options));
  }

  panBy(dx: number, dy: number, options?: MapMoveOptions): void {
    this.map?.panBy([dx, dy], this.animation(options));
  }

  rotateBy(degrees: number, options?: MapMoveOptions): void {
    const map = this.map;
    if (!map) {
      return;
    }
    this.moveCamera({ bearing: map.getBearing() + degrees }, options);
  }

  resetBearing(options?: MapMoveOptions): void {
    this.moveCamera({ bearing: 0 }, options);
  }

  fitBounds(bounds: Bounds, options?: MapFitOptions): void {
    const map = this.map;
    if (!map) {
      return;
    }
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      {
        ...(options?.padding ? { padding: { ...options.padding } } : {}),
        ...(options?.maxZoom !== undefined
          ? { maxZoom: this.engineZoom(options.maxZoom) }
          : {}),
        // Without this MapLibre fits north-up and drops the user's rotation.
        bearing: map.getBearing(),
        ...this.animation(options),
      },
    );
  }

  getMinZoom(): number {
    return this.basemap?.minZoom ?? 0;
  }

  getMaxZoom(): number {
    return this.basemap?.maxZoom ?? 0;
  }

  project(latlng: LatLng): PixelPoint {
    const map = this.map;
    if (!map) {
      return { x: 0, y: 0 };
    }
    const point = map.project([latlng.lng, latlng.lat]);
    return { x: point.x, y: point.y };
  }

  unproject(point: PixelPoint): LatLng {
    const map = this.map;
    if (!map) {
      return this.getView().center;
    }
    const position = map.unproject([point.x, point.y]);
    return { lat: position.lat, lng: position.lng };
  }

  metresPerPixel(lat?: number): number {
    const view = this.getView();
    return metresPerPixel(lat ?? view.center.lat, view.zoom);
  }

  setBasemap(basemap: BasemapDefinition): Promise<void> {
    const map = this.map;
    if (!map || this.destroyed) {
      return Promise.reject(
        new MapEngineError("load-failed", "The map is not mounted."),
      );
    }
    this.settlePending();
    const swapped = new Promise<void>((resolve, reject) => {
      this.pending = {
        settleOn: "style.load",
        resolve,
        reject,
        styleLoaded: false,
      };
    });
    this.drawBasemap(map, basemap);
    return swapped;
  }

  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled;
    if (!enabled) {
      this.map?.stop();
    }
    this.applyInertia();
  }

  setKeyboardEnabled(enabled: boolean): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (enabled) {
      map.keyboard.enable();
    } else {
      map.keyboard.disable();
    }
  }

  focus(): void {
    this.host?.focus({ preventScroll: true });
  }

  on<K extends keyof MapEvents>(
    event: K,
    handler: (payload: MapEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  setFeatureLayer(id: string, features: readonly MapFeature[]): void {
    this.setDataLayer(id, { kind: "features", features: [...features] });
  }

  setTileLayer(id: string, overlay: MapTileOverlay): void {
    const previous = this.dataLayers.get(id);
    this.dataLayers.set(id, { kind: "tiles", overlay });
    const map = this.readyMap();
    const tilesId = dataLayerEngineIds(id).tiles;
    if (
      map &&
      previous?.kind === "tiles" &&
      sameTiles(previous.overlay, overlay) &&
      map.getLayer(tilesId)
    ) {
      // Only the opacity changed: no tile is requested again.
      map.setPaintProperty(tilesId, "raster-opacity", overlay.opacity);
      return;
    }
    if (map) {
      this.drawDataLayer(map, id);
    }
  }

  setShapeLayer(id: string, shapes: MapShapes): void {
    this.setDataLayer(id, { kind: "shapes", shapes });
  }

  removeLayer(id: string): void {
    if (!this.dataLayers.delete(id)) {
      return;
    }
    const map = this.readyMap();
    if (map) {
      this.eraseDataLayer(map, id);
    }
  }

  private setDataLayer(id: string, layer: DataLayer): void {
    this.dataLayers.set(id, layer);
    const map = this.readyMap();
    if (map) {
      this.drawDataLayer(map, id);
    }
  }

  /** The map, when its style can take sources and layers; otherwise undefined. */
  private readyMap(): MapLibreMap | undefined {
    return this.styleReady ? this.map : undefined;
  }

  private eraseDataLayer(map: MapLibreMap, id: string): void {
    const ids = dataLayerEngineIds(id);
    for (const layerId of [ids.points, ids.tiles, ids.line, ids.fill]) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
    if (map.getSource(ids.source)) {
      map.removeSource(ids.source);
    }
  }

  /** Draws one data layer afresh from what the adapter keeps, then restores the stacking order. */
  private drawDataLayer(map: MapLibreMap, id: string, order = true): void {
    const layer = this.dataLayers.get(id) as DataLayer;
    this.eraseDataLayer(map, id);
    const ids = dataLayerEngineIds(id);
    switch (layer.kind) {
      case "features": {
        for (const feature of layer.features) {
          const name = markerImageName(feature.shape, feature.colour);
          if (!map.hasImage(name)) {
            map.addImage(name, markerImage(feature.shape, feature.colour), {
              pixelRatio: MARKER_PIXEL_RATIO,
            });
          }
        }
        map.addSource(ids.source, {
          type: "geojson",
          data: pointCollection(id, layer.features),
        });
        map.addLayer({
          id: ids.points,
          type: "symbol",
          source: ids.source,
          layout: {
            "icon-image": ["get", "icon"],
            "icon-size": ["get", "size"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "symbol-sort-key": ["get", "sort"],
          },
        });
        break;
      }
      case "tiles": {
        const { tiles, tileSize, maxzoom, opacity } = layer.overlay;
        map.addSource(ids.source, {
          type: "raster",
          tiles: [tiles],
          tileSize,
          maxzoom,
        });
        map.addLayer({
          id: ids.tiles,
          type: "raster",
          source: ids.source,
          paint: { "raster-opacity": opacity },
        });
        break;
      }
      case "shapes": {
        const { colour } = layer.shapes;
        map.addSource(ids.source, {
          type: "geojson",
          // The port's positions are readonly tuples; the engine only reads them.
          data: shapeCollection(
            layer.shapes,
          ) as unknown as GeoJSONSourceSpecification["data"],
        });
        map.addLayer({
          id: ids.fill,
          type: "fill",
          source: ids.source,
          filter: [
            "match",
            ["geometry-type"],
            ["Polygon", "MultiPolygon"],
            true,
            false,
          ],
          paint: { "fill-color": colour, "fill-opacity": SHAPE_FILL_OPACITY },
        });
        map.addLayer({
          id: ids.line,
          type: "line",
          source: ids.source,
          paint: { "line-color": colour, "line-width": 2 },
        });
        break;
      }
    }
    if (order) {
      this.orderDataLayers(map);
    }
  }

  /** Moves every data layer to the top, lowest kind first, keeping the order they were set in. */
  private orderDataLayers(map: MapLibreMap): void {
    for (const kind of DATA_KIND_ORDER) {
      for (const [id, layer] of this.dataLayers) {
        if (layer.kind !== kind) {
          continue;
        }
        for (const layerId of engineLayerIds(id, layer)) {
          if (map.getLayer(layerId)) {
            map.moveLayer(layerId);
          }
        }
      }
    }
  }

  /**
   * Draws every kept data layer again, then orders them once; a new style
   * starts with none, so ordering after each one would move layers that are
   * not back yet.
   */
  private restoreDataLayers(map: MapLibreMap): void {
    for (const id of this.dataLayers.keys()) {
      this.drawDataLayer(map, id, false);
    }
    this.orderDataLayers(map);
  }

  /** The topmost drawn point within a fingertip of a tap, or null. */
  private featureTapAt(x: number, y: number): MapFeatureTap | null {
    const map = this.readyMap();
    if (!map) {
      return null;
    }
    const layers = [...this.dataLayers]
      .filter(([, layer]) => layer.kind === "features")
      .map(([id]) => dataLayerEngineIds(id).points)
      .filter((layerId) => map.getLayer(layerId) !== undefined);
    if (layers.length === 0) {
      return null;
    }
    const reach = TAP_TOLERANCE_PX;
    let hits: { properties?: unknown }[];
    try {
      hits = map.queryRenderedFeatures(
        [
          [x - reach, y - reach],
          [x + reach, y + reach],
        ],
        { layers },
      );
    } catch {
      // Querying can throw while a style is still loading; nothing is tapped then.
      return null;
    }
    const properties = toPropertyBag(hits[0]?.properties);
    const layerId = properties["karta:layer"];
    const featureId = properties["karta:id"];
    return typeof layerId === "string" && typeof featureId === "string"
      ? { layerId, featureId }
      : null;
  }

  private createOptions(
    host: HTMLElement,
    view: ViewState,
    reducedMotion: boolean,
  ): MapOptions {
    const basemap = this.basemap as BasemapDefinition;
    return {
      container: host,
      style: styleFor(basemap),
      center: [view.center.lng, view.center.lat],
      zoom: this.engineZoom(view.zoom),
      bearing: view.bearing,
      pitch: 0,
      minZoom: toEngineZoom(basemap.minZoom),
      maxZoom: toEngineZoom(basemap.maxZoom),
      maxPitch: 0,
      attributionControl: false,
      maplibreLogo: false,
      // The ui implements the keys itself.
      keyboard: false,
      cooperativeGestures: false,
      boxZoom: false,
      dragPan: true,
      dragRotate: true,
      pitchWithRotate: false,
      touchPitch: false,
      touchZoomRotate: true,
      scrollZoom: true,
      doubleClickZoom: true,
      // Constructor-only in MapLibre 6. `reduceMotion` turns off gesture
      // inertia and wheel easing; it must always be passed explicitly because
      // MapLibre stores it globally and the ui already folds in the OS setting.
      reduceMotion: reducedMotion,
      ...(reducedMotion ? { fadeDuration: 0 } : {}),
    };
  }

  private subscribe(map: MapLibreMap): void {
    const listen = <T extends keyof MapEventType>(
      type: T,
      listener: (event: MapEventType[T]) => void,
    ) => {
      this.subscriptions.push(map.on(type, listener));
    };
    const emitView = (event: "move" | "moveEnd" | "rotate") => () => {
      this.emitter.emit(event, this.getView());
    };

    listen("move", emitView("move"));
    listen("moveend", emitView("moveEnd"));
    listen("zoom", (event) => {
      const view = this.getView();
      this.emitter.emit("zoom", view);
      if (isUserEvent(event)) {
        this.emitter.emit("userZoom", view);
      }
    });
    listen("rotate", emitView("rotate"));
    listen("click", (event) => {
      const tap = this.featureTapAt(event.point.x, event.point.y);
      if (tap) {
        this.emitter.emit("featureTap", tap);
      }
      const click: MapClickEvent = {
        latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
        point: { x: event.point.x, y: event.point.y },
        features: this.featuresAt(event.point.x, event.point.y),
      };
      this.emitter.emit("click", click);
    });
    listen("dataloading", () => {
      this.setLoading(true);
    });
    listen("styledataloading", () => {
      this.setLoading(true);
    });
    listen("style.load", () => {
      if (this.pending) {
        this.pending.styleLoaded = true;
      }
      this.styleReady = true;
      this.settlePending("style.load");
      try {
        this.restoreDataLayers(map);
      } catch (error) {
        // The basemap works without them; never let a data layer break a swap.
        console.error("Data layers could not be drawn again", error);
      }
    });
    listen("load", () => {
      this.emitLoad();
      this.settlePending("load");
    });
    listen("idle", () => {
      this.setLoading(false);
      this.emitLoad();
    });
    // The classification is described on the class.
    listen("error", (event) => {
      // Listening to "error" silences MapLibre's own console logging.
      console.error("MapLibre basemap error", event.error);
      if (isTileOrSourceError(event)) {
        this.emitter.emit("tileError", undefined);
        return;
      }
      const workerFailed = isWorkerFailure(event);
      const pending = this.pending;
      if (
        pending &&
        (!pending.styleLoaded || (workerFailed && pending.settleOn === "load"))
      ) {
        this.failPending(pending, event.error);
        return;
      }
      if (workerFailed) {
        this.checkEngineAfterWorkerError(map);
        return;
      }
      this.emitter.emit("tileError", undefined);
    });
  }

  /** Sets a basemap's zoom limits and style on the engine. */
  private drawBasemap(map: MapLibreMap, basemap: BasemapDefinition): void {
    this.basemap = basemap;
    const minZoom = toEngineZoom(basemap.minZoom);
    const maxZoom = toEngineZoom(basemap.maxZoom);
    // MapLibre throws if a new minimum passes the current maximum, or the reverse.
    if (minZoom > map.getMaxZoom()) {
      map.setMaxZoom(maxZoom);
      map.setMinZoom(minZoom);
    } else {
      map.setMinZoom(minZoom);
      map.setMaxZoom(maxZoom);
    }
    this.loadEmitted = false;
    this.styleReady = false;
    // A diffed swap fires no "style.load", so a swap could never settle.
    map.setStyle(styleFor(basemap), { diff: false });
  }

  /**
   * Rejects a mount or swap whose style could not load. MapLibre has already
   * dropped the old style for the failed one, so a failed swap draws the last
   * basemap that loaded again; the map keeps working on it.
   */
  private failPending(pending: PendingLoad, error: unknown): void {
    this.pending = undefined;
    const map = this.map;
    const previous = this.committedBasemap;
    if (pending.settleOn === "style.load" && map && previous) {
      this.drawBasemap(map, previous);
    }
    pending.reject(
      new MapEngineError(
        "load-failed",
        `The basemap style could not be loaded: ${String(error)}`,
      ),
    );
  }

  /**
   * Decides whether a worker error on a loaded map stopped the engine. One
   * check runs at a time; a burst of errors is judged once.
   */
  private checkEngineAfterWorkerError(map: MapLibreMap): void {
    if (this.workerCheck) {
      return;
    }
    const finish = (stopped: boolean) => {
      this.clearWorkerCheck();
      if (stopped) {
        this.emitter.emit(
          "fatalError",
          new MapEngineError(
            "stopped",
            "The map engine stopped working: its worker failed.",
          ),
        );
      } else {
        this.emitter.emit("tileError", undefined);
      }
    };
    this.workerCheck = {
      idle: map.on("idle", () => finish(false)),
      timer: setTimeout(() => finish(!map.loaded()), this.workerFailureGraceMs),
    };
  }

  private clearWorkerCheck(): void {
    const check = this.workerCheck;
    if (!check) {
      return;
    }
    this.workerCheck = undefined;
    clearTimeout(check.timer);
    check.idle.unsubscribe();
  }

  private featuresAt(x: number, y: number): Record<string, unknown>[] {
    try {
      return (this.map?.queryRenderedFeatures([x, y]) ?? []).map((feature) =>
        toPropertyBag(feature.properties),
      );
    } catch {
      // Querying can throw while a style is still loading; nothing is under the pointer then.
      return [];
    }
  }

  private emitLoad(): void {
    if (this.loadEmitted) {
      return;
    }
    this.loadEmitted = true;
    this.emitter.emit("load", undefined);
  }

  private setLoading(loading: boolean): void {
    if (this.loading === loading) {
      return;
    }
    this.loading = loading;
    this.emitter.emit("loading", loading);
  }

  /**
   * Resolves the waiting mount or swap; with `event`, only if it waits for
   * that event, and then its basemap becomes the one a failed swap goes back
   * to. Without one (superseded or destroyed) nothing has loaded.
   */
  private settlePending(event?: PendingLoad["settleOn"]): void {
    const pending = this.pending;
    if (!pending || (event !== undefined && pending.settleOn !== event)) {
      return;
    }
    this.pending = undefined;
    if (event !== undefined) {
      this.committedBasemap = this.basemap;
    }
    pending.resolve();
  }

  private teardownMap(): void {
    this.styleReady = false;
    this.clearWorkerCheck();
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
    // `remove()` also releases the WebGL context through WEBGL_lose_context.
    this.map?.remove();
    this.map = undefined;
  }

  /**
   * Pan inertia is the only gesture animation MapLibre 6 can change after
   * construction: a pan speed limit of zero leaves nothing to coast.
   */
  private applyInertia(): void {
    this.map?.dragPan.enable(
      this.animationEnabled ? undefined : { maxSpeed: 0 },
    );
  }

  private engineZoom(normalisedZoom: number): number {
    return toEngineZoom(
      clampZoom(normalisedZoom, this.getMinZoom(), this.getMaxZoom()),
    );
  }

  private animation(options?: MapMoveOptions): AnimationOptions {
    // `essential` stops MapLibre's global reduced-motion flag from overriding
    // an animation the app has allowed.
    return this.shouldAnimate(options)
      ? { essential: true }
      : { animate: false, duration: 0 };
  }

  private shouldAnimate(options?: MapMoveOptions): boolean {
    return this.animationEnabled && options?.animate !== false;
  }

  private moveCamera(
    camera: { center?: [number, number]; zoom?: number; bearing?: number },
    options?: MapMoveOptions,
  ): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (this.shouldAnimate(options)) {
      map.easeTo({ ...camera, essential: true });
    } else {
      map.jumpTo(camera);
    }
  }
}

/** Builds a fresh MapLibre adapter. The composition root's adapter factory. */
export function createMapLibreMapAdapter(): MapAdapter {
  return new MapLibreMapAdapter();
}
