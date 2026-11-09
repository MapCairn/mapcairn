import type {
  BasemapDefinition,
  DrawnLayer,
  LatLng,
  PixelPoint,
} from "@karta/core";
import { mercatorProject, mercatorUnproject } from "@karta/core";

/** Test-only width of the fake engine's viewport, in pixels. */
export const FAKE_VIEWPORT_WIDTH = 800;
/** Test-only height of the fake engine's viewport, in pixels. */
export const FAKE_VIEWPORT_HEIGHT = 600;

type Listener = (event: Record<string, unknown>) => void;
type Camera = { center?: [number, number]; zoom?: number; bearing?: number };

/** One recorded call to the fake engine. */
export interface FakeCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function rotate(point: PixelPoint, degrees: number): PixelPoint {
  const cos = Math.cos(toRadians(degrees));
  const sin = Math.sin(toRadians(degrees));
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/**
 * A test-only stand-in for `maplibre-gl`'s `GPUInitializationError`, which
 * the `Map` constructor throws when it cannot create a WebGL2 context.
 */
export class FakeGPUInitializationError extends Error {
  constructor() {
    super("WebGL2 is required to display this map.");
    this.name = "GPUInitializationError";
  }
}

/**
 * A test-only stand-in for `maplibre-gl`'s `Map`, for happy-dom, which has no
 * WebGL. It keeps a real Web Mercator camera in MapLibre's 512 px zoom, so
 * projection, panning, zoom limits and fitting behave like the engine, and it
 * records every call so tests can check what the adapter asked for.
 */
export class FakeMapLibreMap {
  /** Every map built since the last reset, oldest first. */
  static instances: FakeMapLibreMap[] = [];
  /** Thrown by the next constructor call, then cleared. */
  static nextConstructError: Error | undefined;
  /** When true, the map fires `load`, `style.load` and `idle` by itself. */
  static autoLoad = false;
  /**
   * With `autoLoad`, the next `setStyle` fails the way MapLibre reports a
   * style document it could not fetch: an `error` event with no tile or
   * source, and no `style.load`. Then cleared.
   */
  static nextStyleError: Error | undefined;

  /** Clears the static state between tests. */
  static reset(): void {
    FakeMapLibreMap.instances = [];
    FakeMapLibreMap.nextConstructError = undefined;
    FakeMapLibreMap.autoLoad = false;
    FakeMapLibreMap.nextStyleError = undefined;
  }

  readonly options: Record<string, unknown>;
  readonly canvas: HTMLCanvasElement;
  readonly canvasContainer: HTMLDivElement;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly calls: FakeCall[] = [];
  readonly keyboard = {
    enable: () => this.record("keyboard.enable", []),
    disable: () => this.record("keyboard.disable", []),
  };
  readonly dragPan = {
    enable: (options?: unknown) => this.record("dragPan.enable", [options]),
    disable: () => this.record("dragPan.disable", []),
  };
  center: { lng: number; lat: number };
  zoom: number;
  bearing: number;
  minZoom: number;
  maxZoom: number;
  removed = false;
  /** What `loaded()` answers: whether the style and every tile have loaded. */
  loadedState = true;
  features: unknown[] = [];
  queryError: Error | undefined;
  /** True from `style.load` until the next `setStyle`, as `isStyleLoaded()` reports. */
  styleLoaded = false;
  /** Sources the adapter added, by id, with any data set on them. */
  readonly sources = new Map<string, Record<string, unknown>>();
  /** Layers the adapter added, bottom first. */
  styleLayers: Record<string, unknown>[] = [];
  /** Images the adapter added, by name. */
  readonly images = new Map<string, unknown>();

  constructor(options: Record<string, unknown>) {
    const error = FakeMapLibreMap.nextConstructError;
    if (error) {
      FakeMapLibreMap.nextConstructError = undefined;
      throw error;
    }
    this.options = options;
    const [lng, lat] = options.center as [number, number];
    this.center = { lng, lat };
    this.minZoom = options.minZoom as number;
    this.maxZoom = options.maxZoom as number;
    this.zoom = options.zoom as number;
    this.bearing = options.bearing as number;
    const container = options.container as HTMLElement;
    container.classList.add("maplibregl-map");
    this.canvasContainer = document.createElement("div");
    this.canvasContainer.className = "maplibregl-canvas-container";
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("tabindex", "0");
    this.canvas.setAttribute("aria-label", "Map");
    this.canvas.setAttribute("role", "region");
    this.canvasContainer.append(this.canvas);
    container.append(this.canvasContainer);
    FakeMapLibreMap.instances.push(this);
    if (FakeMapLibreMap.autoLoad) {
      queueMicrotask(() => {
        this.fire("style.load");
        this.fire("load");
        this.fire("idle");
      });
    }
  }

