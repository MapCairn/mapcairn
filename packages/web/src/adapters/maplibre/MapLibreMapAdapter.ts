// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  Bounds,
  LatLng,
  MapAdapter,
  MapBasemapOptions,
  MapClickEvent,
  MapEditHandle,
  MapEvents,
  MapFeature,
  MapFeatureHit,
  MapFitOptions,
  MapHeatmap,
  MapHostElement,
  MapImageOptions,
  MapMountOptions,
  MapMoveOptions,
  MapProjection,
  MapShapes,
  MapStyledShapes,
  MapTileOverlay,
  MapVectorTiles,
  PixelPoint,
  ViewState,
  VisibleMap,
} from "@mapcairn/core";
import { MAX_MERCATOR_LATITUDE, MapEngineError } from "@mapcairn/core";
import type {
  MapEventType,
  Map as MapLibreMap,
  Subscription,
} from "maplibre-gl";
import { Emitter } from "../shared/emitter";
import { BasemapLoadState } from "./basemapLoadState";
import {
  applyZoomLimits,
  composeHybrid,
  omitSaveDataLayers,
  styleFor,
} from "./basemapStyle";
import { isBasemapSource } from "./basemapTiles";
import { Camera, pixelOf, viewOfMap } from "./camera";
import type { DataLayer } from "./dataLayerPlan";
import { DataLayerStore, toPropertyBag } from "./dataLayerStore";
import { EditHandleController } from "./editHandles";
import { isUserEvent } from "./engineErrors";
import { loadEngine, type MapLibreModule } from "./engineLoader";
import { engineMapOptions, neutraliseEngineAccessibility } from "./engineMap";
import { FailureDetection } from "./failureDetection";
import { MapImageExporter } from "./imageExport";
import { OverlayPlacement } from "./overlayPlacement";
import type { PendingLoad } from "./pendingLoad";
import { positionOf } from "./positionOf";
import { RenderMapOpener } from "./renderMapOpener";

export { dataLayerEngineIds } from "./dataLayerPlan";
export { loadEngine } from "./engineLoader";
export { IMAGE_TILES_WAIT_MS, IMAGE_WAIT_MS } from "./imageExport";
export { TILE_SETTLE_NUDGE_MS } from "./repaintUntilIdle";
export { TILE_LAYER_SLOW_MS } from "./tileLayerTraffic";
export { WORKER_FAILURE_GRACE_MS } from "./workerFailureCheck";

/** Options for {@link MapLibreMapAdapter}. */
export interface MapLibreMapAdapterOptions {
  /** Overrides {@link WORKER_FAILURE_GRACE_MS}, for example 0 in a test. */
  readonly workerFailureGraceMs?: number;
  /**
   * Added to the engine worker's URL, so a worker cached under an older
   * Content Security Policy is fetched again when the policy changes.
   */
  readonly workerCacheKey?: string;
  /** Overrides {@link IMAGE_TILES_WAIT_MS}, for example a few milliseconds in a test. */
  readonly imageTilesWaitMs?: number;
  /** Overrides {@link TILE_LAYER_SLOW_MS}, for example a few milliseconds in a test. */
  readonly tileLayerSlowMs?: number;
}

function isElement(host: MapHostElement): host is MapHostElement & HTMLElement {
  return typeof HTMLElement !== "undefined" && host instanceof HTMLElement;
}

