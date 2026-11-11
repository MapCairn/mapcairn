import { distanceMetres, EARTH_RADIUS_METRES } from "../draw/geo";
import {
  dragHandle,
  type HandleGesture,
  type HandlePointer,
  handleReach,
  pressHandle,
} from "../draw/gesture";
import { hitTestHandle, type ProjectedHandle } from "../draw/hit";
import type { BasemapDefinition } from "../ports/basemap";
import { MapEngineError, type MapEngineErrorReason } from "../ports/errors";
import type { Bounds, LatLng, PixelPoint, ViewState } from "../ports/geometry";
import type {
  MapAdapter,
  MapAdapterFactory,
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
  MapProjection,
  MapShapes,
  MapStyledShapes,
  MapTileOverlay,
  MapVectorTiles,
} from "../ports/map";
import {
  clampZoom,
  MAX_MERCATOR_LATITUDE,
  mercatorProject,
  mercatorUnproject,
  metresPerPixel,
} from "../zoom/zoom";

/** The view a {@link FakeMapAdapter} starts with before it is mounted. */
export const DEFAULT_FAKE_VIEW: ViewState = Object.freeze({
  center: Object.freeze({ lat: 0, lng: 0 }),
  zoom: 2,
  bearing: 0,
});

/** Options for {@link FakeMapAdapter}. */
export interface FakeMapAdapterOptions {
  /** Makes `mount` reject with a `MapEngineError` of this reason. */
  readonly failMount?: MapEngineErrorReason;
}

/** A host element double of a fixed size, recording focus calls. */
export class FakeMapHost implements MapHostElement {
  readonly focusCalls: ({ preventScroll?: boolean } | undefined)[] = [];

  constructor(
    readonly width = 800,
    readonly height = 600,
  ) {}

  focus(options?: { preventScroll?: boolean }): void {
    this.focusCalls.push(options);
  }

  getBoundingClientRect(): {
    readonly width: number;
    readonly height: number;
    readonly left: number;
    readonly top: number;
  } {
    return { width: this.width, height: this.height, left: 0, top: 0 };
  }
}

type Handler = (payload: never) => void;

/** What a deferred basemap swap waits on (see `FakeMapAdapter.deferNextBasemap`). */
interface SwapGate {
  readonly promise: Promise<void>;
}

type DataLayer =
  | { readonly kind: "features"; readonly features: readonly MapFeature[] }
  | { readonly kind: "tiles"; readonly overlay: MapTileOverlay }
  | { readonly kind: "shapes"; readonly shapes: MapShapes }
  | { readonly kind: "styled"; readonly layer: MapStyledShapes }
  | { readonly kind: "vector"; readonly layer: MapVectorTiles }
  | { readonly kind: "heatmap"; readonly heatmap: MapHeatmap };

/**
 * A data layer as an engine draws it, lowest first, for tests and the map
 * adapter contract to compare adapters by.
 */
export type DrawnLayer =
  | {
      readonly id: string;
      readonly kind: "features" | "shapes";
      readonly count: number;
    }
  | {
      readonly id: string;
      readonly kind: "tiles";
      readonly tiles: string;
      readonly opacity: number;
    }
  | {
      readonly id: string;
      readonly kind: "styled";
      readonly geometry: "area" | "line";
      readonly count: number;
    }
  | {
      readonly id: string;
      readonly kind: "vector";
      readonly tiles: string;
      readonly sourceLayers: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "heatmap";
      readonly source: "points" | "vector";
      /** The points drawn, or 0 for a vector source. */
      readonly count: number;
    };

/** Stacking order, lowest first: imagery, vector tiles, styled shapes, detail shapes, heatmaps, points. */
const KIND_ORDER: Readonly<Record<DataLayer["kind"], number>> = {
  tiles: 0,
  vector: 1,
  styled: 2,
  shapes: 3,
  heatmap: 4,
  features: 5,
};