  /** Subscribes like MapLibre 6, returning a subscription. */
  on(type: string, listener: Listener): { unsubscribe(): void } {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return {
      unsubscribe: () => {
        set?.delete(listener);
      },
    };
  }

  /**
   * Moves the camera the way one of MapLibre's own gesture handlers does:
   * every camera event carries the person's input as `originalEvent`.
   */
  gesture(camera: Camera, originalEvent: Event): void {
    this.apply(camera, { originalEvent });
  }

  /** Fires an engine event at the adapter. `style.load` also marks the style as loaded. */
  fire(type: string, event: Record<string, unknown> = {}): void {
    if (type === "style.load") {
      this.styleLoaded = true;
    }
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ type, ...event });
    }
  }

  /** How many engine listeners are still attached. */
  listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    return count;
  }

  /** The recorded calls to one method. */
  callsOf(method: string): FakeCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  getCenter(): { lng: number; lat: number } {
    return { ...this.center };
  }
  getZoom(): number {
    return this.zoom;
  }
  getBearing(): number {
    return this.bearing;
  }
  getMinZoom(): number {
    return this.minZoom;
  }
  getMaxZoom(): number {
    return this.maxZoom;
  }
  setMinZoom(zoom: number): void {
    if (zoom > this.maxZoom) {
      throw new Error("minZoom must be less than or equal to maxZoom");
    }
    this.record("setMinZoom", [zoom]);
    this.minZoom = zoom;
    this.zoom = Math.max(this.zoom, zoom);
  }
  setMaxZoom(zoom: number): void {
    if (zoom < this.minZoom) {
      throw new Error("maxZoom must be greater than or equal to minZoom");
    }
    this.record("setMaxZoom", [zoom]);
    this.maxZoom = zoom;
    this.zoom = Math.min(this.zoom, zoom);
  }
  jumpTo(camera: Camera): void {
    this.record("jumpTo", [camera]);
    this.apply(camera);
  }
  easeTo(camera: Camera): void {
    this.record("easeTo", [camera]);
    this.apply(camera);
  }
  zoomIn(options?: unknown): void {
    this.record("zoomIn", [options]);
    this.apply({ zoom: this.zoom + 1 });
  }
  zoomOut(options?: unknown): void {
    this.record("zoomOut", [options]);
    this.apply({ zoom: this.zoom - 1 });
  }
  panBy([dx, dy]: [number, number], options?: unknown): void {
    this.record("panBy", [[dx, dy], options]);
    const centre = this.unproject([
      FAKE_VIEWPORT_WIDTH / 2 + dx,
      FAKE_VIEWPORT_HEIGHT / 2 + dy,
    ]);
    this.apply({ center: [centre.lng, centre.lat] });
  }
  fitBounds(
    [[west, south], [east, north]]: [[number, number], [number, number]],
    options: {
      padding?: { top: number; right: number; bottom: number; left: number };
      maxZoom?: number;
      bearing?: number;
    } = {},
  ): void {
    this.record("fitBounds", [
      [
        [west, south],
        [east, north],
      ],
      options,
    ]);
    const padding = options.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const southWest = mercatorProject({ lat: south, lng: west }, 1);
    const northEast = mercatorProject({ lat: north, lng: east }, 1);
    const width = FAKE_VIEWPORT_WIDTH - padding.left - padding.right;
    const height = FAKE_VIEWPORT_HEIGHT - padding.top - padding.bottom;
    const fitted = Math.log2(
      Math.min(
        width / (northEast.x - southWest.x),
        height / (southWest.y - northEast.y),
      ),
    );
    const centre = mercatorUnproject(
      {
        x: (southWest.x + northEast.x) / 2,
        y: (southWest.y + northEast.y) / 2,
      },
      1,
    );
    this.apply({
      center: [centre.lng, centre.lat],
      zoom: Math.min(fitted, options.maxZoom ?? Number.POSITIVE_INFINITY),
      bearing: options.bearing ?? 0,
    });
  }
  stop(): void {
    this.record("stop", []);
  }
  project([lng, lat]: [number, number]): PixelPoint {
    const world = this.world({ lat, lng });
    const centre = this.world(this.center);
    const offset = rotate(
      { x: world.x - centre.x, y: world.y - centre.y },
      -this.bearing,
    );
    return {
      x: offset.x + FAKE_VIEWPORT_WIDTH / 2,
      y: offset.y + FAKE_VIEWPORT_HEIGHT / 2,
    };
  }
  unproject([x, y]: [number, number]): LatLng {
    const offset = rotate(
      { x: x - FAKE_VIEWPORT_WIDTH / 2, y: y - FAKE_VIEWPORT_HEIGHT / 2 },
      this.bearing,
    );
    const centre = this.world(this.center);
    return mercatorUnproject(
      { x: centre.x + offset.x, y: centre.y + offset.y },
      this.zoom + 1,
    );
  }
  queryRenderedFeatures(
    geometry: unknown,
    options?: { layers?: string[] },
  ): unknown[] {
    this.record(
      "queryRenderedFeatures",
      options ? [geometry, options] : [geometry],
    );
    if (this.queryError) {
      throw this.queryError;
    }
    const only = options?.layers;
    return only
      ? this.features.filter((feature) =>
          only.includes(
            (feature as { layer?: { id?: string } }).layer?.id ?? "",
          ),
        )
      : this.features;
  }
  isStyleLoaded(): boolean {
    return this.styleLoaded;
  }
  addSource(id: string, spec: Record<string, unknown>): void {
    this.checkLoaded();
    if (this.sources.has(id)) {
      throw new Error(`There is already a source with ID "${id}".`);
    }
    this.sources.set(id, { ...spec });
  }
  getSource(id: string): { setData(data: unknown): void } | undefined {
    const source = this.sources.get(id);
    return (
      source && {
        setData: (data: unknown) => {
          source.data = data;
        },
      }
    );
  }
  removeSource(id: string): void {
    this.checkLoaded();
    if (this.styleLayers.some((layer) => layer.source === id)) {
      throw new Error(
        `Source "${id}" cannot be removed while a layer uses it.`,
      );
    }
    this.sources.delete(id);
  }
  addLayer(spec: Record<string, unknown>, beforeId?: string): void {
    this.checkLoaded();
    if (!this.sources.has(spec.source as string)) {
      throw new Error(`Source "${String(spec.source)}" does not exist.`);
    }
    const layer = { ...spec, paint: { ...(spec.paint as object) } };
    const index = beforeId
      ? this.styleLayers.findIndex((item) => item.id === beforeId)
      : -1;
    if (index < 0) {
      this.styleLayers.push(layer);
    } else {
      this.styleLayers.splice(index, 0, layer);
    }
  }
  getLayer(id: string): Record<string, unknown> | undefined {
    return this.styleLayers.find((layer) => layer.id === id);
  }
  removeLayer(id: string): void {
    this.checkLoaded();
    this.styleLayers = this.styleLayers.filter((layer) => layer.id !== id);
  }
  moveLayer(id: string): void {
    const layer = this.getLayer(id);
    if (!layer) {
      // MapLibre throws this for a layer that is not in the style.
      throw new Error(
        `The layer '${id}' does not exist in the map's style and cannot be moved.`,
      );
    }
    this.styleLayers = [
      ...this.styleLayers.filter((item) => item !== layer),
      layer,
    ];
  }
  setPaintProperty(id: string, name: string, value: unknown): void {
    this.record("setPaintProperty", [id, name, value]);
    const layer = this.getLayer(id);
    if (layer) {
      (layer.paint as Record<string, unknown>)[name] = value;
    }
  }
  hasImage(name: string): boolean {
    return this.images.has(name);
  }
  addImage(name: string, image: unknown, options?: unknown): void {
    this.checkLoaded();
    this.images.set(name, { image, options });
  }
  setStyle(style: unknown, options?: unknown): void {
    this.record("setStyle", [style, options]);
    // A full style swap drops every source, layer and image the adapter added.
    this.styleLoaded = false;
    this.sources.clear();
    this.styleLayers = [];
    this.images.clear();
    if (FakeMapLibreMap.autoLoad) {
      const error = FakeMapLibreMap.nextStyleError;
      FakeMapLibreMap.nextStyleError = undefined;
      queueMicrotask(() => {
        if (error) {
          this.fire("error", { error });
          return;
        }
        this.fire("style.load");
        this.fire("idle");
      });
    }
  }
  loaded(): boolean {
    return this.loadedState;
  }
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
  getCanvasContainer(): HTMLDivElement {
    return this.canvasContainer;
  }
  remove(): void {
    this.record("remove", []);
    this.removed = true;
    this.canvasContainer.remove();
  }

  /** MapLibre throws this way when a source, layer or image is added mid-swap. */
  private checkLoaded(): void {
    if (!this.styleLoaded) {
      throw new Error("Style is not done loading.");
    }
  }

  private record(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
  }

  /** World pixels at the current zoom; MapLibre zoom z is normalised zoom z + 1. */
  private world(position: LatLng): PixelPoint {
    return mercatorProject(position, this.zoom + 1);
  }

  private apply(camera: Camera, event: Record<string, unknown> = {}): void {
    const zoomBefore = this.zoom;
    const bearingBefore = this.bearing;
    if (camera.center) {
      const [lng, lat] = camera.center;
      this.center = { lng, lat };
    }
    if (camera.zoom !== undefined) {
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, camera.zoom));
    }
    if (camera.bearing !== undefined) {
      this.bearing = camera.bearing;
    }
    this.fire("movestart", event);
    this.fire("move", event);
    if (this.zoom !== zoomBefore) {
      this.fire("zoom", event);
    }
    if (this.bearing !== bearingBefore) {
      this.fire("rotate", event);
    }
    this.fire("moveend", event);
  }
}

