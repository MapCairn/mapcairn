import type {
  BasemapDefinition,
  Bounds,
  LatLng,
  MapAdapter,
  MapCapabilities,
  MapClickEvent,
  MapEvents,
  MapFitOptions,
  MapHostElement,
  MapMountOptions,
  MapMoveOptions,
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
  MapEventType,
  Map as MapLibreMap,
  MapOptions,
  Subscription,
} from "maplibre-gl";
import { Emitter } from "../shared/emitter";

type MapLibreModule = typeof import("maplibre-gl");

const ENGINE = "maplibre";

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

function isVector(basemap: BasemapDefinition): basemap is BasemapDefinition & {
  source: { kind: "vector"; styleUrl: string };
} {
  return basemap.engine === ENGINE && basemap.source.kind === "vector";
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
}

/**
 * The {@link MapAdapter} for vector basemaps, running `maplibre-gl` natively
 * with MapLibre owning every pointer and touch gesture.
 * @remarks The port speaks normalised (256 px tile) zoom, and MapLibre counts
 *   512 px tiles, so every zoom crossing the boundary goes through
 *   `toEngineZoom` and `toNormalisedZoom`. Pitch is locked at 0 because the
 *   app is a flat 2D map; rotation is supported. The adapter adds no controls,
 *   markers, popups or layers: overlays are drawn by the ui from `project()`.
 *   `maplibre-gl` and its stylesheet are imported the first time `mount` runs.
 */
export class MapLibreMapAdapter implements MapAdapter {
  readonly capabilities: MapCapabilities = {
    supportsRotation: true,
    supportsFeatureQuery: true,
  };

  private readonly emitter = new Emitter<MapEvents>();
  private map: MapLibreMap | undefined;
  private host: MapHostElement | undefined;
  private basemap: BasemapDefinition | undefined;
  private mountView: ViewState | undefined;
  private subscriptions: Subscription[] = [];
  private pending: PendingLoad | undefined;
  private started = false;
  private destroyed = false;
  private animationEnabled = true;
  private loadEmitted = false;
  private loading = false;

  async mount(host: MapHostElement, options: MapMountOptions): Promise<void> {
    if (this.started || this.destroyed) {
      throw new MapEngineError(
        "load-failed",
        "This map adapter has already been mounted or destroyed.",
      );
    }
    this.started = true;
    const { basemap, view, reducedMotion } = options;
    if (!isVector(basemap)) {
      throw new MapEngineError(
        "load-failed",
        `The MapLibre adapter cannot show the ${basemap.source.kind} basemap "${basemap.id}".`,
      );
    }
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
      map = new maplibre.Map(
        this.createOptions(host, basemap.source.styleUrl, view, reducedMotion),
      );
    } catch (error) {
      // MapLibre does not export GPUInitializationError, so match its name.
      const reason =
        error instanceof Error && error.name === "GPUInitializationError"
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
      this.pending = { settleOn: "load", resolve, reject };
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
      zoom: toNormalisedZoom(map.getZoom(), ENGINE),
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
    if (!isVector(basemap)) {
      return Promise.reject(
        new MapEngineError(
          "load-failed",
          `The MapLibre adapter cannot show the ${basemap.source.kind} basemap "${basemap.id}".`,
        ),
      );
    }
    if (!map || this.destroyed) {
      return Promise.reject(
        new MapEngineError("load-failed", "The map is not mounted."),
      );
    }
    this.settlePending();
    this.basemap = basemap;
    const minZoom = toEngineZoom(basemap.minZoom, ENGINE);
    const maxZoom = toEngineZoom(basemap.maxZoom, ENGINE);
    // MapLibre throws if a new minimum passes the current maximum, or the reverse.
    if (minZoom > map.getMaxZoom()) {
      map.setMaxZoom(maxZoom);
      map.setMinZoom(minZoom);
    } else {
      map.setMinZoom(minZoom);
      map.setMaxZoom(maxZoom);
    }
    this.loadEmitted = false;
    const swapped = new Promise<void>((resolve, reject) => {
      this.pending = { settleOn: "style.load", resolve, reject };
    });
    // A diffed swap fires no "style.load", so the promise could never settle.
    map.setStyle(basemap.source.styleUrl, { diff: false });
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

  private createOptions(
    host: HTMLElement,
    styleUrl: string,
    view: ViewState,
    reducedMotion: boolean,
  ): MapOptions {
    const basemap = this.basemap as BasemapDefinition;
    return {
      container: host,
      style: styleUrl,
      center: [view.center.lng, view.center.lat],
      zoom: this.engineZoom(view.zoom),
      bearing: view.bearing,
      pitch: 0,
      minZoom: toEngineZoom(basemap.minZoom, ENGINE),
      maxZoom: toEngineZoom(basemap.maxZoom, ENGINE),
      maxPitch: 0,
      attributionControl: false,
      maplibreLogo: false,
      // The ui implements keys once for both engines.
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
    const emitView = (event: "move" | "moveEnd" | "zoom" | "rotate") => () => {
      this.emitter.emit(event, this.getView());
    };

    listen("move", emitView("move"));
    listen("moveend", emitView("moveEnd"));
    listen("zoom", emitView("zoom"));
    listen("rotate", emitView("rotate"));
    listen("click", (event) => {
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
      this.settlePending("style.load");
    });
    listen("load", () => {
      this.emitLoad();
      this.settlePending("load");
    });
    listen("idle", () => {
      this.setLoading(false);
      this.emitLoad();
    });
    listen("error", (event) => {
      // Listening to "error" silences MapLibre's own console logging.
      console.error("MapLibre basemap error", event.error);
      if (!isTileOrSourceError(event) && this.pending) {
        const { reject } = this.pending;
        this.pending = undefined;
        reject(
          new MapEngineError(
            "load-failed",
            `The basemap style could not be loaded: ${String(event.error)}`,
          ),
        );
      }
      this.emitter.emit("tileError", undefined);
    });
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

  /** Resolves the waiting mount or swap; with `event`, only if it waits for that event. */
  private settlePending(event?: PendingLoad["settleOn"]): void {
    const pending = this.pending;
    if (!pending || (event !== undefined && pending.settleOn !== event)) {
      return;
    }
    this.pending = undefined;
    pending.resolve();
  }

  private teardownMap(): void {
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
      ENGINE,
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

/** Builds the MapLibre adapter. Pass it to the composition root's adapter factory for vector basemaps. */
export function createMapLibreMapAdapter(): MapAdapter {
  return new MapLibreMapAdapter();
}