function firstPosition(
  geometry: MapStyledShapes["shapes"][number]["geometry"],
): readonly [number, number] | null {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates;
    case "LineString":
      return geometry.coordinates[0] ?? null;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates[0]?.[0] ?? null;
    case "MultiPolygon":
      return geometry.coordinates[0]?.[0]?.[0] ?? null;
  }
}

function wrapBearing(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * A pure in-memory {@link MapAdapter}: no engine, no DOM, no timers.
 *
 * How to script it:
 * - Pass `failMount: "webgl-unavailable"` (or `"load-failed"`) to make
 *   `mount` reject with a `MapEngineError`.
 * - Mount it into a {@link FakeMapHost}; the host's size (800 by 600 by
 *   default) sets the pixel space used by `project` and `unproject`.
 * - Drive events with `simulateClick`, `simulateTileError`,
 *   `simulateLoading`, `simulateUserZoom` (a wheel, pinch or double-click)
 *   `simulateFatalError` (the engine stopping after it loaded), and
 *   `simulatePointerDown`, `simulatePointerMove` and `simulatePointerUp` (a
 *   mouse or finger on the map, which drive edit handles). Call
 *   `failNextBasemap` to make the next swap fail. `setView`, `zoomIn`, `panBy` and the rest emit real
 *   `move`, `zoom`, `rotate` and `moveEnd` events, and only when something
 *   changed.
 * - Inspect `mountCount`, `destroyed`, `animationEnabled`, `keyboardEnabled`
 *   and `focusCount`.
 *
 * Animation options are accepted and ignored, because every change is
 * immediate. `project` ignores the bearing.
 */
export class FakeMapAdapter implements MapAdapter {
  mountCount = 0;
  focusCount = 0;
  animationEnabled = true;
  keyboardEnabled = true;
  /** Whether the last `mount` or `setBasemap` asked for Save data mode. */
  saveData = false;
  /** The shape the map was last asked to draw. */
  projection: MapProjection = "flat";

  #failMount: MapEngineErrorReason | undefined;
  #failNextBasemap = false;
  /** The next swap waits on this until the test settles it. */
  #nextSwapGate: SwapGate | null = null;
  /** The basemap a swap in flight is loading, until it has loaded or failed. */
  #swapTarget: BasemapDefinition | null = null;
  #view: ViewState = DEFAULT_FAKE_VIEW;
  #basemap: BasemapDefinition | null = null;
  #host: MapHostElement | null = null;
  #hostSize = { width: 800, height: 600 };
  #destroyed = false;
  #listeners = new Map<keyof MapEvents, Set<Handler>>();
  #dataLayers = new Map<string, DataLayer>();
  #hitsAtPointer: readonly MapFeatureHit[] = [];
  #failNextImage = false;
  /** The options of every `toImage` call, in order. */
  readonly imageRequests: (MapImageOptions | undefined)[] = [];
  #handles: readonly MapEditHandle[] = [];
  #gesture: HandleGesture | null = null;
  #hovered: string | null = null;
  #swallowClick = false;

  constructor(options: FakeMapAdapterOptions = {}) {
    this.#failMount = options.failMount;
  }

  /** True after `destroy`, until the next successful `mount`. */
  get destroyed(): boolean {
    return this.#destroyed;
  }