/**
 * The {@link MapAdapter}, running `maplibre-gl` natively with MapLibre owning
 * every pointer and touch gesture. Vector basemaps load their style URL;
 * raster basemaps are drawn from an inline raster style.
 * @remarks The class keeps the map and the lifecycle (`mount`, `destroy`, the
 *   pending style load and `style.load`) and hands each other job to a module
 *   it holds: the camera (`camera.ts`), data layers (`dataLayerStore.ts`), edit
 *   handles (`editHandles.ts`), image export (`imageExport.ts` and
 *   `renderMapOpener.ts`), the busy state (`basemapLoadState.ts`) and failure
 *   detection (`failureDetection.ts`). Of these only the engine loader and the
 *   type-only imports reach `maplibre-gl`.
 *
 *   The port speaks normalised (256 px tile) zoom, and MapLibre counts
 *   512 px tiles, so every zoom crossing the boundary goes through
 *   `toEngineZoom` and `toNormalisedZoom`. The adapter adds no controls,
 *   markers or popups: the pin, measure line and other overlays are drawn by
 *   the ui from `project()`. Data layers (feed points, tile overlays, detail
 *   shapes) are the exception, because hundreds of points or a tiled image
 *   belong in the engine: each is kept by id, drawn as `mapcairn:<id>` sources
 *   and layers above the basemap (tiles, then shapes, then points), and drawn
 *   again after every `style.load`, because a full style swap drops them.
 *   `maplibre-gl` and its stylesheet are imported the first time `mount` runs.
 *
 *   In Save data mode each style that loads has the basemap's
 *   `saveDataOmitLayers` removed in the `style.load` handler (see
 *   `omitSaveDataLayers`), so no code here names a basemap. MapLibre's
 *   `transformStyle` option is avoided on purpose: with it set, a style swap
 *   waits for the current style to load, so after a failed swap the last good
 *   basemap would never be put back.
 *
 *   How engine `error` events are classified is described on
 *   {@link FailureDetection}.
 */
export class MapLibreMapAdapter implements MapAdapter {
  private readonly emitter = new Emitter<MapEvents>();
  /** The edit handles live here, not in the style, so a basemap swap keeps them. */
  private readonly editHandles = new EditHandleController({
    placement: () => this.placements.of(),
    emitDrag: (drag) => this.emitter.emit("handleDrag", drag),
    emitHover: (id) => this.emitter.emit("handleHover", id),
  });
  private readonly imageExporter: MapImageExporter;
  private readonly renderMaps: RenderMapOpener;
  private readonly camera = new Camera({
    map: () => this.map,
    zoomLimits: () => ({ min: this.getMinZoom(), max: this.getMaxZoom() }),
  });
  private readonly placements = new OverlayPlacement({
    map: () => this.map,
    viewOf: (map) => this.viewOf(map),
  });
  private readonly failure: FailureDetection;
  /** The data layers the ui has set, and what the engine holds for them. */
  private readonly dataLayers: DataLayerStore;
  private readonly loadState = new BasemapLoadState();
  /** Aborts when the adapter is destroyed, for an export that is waiting. */
  private readonly lifetime = new AbortController();
  /** Counts the changes to the basemap, data layers and projection, for an export that waited in the queue. */
  private styleVersion = 0;
  private readonly workerCacheKey: string | undefined;
  private map: MapLibreMap | undefined;
  private host: MapHostElement | undefined;
  private basemap: BasemapDefinition | undefined;
  /** The basemap whose style document last loaded: what a failed swap goes back to. */
  private committedBasemap: BasemapDefinition | undefined;
  private mountView: ViewState | undefined;
  private subscriptions: Subscription[] = [];
  private pending: PendingLoad | undefined;
  private started = false;
  private destroyed = false;
  /** Whether the basemap's `saveDataOmitLayers` are left out of its style. */
  private saveData = false;
  private loadEmitted = false;
  /** True between a style's `style.load` and the next swap: only then can sources be added. */
  private styleReady = false;