/** A GeoJSON feature as the adapter puts it in a source. */
export interface EngineFeature {
  readonly geometry: {
    readonly type: string;
    readonly coordinates: [number, number];
  };
  readonly properties: Record<string, unknown>;
}

/**
 * Describes the data layers the adapter added to a test engine, lowest
 * first, in the map adapter contract's terms. Engine ids are
 * `karta:<id>:<part>`, and a shape layer's fill and line count once.
 */
export function describeDataLayers(map: FakeMapLibreMap): DrawnLayer[] {
  const drawn: DrawnLayer[] = [];
  for (const layer of map.styleLayers) {
    const match = /^karta:(.+):(points|tiles|fill|line)$/.exec(
      String(layer.id),
    );
    if (!match || match[2] === "line") {
      continue;
    }
    const id = match[1] as string;
    const source = map.sources.get(layer.source as string) ?? {};
    const count =
      (source.data as { features?: unknown[] } | undefined)?.features?.length ??
      0;
    if (match[2] === "tiles") {
      drawn.push({
        id,
        kind: "tiles",
        tiles: (source.tiles as string[])[0] as string,
        opacity: (layer.paint as Record<string, number>)[
          "raster-opacity"
        ] as number,
      });
    } else {
      drawn.push({
        id,
        kind: match[2] === "fill" ? "shapes" : "features",
        count,
      });
    }
  }
  return drawn;
}

/** Test-only vector basemap with an unreachable style host. */
export function vectorBasemap(
  overrides: Partial<BasemapDefinition> = {},
): BasemapDefinition {
  return {
    id: "test-vector",
    name: "Test vector",
    source: { kind: "vector", styleUrl: "https://tiles.test/style.json" },
    minZoom: 0,
    maxZoom: 22,
    thumbnail: "/thumb.png",
    attribution: [{ text: "Test" }],
    appearance: "light",
    ...overrides,
  };
}

/** Test-only 256 px raster basemap with an unreachable tile host. */
export function rasterBasemap(): BasemapDefinition {
  return vectorBasemap({
    id: "test-raster",
    name: "Test raster",
    source: {
      kind: "raster",
      tileUrl: "https://tiles.test/{z}/{x}/{y}.png",
      tileSize: 256,
    },
    maxZoom: 19,
  });
}