  async mount(host: MapHostElement, options: MapMountOptions): Promise<void> {
    if (this.#failMount !== undefined) {
      throw new MapEngineError(this.#failMount);
    }
    const { width, height } = host.getBoundingClientRect();
    this.#host = host;
    this.#hostSize = { width, height };
    this.#basemap = options.basemap;
    this.#view = this.#normalise(options.view);
    this.animationEnabled = !options.reducedMotion;
    this.saveData = options.saveData ?? false;
    this.projection = options.projection ?? "flat";
    this.#destroyed = false;
    this.mountCount += 1;
    this.#emit("load", undefined);
  }

  destroy(): void {
    this.#destroyed = true;
    this.#host = null;
    this.#listeners.clear();
  }

  getView(): ViewState {
    return this.#view;
  }

  setView(view: Partial<ViewState>): void {
    this.#applyView({ ...this.#view, ...view });
  }

  zoomIn(): void {
    this.setView({ zoom: this.#view.zoom + 1 });
  }

  zoomOut(): void {
    this.setView({ zoom: this.#view.zoom - 1 });
  }

  panBy(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) {
      return;
    }
    const { zoom, center } = this.#view;
    const world = mercatorProject(center, zoom);
    const limit = mercatorProject(
      { lat: -MAX_MERCATOR_LATITUDE, lng: 0 },
      zoom,
    );
    this.setView({
      center: mercatorUnproject(
        { x: world.x + dx, y: Math.min(limit.y, Math.max(0, world.y + dy)) },
        zoom,
      ),
    });
  }

  rotateBy(degrees: number): void {
    this.setView({ bearing: this.#view.bearing + degrees });
  }

  resetBearing(): void {
    this.setView({ bearing: 0 });
  }

  fitBounds(bounds: Bounds, options: MapFitOptions = {}): void {
    const { top = 0, right = 0, bottom = 0, left = 0 } = options.padding ?? {};
    const southWest = mercatorProject(
      { lat: bounds.south, lng: bounds.west },
      0,
    );
    const northEast = mercatorProject(
      { lat: bounds.north, lng: bounds.east },
      0,
    );
    const spanX = Math.abs(northEast.x - southWest.x);
    const spanY = Math.abs(southWest.y - northEast.y);
    const availableX = Math.max(1, this.#hostSize.width - left - right);
    const availableY = Math.max(1, this.#hostSize.height - top - bottom);
    const fitted = Math.min(
      Math.log2(availableX / spanX),
      Math.log2(availableY / spanY),
    );
    this.setView({
      center: {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2,
      },
      zoom: Math.min(fitted, options.maxZoom ?? Number.POSITIVE_INFINITY),
    });
  }

  getMinZoom(): number {
    return this.#basemap?.minZoom ?? 0;
  }

  getMaxZoom(): number {
    return this.#basemap?.maxZoom ?? 18;
  }

  project(latlng: LatLng): PixelPoint {
    const { center, zoom } = this.#view;
    const world = mercatorProject(latlng, zoom);
    const origin = mercatorProject(center, zoom);
    return {
      x: world.x - origin.x + this.#hostSize.width / 2,
      y: world.y - origin.y + this.#hostSize.height / 2,
    };
  }

  /** On a globe, a place more than a quarter of the way round from the centre is out of sight. */
  isVisible(latlng: LatLng): boolean {
    return (
      this.projection === "flat" ||
      distanceMetres(this.#view.center, latlng) <=
        (Math.PI / 2) * EARTH_RADIUS_METRES
    );
  }

  setProjection(projection: MapProjection): void {
    this.projection = projection;
  }

  unproject(point: PixelPoint): LatLng {
    const { center, zoom } = this.#view;
    const origin = mercatorProject(center, zoom);
    return mercatorUnproject(
      {
        x: point.x - this.#hostSize.width / 2 + origin.x,
        y: point.y - this.#hostSize.height / 2 + origin.y,
      },
      zoom,
    );
  }

  metresPerPixel(lat: number = this.#view.center.lat): number {
    return metresPerPixel(lat, this.#view.zoom);
  }

  async setBasemap(
    basemap: BasemapDefinition,
    options: MapBasemapOptions = {},
  ): Promise<void> {
    if (this.#failNextBasemap) {
      this.#failNextBasemap = false;
      throw new MapEngineError(
        "load-failed",
        "The fake basemap style could not be loaded.",
      );
    }
    this.#swapTarget = basemap;
    const gate = this.#nextSwapGate;
    this.#nextSwapGate = null;
    if (gate) {
      try {
        await gate.promise;
      } catch (error) {
        if (this.#swapTarget === basemap) {
          this.#swapTarget = null;
        }
        throw error;
      }
    }
    if (this.#swapTarget !== basemap) {
      // A newer swap took over while this one waited: nothing loaded.
      return;
    }
    this.#swapTarget = null;
    this.#basemap = basemap;
    this.saveData = options.saveData ?? false;
    this.#applyView(this.#view);
    this.#emit("load", undefined);
  }

  /**
   * Makes the next `setBasemap` wait, as a real style that is still
   * downloading does, until `resolve` (the swap loads) or `reject` (it fails
   * with a `load-failed` `MapEngineError` and the last basemap stays). While
   * it waits the basemap is the old one, and `toImage` refuses.
   */
  deferNextBasemap(): {
    readonly resolve: () => void;
    readonly reject: () => void;
  } {
    let resolve = () => {};
    let reject = () => {};
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = () =>
        fail(
          new MapEngineError(
            "load-failed",
            "The fake basemap style could not be loaded.",
          ),
        );
    });
    // The caller may never settle a deferred swap it no longer needs.
    promise.catch(() => {});
    this.#nextSwapGate = { promise };
    return { resolve, reject };
  }

  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled;
  }

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
  }

  focus(): void {
    this.focusCount += 1;
    this.#host?.focus({ preventScroll: true });
  }

  on<K extends keyof MapEvents>(
    event: K,
    handler: (payload: MapEvents[K]) => void,
  ): () => void {
    const handlers = this.#listeners.get(event) ?? new Set<Handler>();
    handlers.add(handler as Handler);
    this.#listeners.set(event, handlers);
    return () => {
      handlers.delete(handler as Handler);
    };
  }

  setFeatureLayer(id: string, features: readonly MapFeature[]): void {
    this.#dataLayers.delete(id);
    this.#dataLayers.set(id, { kind: "features", features: [...features] });
  }

  setTileLayer(id: string, overlay: MapTileOverlay): void {
    this.#dataLayers.delete(id);
    this.#dataLayers.set(id, { kind: "tiles", overlay });
  }

  setShapeLayer(id: string, shapes: MapShapes): void {
    this.#dataLayers.delete(id);
    this.#dataLayers.set(id, { kind: "shapes", shapes });
  }

  setStyledShapes(id: string, layer: MapStyledShapes): void {
    this.#dataLayers.delete(id);
    this.#dataLayers.set(id, { kind: "styled", layer });
  }

  setVectorLayer(id: string, layer: MapVectorTiles): void {
    this.#dataLayers.delete(id);
    this.#dataLayers.set(id, { kind: "vector", layer });
  }

  setHeatmapLayer(id: string, heatmap: MapHeatmap): void {
    this.#dataLayers.delete(id);
    this.#dataLayers.set(id, { kind: "heatmap", heatmap });
  }

  removeLayer(id: string): void {
    this.#dataLayers.delete(id);
  }

  /**
   * The features most recently scripted under the pointer with
   * `simulateFeatureHits` or `simulateFeatureTap`, still drawn, in the order
   * scripted. A real engine finds them by position; the fake cannot, so a
   * test says what is there.
   */
  featuresAt(_point: PixelPoint): readonly MapFeatureHit[] {
    return this.#hitsAtPointer.filter((hit) => this.#hasFeature(hit));
  }

  getBounds(): Bounds {
    const { width, height } = this.#hostSize;
    const corners = [
      this.unproject({ x: 0, y: 0 }),
      this.unproject({ x: width, y: 0 }),
      this.unproject({ x: 0, y: height }),
      this.unproject({ x: width, y: height }),
    ];
    const lats = corners.map((corner) => corner.lat);
    const lngs = corners.map((corner) => corner.lng);
    return {
      west: Math.min(...lngs),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      north: Math.max(...lats),
    };
  }

  async toImage(options?: MapImageOptions): Promise<Blob> {
    this.imageRequests.push(options);
    if (this.#failNextImage) {
      this.#failNextImage = false;
      throw new MapEngineError(
        "export-failed",
        "The fake map could not produce an image.",
      );
    }
    if (this.#host === null) {
      throw new MapEngineError("export-failed", "The map is not mounted.");
    }
    this.#refuseExport();
    // A real engine waits for its tiles here, and a swap can start meanwhile.
    await Promise.resolve();
    this.#refuseExport();
    // The PNG signature, so the blob is recognisably an image without an encoder.
    return new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: "image/png" },
    );
  }

  /**
   * Refuses an image while the terms of the basemap on screen, or of the one
   * a swap is loading, forbid it, and while a swap is loading at all.
   */
  #refuseExport(): void {
    if (
      this.#basemap?.allowsImageExport === false ||
      this.#swapTarget?.allowsImageExport === false
    ) {
      throw new MapEngineError(
        "export-blocked",
        "The basemap's terms do not allow saving an image of the map.",
      );
    }
    if (this.#swapTarget !== null) {
      throw new MapEngineError(
        "export-failed",
        "The basemap is still loading, so the map cannot be saved yet.",
      );
    }
  }

  /** Makes the next `toImage` reject with an `export-failed` `MapEngineError`. */
  failNextImage(): void {
    this.#failNextImage = true;
  }

  setEditHandles(handles: readonly MapEditHandle[]): void {
    this.#handles = [...handles];
    if (this.#hovered !== null && !this.#hasHandle(this.#hovered)) {
      this.#hovered = null;
      this.#emit("handleHover", null);
    }
  }

  /** The edit handles last set. */
  editHandles(): readonly MapEditHandle[] {
    return this.#handles;
  }

  /**
   * A mouse or finger going down at a position. On a handle it starts a
   * `handleDrag`; anywhere else it starts nothing.
   */
  simulatePointerDown(latlng: LatLng, pointer: HandlePointer = "mouse"): void {
    this.#swallowClick = false;
    const gesture = pressHandle(
      this.#projectedHandles(),
      this.project(latlng),
      pointer,
    );
    this.#gesture = gesture;
    if (gesture) {
      this.#emit("handleDrag", {
        id: gesture.id,
        phase: "start",
        latlng,
        moved: false,
      });
    }
  }

  /**
   * The pointer moving to a position. During a press on a handle, once it
   * has left the click tolerance, it reports `move`; otherwise a mouse
   * reports `handleHover` as it crosses handles.
   */
  simulatePointerMove(latlng: LatLng, pointer: HandlePointer = "mouse"): void {
    const point = this.project(latlng);
    if (this.#gesture) {
      this.#gesture = dragHandle(this.#gesture, point);
      if (this.#gesture.moved) {
        this.#emit("handleDrag", {
          id: this.#gesture.id,
          phase: "move",
          latlng,
          moved: true,
        });
      }
      return;
    }
    if (pointer !== "mouse") {
      return;
    }
    const hit = hitTestHandle(
      this.#projectedHandles(),
      point,
      handleReach("mouse"),
    );
    const id = hit?.id ?? null;
    if (id !== this.#hovered) {
      this.#hovered = id;
      this.#emit("handleHover", id);
    }
  }

  /**
   * The pointer going up at a position. It ends a press on a handle, and the
   * `click` that would follow it is then dropped, as an engine's is.
   */
  simulatePointerUp(latlng: LatLng): void {
    const gesture = this.#gesture;
    this.#gesture = null;
    if (!gesture) {
      return;
    }
    this.#swallowClick = true;
    this.#emit("handleDrag", {
      id: gesture.id,
      phase: "end",
      latlng,
      moved: gesture.moved,
    });
  }

  #hasHandle(id: string): boolean {
    return this.#handles.some((handle) => handle.id === id);
  }

  #projectedHandles(): ProjectedHandle[] {
    return this.#handles.map((handle) => ({
      id: handle.id,
      kind: handle.kind,
      point: this.project(handle.position),
    }));
  }

  /** The data layers drawn, lowest first: imagery, vector tiles, styled shapes, detail shapes, heatmaps, then points. */
  drawnLayers(): DrawnLayer[] {
    return [...this.#dataLayers]
      .sort(([, a], [, b]) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
      .map(([id, layer]): DrawnLayer => {
        if (layer.kind === "features") {
          return { id, kind: "features", count: layer.features.length };
        }
        if (layer.kind === "shapes") {
          return { id, kind: "shapes", count: layer.shapes.geometries.length };
        }
        if (layer.kind === "styled") {
          return {
            id,
            kind: "styled",
            geometry: layer.layer.geometry,
            count: layer.layer.shapes.length,
          };
        }
        if (layer.kind === "vector") {
          return {
            id,
            kind: "vector",
            tiles: layer.layer.source.tiles,
            sourceLayers: layer.layer.layers.map((item) => item.sourceLayer),
          };
        }
        if (layer.kind === "heatmap") {
          const { source } = layer.heatmap;
          return {
            id,
            kind: "heatmap",
            source: source.kind,
            count: source.kind === "points" ? source.points.length : 0,
          };
        }
        return {
          id,
          kind: "tiles",
          tiles: layer.overlay.tiles,
          opacity: layer.overlay.opacity,
        };
      });
  }

  /** The polygons or lines drawn for a styled layer, or undefined when none is drawn under `id`. */
  styledShapesOf(id: string): MapStyledShapes | undefined {
    const layer = this.#dataLayers.get(id);
    return layer?.kind === "styled" ? layer.layer : undefined;
  }

  /** The vector tile layer drawn under `id`, or undefined. */
  vectorLayerOf(id: string): MapVectorTiles | undefined {
    const layer = this.#dataLayers.get(id);
    return layer?.kind === "vector" ? layer.layer : undefined;
  }

  /** The heatmap drawn under `id`, or undefined. */
  heatmapOf(id: string): MapHeatmap | undefined {
    const layer = this.#dataLayers.get(id);
    return layer?.kind === "heatmap" ? layer.heatmap : undefined;
  }

  #hasFeature(hit: MapFeatureHit): boolean {
    const layer = this.#dataLayers.get(hit.layerId);
    if (layer?.kind === "features") {
      return layer.features.some((feature) => feature.id === hit.featureId);
    }
    if (layer?.kind === "styled") {
      return layer.layer.shapes.some((shape) => shape.id === hit.featureId);
    }
    return false;
  }

  /** The points drawn for a feed layer, or undefined when none is drawn under `id`. */
  featuresOf(id: string): readonly MapFeature[] | undefined {
    const layer = this.#dataLayers.get(id);
    return layer?.kind === "features" ? layer.features : undefined;
  }

  /**
   * Emits `featureTap` and then `click` for a tap on a drawn point, polygon or
   * line, as an engine does. A feature that is not drawn gets nothing.
   */
  simulateFeatureTap(layerId: string, featureId: string): void {
    this.simulateFeatureHits([{ layerId, featureId }]);
  }

  /**
   * Emits `featureTap` for a tap that lands on several features at once,
   * topmost first, and then `click`. Only features that are drawn count, each
   * once; with none drawn nothing is emitted. They are also what
   * `featuresAt` then reports.
   */
  simulateFeatureHits(hits: readonly MapFeatureHit[]): void {
    const seen = new Set<string>();
    const drawn = hits.filter((hit) => {
      const key = `${hit.layerId}\u0000${hit.featureId}`;
      if (seen.has(key) || !this.#hasFeature(hit)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    this.#hitsAtPointer = drawn;
    const [top] = drawn;
    if (!top) {
      return;
    }
    this.#emit("featureTap", { ...top, hits: drawn });
    this.simulateClick(this.#centreOf(top));
  }

  #centreOf(hit: MapFeatureHit): LatLng {
    const layer = this.#dataLayers.get(hit.layerId);
    if (layer?.kind === "features") {
      const feature = layer.features.find((f) => f.id === hit.featureId);
      if (feature) {
        return feature.position;
      }
    }
    if (layer?.kind === "styled") {
      const shape = layer.layer.shapes.find((s) => s.id === hit.featureId);
      const first = shape ? firstPosition(shape.geometry) : null;
      if (first) {
        return { lng: first[0], lat: first[1] };
      }
    }
    return this.#view.center;
  }

  /** Emits a `click` at a position, with the given `features`. */
  simulateClick(
    latlng: LatLng,
    features: MapClickEvent["features"] = [],
  ): void {
    if (this.#swallowClick) {
      this.#swallowClick = false;
      return;
    }
    this.#emit("click", {
      latlng,
      point: this.project(latlng),
      features,
    });
  }

  /** Emits a `tileError`. */
  simulateTileError(): void {
    this.#emit("tileError", undefined);
  }

  /** Emits `loading` with the given state. */
  simulateLoading(loading: boolean): void {
    this.#emit("loading", loading);
  }

  /**
   * Zooms to `zoom` the way a gesture the engine handles would: the view
   * events fire as for `setView`, and `userZoom` fires with them.
   */
  simulateUserZoom(zoom: number): void {
    this.#applyView({ ...this.#view, zoom }, true);
  }

  /**
   * Makes the next `setBasemap` reject with a `load-failed` `MapEngineError`,
   * leaving the current basemap, its zoom limits and the view as they were,
   * as a real engine does when a new style cannot load.
   */
  failNextBasemap(): void {
    this.#failNextBasemap = true;
  }

  /** Emits `fatalError`, as an engine that stopped working after it loaded. */
  simulateFatalError(): void {
    this.#emit(
      "fatalError",
      new MapEngineError("stopped", "The fake map engine stopped working."),
    );
  }

  #normalise(view: ViewState): ViewState {
    return {
      center: {
        lat: Math.min(
          MAX_MERCATOR_LATITUDE,
          Math.max(-MAX_MERCATOR_LATITUDE, view.center.lat),
        ),
        lng: wrapLongitude(view.center.lng),
      },
      zoom: clampZoom(view.zoom, this.getMinZoom(), this.getMaxZoom()),
      bearing: wrapBearing(view.bearing),
    };
  }

  #applyView(requested: ViewState, byUser = false): void {
    const previous = this.#view;
    const next = this.#normalise(requested);
    const moved =
      next.center.lat !== previous.center.lat ||
      next.center.lng !== previous.center.lng;
    const zoomed = next.zoom !== previous.zoom;
    const rotated = next.bearing !== previous.bearing;
    if (!moved && !zoomed && !rotated) {
      return;
    }
    this.#view = next;
    this.#emit("move", next);
    if (zoomed) {
      this.#emit("zoom", next);
      if (byUser) {
        this.#emit("userZoom", next);
      }
    }
    if (rotated) {
      this.#emit("rotate", next);
    }
    this.#emit("moveEnd", next);
  }

  #emit<K extends keyof MapEvents>(event: K, payload: MapEvents[K]): void {
    for (const handler of [...(this.#listeners.get(event) ?? [])]) {
      (handler as (payload: MapEvents[K]) => void)(payload);
    }
  }
}

/**
 * Builds a `MapAdapterFactory` of fakes. `onCreate` receives each adapter
 * built, so a test can script it.
 */
export function createFakeMapAdapterFactory(
  onCreate?: (adapter: FakeMapAdapter) => void,
): MapAdapterFactory {
  return () => {
    const adapter = new FakeMapAdapter();
    onCreate?.(adapter);
    return adapter;
  };
}