  constructor(options: MapLibreMapAdapterOptions = {}) {
    this.workerCacheKey = options.workerCacheKey;
    this.failure = new FailureDetection(
      {
        tileError: () => this.emitter.emit("tileError", undefined),
        basemapUnavailable: (basemap) =>
          this.emitter.emit("basemapUnavailable", basemap),
        fatalError: (error) => this.emitter.emit("fatalError", error),
        slow: (report) => this.emitter.emit("tileLayerSlow", report),
        recovered: (report) => this.emitter.emit("tileLayerRecovered", report),
        unavailable: (report) =>
          this.emitter.emit("tileLayerUnavailable", report),
      },
      {
        pendingLoad: () => this.pending,
        failPending: (pending, error) => this.failPending(pending, error),
      },
      options,
    );
    this.dataLayers = new DataLayerStore({
      readyMap: () => this.readyMap(),
      changed: () => {
        this.styleVersion += 1;
      },
      tileSources: this.failure.tileSources,
    });
    this.renderMaps = new RenderMapOpener(
      {
        sourceMap: () => (this.destroyed ? undefined : this.map),
        projection: () => this.placements.projection,
        zoomLimits: () => ({ min: this.getMinZoom(), max: this.getMaxZoom() }),
        engineZoom: (zoom) => this.camera.engineZoom(zoom),
        applyProjection: (map) => this.applyProjection(map),
      },
      this.workerCacheKey,
    );
    this.imageExporter = new MapImageExporter(
      {
        mountedMap: () => (this.destroyed ? undefined : this.map),
        isSwapPending: () => this.pending !== undefined,
        placement: (map) => this.placements.of(map),
        visibleMap: () => this.visibleMap(),
        closed: () => this.lifetime.signal,
        styleVersion: () => this.styleVersion,
        openRenderMap: (request) => this.renderMaps.open(request),
      },
      options.imageTilesWaitMs,
    );
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
    this.camera.setAnimationEnabled(!reducedMotion);
    this.saveData = options.saveData ?? false;
    this.placements.choose(options.projection ?? "flat");

    let maplibre: MapLibreModule;
    try {
      maplibre = await loadEngine(this.workerCacheKey);
    } catch (error) {
      throw new MapEngineError(
        "load-failed",
        `MapLibre could not be loaded: ${String(error)}`,
      );
    }
    if (this.destroyed) {
      return;
    }
    this.placements.keepEngine(maplibre);

    let map: MapLibreMap;
    try {
      map = new maplibre.Map(
        engineMapOptions({
          container: host,
          basemap,
          view,
          engineZoom: this.camera.engineZoom(view.zoom),
          reducedMotion,
        }),
      );
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
    this.camera.applyInertia();

    const loaded = new Promise<void>((resolve, reject) => {
      this.pending = { settleOn: "load", resolve, reject, styleLoaded: false };
    });
    this.subscribe(map);
    // The constructor already started the style fetch, before these listeners existed.
    this.loadState.startStyleLoad();
    this.updateLoading();
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
    // An export waiting for its tiles stops at once and removes its render map.
    this.lifetime.abort();
    // An intentional teardown is not a failure, so a waiting caller just resolves.
    this.settlePending();
    this.teardownMap();
    this.emitter.clear();
  }

  getView(): ViewState {
    return this.viewOf(this.map);
  }

  /** The view of `map`, or the view it mounted with when there is no map. */
  private viewOf(map: MapLibreMap | undefined): ViewState {
    if (!map) {
      return (
        this.mountView ?? { center: { lat: 0, lng: 0 }, zoom: 0, bearing: 0 }
      );
    }
    return viewOfMap(map);
  }

  setView(view: Partial<ViewState>, options?: MapMoveOptions): void {
    this.camera.setView(view, options);
  }

  zoomIn(options?: MapMoveOptions): void {
    this.camera.zoomIn(options);
  }

  zoomOut(options?: MapMoveOptions): void {
    this.camera.zoomOut(options);
  }

  panBy(dx: number, dy: number, options?: MapMoveOptions): void {
    this.camera.panBy(dx, dy, options);
  }

  rotateBy(degrees: number, options?: MapMoveOptions): void {
    this.camera.rotateBy(degrees, options);
  }

  resetBearing(options?: MapMoveOptions): void {
    this.camera.resetBearing(options);
  }

  fitBounds(bounds: Bounds, options?: MapFitOptions): void {
    this.camera.fitBounds(bounds, options);
  }

  getMinZoom(): number {
    return this.basemap?.minZoom ?? 0;
  }

  getMaxZoom(): number {
    return this.basemap?.maxZoom ?? 0;
  }

  project(latlng: LatLng): PixelPoint {
    return pixelOf(this.map, latlng);
  }

  /**
   * Asks the engine's own horizon test, which hides a place when the planet
   * lies between the camera and it. A flat map hides nothing.
   */
  isVisible(latlng: LatLng): boolean {
    return this.placements.isVisible(this.map, latlng);
  }

  setProjection(projection: MapProjection): void {
    this.styleVersion += 1;
    this.placements.choose(projection);
    this.applyProjection();
  }

  unproject(point: PixelPoint): LatLng {
    const map = this.map;
    if (!map) {
      return this.getView().center;
    }
    return positionOf(map.unproject([point.x, point.y]));
  }

  metresPerPixel(lat?: number): number {
    return this.placements.metresPerPixel(this.getView(), lat);
  }

  /**
   * The size of the map on screen, and where it looks, for an export that
   * names neither. The size is the layout size in whole pixels
   * (`clientWidth`), which is what the engine sizes its canvas from;
   * `getBoundingClientRect` is fractional.
   */
  private visibleMap(): VisibleMap {
    const { clientWidth, clientHeight } = this.host as HTMLElement;
    return {
      size: { width: clientWidth, height: clientHeight },
      view: this.getView(),
    };
  }

  setBasemap(
    basemap: BasemapDefinition,
    options: MapBasemapOptions = {},
  ): Promise<void> {
    const map = this.map;
    if (!map || this.destroyed) {
      return Promise.reject(
        new MapEngineError("load-failed", "The map is not mounted."),
      );
    }
    this.styleVersion += 1;
    this.settlePending();
    this.saveData = options.saveData ?? false;
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
    this.camera.setAnimationEnabled(enabled);
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
    this.dataLayers.setTiles(id, overlay);
  }

  setShapeLayer(id: string, shapes: MapShapes): void {
    this.setDataLayer(id, { kind: "shapes", shapes });
  }

  setStyledShapes(id: string, layer: MapStyledShapes): void {
    this.setDataLayer(id, { kind: "styled", layer });
  }

  setVectorLayer(id: string, tiles: MapVectorTiles): void {
    this.setDataLayer(id, { kind: "vector", tiles });
  }

  setHeatmapLayer(id: string, heatmap: MapHeatmap): void {
    this.setDataLayer(id, { kind: "heatmap", heatmap });
  }

  featuresAt(point: PixelPoint): readonly MapFeatureHit[] {
    return this.dataLayers.hitsAt(point.x, point.y);
  }

  getBounds(): Bounds {
    const map = this.map;
    if (!map) {
      return {
        west: -180,
        south: -MAX_MERCATOR_LATITUDE,
        east: 180,
        north: MAX_MERCATOR_LATITUDE,
      };
    }
    const bounds = map.getBounds();
    return {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    };
  }

  toImage(options?: MapImageOptions): Promise<Blob> {
    return this.imageExporter.toImage(options);
  }

  removeLayer(id: string): void {
    this.dataLayers.remove(id);
  }

  setEditHandles(handles: readonly MapEditHandle[]): void {
    this.editHandles.setHandles(handles);
  }

  private setDataLayer(id: string, layer: DataLayer): void {
    this.dataLayers.set(id, layer);
  }

  /** Sets the chosen shape on the engine; a style that has not loaded gets it from its `style.load`. */
  private applyProjection(map = this.readyMap()): void {
    this.placements.apply(map);
  }

  /** The map, when its style can take sources and layers; otherwise undefined. */
  private readyMap(): MapLibreMap | undefined {
    return this.styleReady ? this.map : undefined;
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
    listen("mousedown", (event) => this.editHandles.press(event, "mouse"));
    listen("touchstart", (event) => {
      if (event.points.length === 1) {
        this.editHandles.press(event, "touch");
      }
    });
    listen("mousemove", (event) => this.editHandles.move(event, "mouse"));
    listen("touchmove", (event) => this.editHandles.move(event, "touch"));
    listen("mouseup", (event) => this.editHandles.release(event));
    listen("touchend", (event) => this.editHandles.release(event));
    listen("touchcancel", (event) => this.editHandles.release(event));
    listen("click", (event) => {
      if (this.editHandles.dropsClick()) {
        return;
      }
      const tap = this.dataLayers.tapAt(event.point.x, event.point.y);
      if (tap) {
        this.emitter.emit("featureTap", tap);
      }
      const click: MapClickEvent = {
        latlng: positionOf(event.lngLat),
        point: { x: event.point.x, y: event.point.y },
        features: this.renderedProperties(event.point.x, event.point.y),
      };
      this.emitter.emit("click", click);
    });
    listen("styledataloading", () => {
      this.loadState.startStyleLoad();
      this.updateLoading();
    });
    listen("style.load", () => {
      this.failure.styleLoaded(this.basemap);
      // A style may ask for its own projection (VersaTiles Colorful asks for a
      // globe); the app's setting wins. See ARCHITECTURE.md.
      this.applyProjection(map);
      try {
        composeHybrid(map, this.basemap);
      } catch (error) {
        console.error("The hybrid basemap could not be put together", error);
        // A pending mount or swap fails, so it never hangs and a swap puts
        // the last basemap back; its style.load draws the data layers again.
        if (this.pending) {
          this.failPending(this.pending, error);
          return;
        }
      }
      omitSaveDataLayers(map, this.basemap, this.saveData);
      if (this.pending) {
        this.pending.styleLoaded = true;
      }
      this.styleReady = true;
      this.dataLayers.styleChanged();
      this.loadState.styleLoaded(map);
      this.updateLoading();
      this.settlePending("style.load");
      try {
        this.dataLayers.restore(map);
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
      this.loadState.idle(map);
      this.updateLoading();
      this.failure.settled();
    });
    listen("render", () => {
      // A tile answered with a 404 fires no source event, so a frame is when
      // the last of the basemap's tiles can be seen to be in.
      if (this.loadState.loading) {
        this.updateLoading();
      }
    });
    listen("sourcedata", (event) => {
      this.trackBasemapSource(event, map);
      this.failure.tileLoaded(event);
    });
    listen("sourcedataloading", (event) => {
      this.trackBasemapSource(event, map);
      this.failure.tileRequested(event, map);
    });
    listen("sourcedataabort", (event) => {
      this.trackBasemapSource(event, map);
      this.failure.tileAborted(event);
    });
    listen("error", (event) => {
      // Listening to "error" silences MapLibre's own console logging.
      console.error("MapLibre basemap error", event.error);
      this.trackBasemapSource(event, map);
      this.failure.handleError(event, map);
    });
  }

  /** Sets a basemap's zoom limits and style on the engine. */
  private drawBasemap(map: MapLibreMap, basemap: BasemapDefinition): void {
    this.basemap = basemap;
    applyZoomLimits(map, basemap);
    this.loadEmitted = false;
    this.styleReady = false;
    // The new style has nothing in yet.
    this.loadState.startStyleLoad();
    // Tiles from here on belong to no basemap until the new style has loaded.
    this.failure.basemapSwapRequested();
    // A diffed swap fires no "style.load", so a swap could never settle.
    map.setStyle(styleFor(basemap), { diff: false });
    this.updateLoading();
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

  /** Plain property bags of every rendered feature at a pixel, for the click event. */
  private renderedProperties(x: number, y: number): Record<string, unknown>[] {
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

  /**
   * Re-reads the busy state when a source event is about one of the basemap's
   * own sources; a data layer's sources are ignored. A basemap tile being
   * asked for also starts the repaint that lets a map whose last tiles were
   * 404s see it is done (see `RepaintUntilIdle`).
   */
  private trackBasemapSource(event: object, map: MapLibreMap): void {
    if (!isBasemapSource((event as { sourceId?: unknown }).sourceId)) {
      return;
    }
    this.updateLoading();
    if (this.loadState.loading) {
      this.failure.keepPainting(map);
    }
  }

  /**
   * Publishes the busy state: the style and the basemap's own tiles decide it,
   * so a data layer's tile that never answers cannot keep it on. The first
   * moment they are all in settles a waiting mount, because the engine's own
   * `load` waits for every source, data layers included.
   */
  private updateLoading(): void {
    const loading = !this.loadState.isIn(this.map);
    if (!loading) {
      this.emitLoad();
      this.settlePending("load");
      this.failure.basemapIsIn();
    }
    if (this.loadState.publish(loading)) {
      this.emitter.emit("loading", loading);
    }
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
    this.editHandles.reset();
    this.failure.reset();
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
    // `remove()` also releases the WebGL context through WEBGL_lose_context.
    this.map?.remove();
    this.map = undefined;
  }
}

/** Builds a fresh MapLibre adapter. The composition root's adapter factory. */
export function createMapLibreMapAdapter(
  options: MapLibreMapAdapterOptions = {},
): MapAdapter {
  return new MapLibreMapAdapter(options);
}
