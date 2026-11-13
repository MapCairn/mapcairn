// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  DrawnLayer,
  LatLng,
  PixelPoint,
} from "@mapcairn/core";
import {
  distanceMetres,
  EARTH_RADIUS_METRES,
  mercatorProject,
  mercatorUnproject,
  pngHeader,
} from "@mapcairn/core";

/** Test-only width of the fake engine's viewport, in pixels. */
export const FAKE_VIEWPORT_WIDTH = 800;
/** Test-only height of the fake engine's viewport, in pixels. */
export const FAKE_VIEWPORT_HEIGHT = 600;

/** Where a fake map looks when it was given neither a centre nor a box to fit. */
const UNSET_CAMERA = { lng: 123.4, lat: -45.6, zoom: 7.7 } as const;

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

/** A test-only stand-in for `maplibre-gl`'s `LngLat`. */
export class FakeLngLat {
  constructor(
    readonly lng: number,
    readonly lat: number,
  ) {}
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
  /** With `autoLoad`, the next map built loads but never reports `idle`, as when its tiles never arrive. Then cleared. */
  static holdIdle = false;
  /**
   * With `autoLoad`, the next map built reports `idle` only after it is asked
   * to repaint, as a map over tiles that all 404 does: no event asks for a
   * frame, so nothing else wakes it. Then cleared.
   */
  static settleOnRepaint = false;
  /** When true, a box cannot be fitted: `cameraForBounds` answers undefined and `fitBounds` does nothing. */
  static unfittableBounds = false;
  /** The ids of the loaded style's own sources, which each new map starts with in `styleSources`. */
  static styleSourceIds: string[] = [];
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
    FakeMapLibreMap.holdIdle = false;
    FakeMapLibreMap.settleOnRepaint = false;
    FakeMapLibreMap.unfittableBounds = false;
    FakeMapLibreMap.styleSourceIds = [];
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
  /** The loaded style's own sources (the basemap's), which the adapter did not add. */
  readonly styleSources = new Map<string, Record<string, unknown>>();
  /** Sources whose tiles are not all in, as `isSourceLoaded` reports; any other source is in. */
  readonly unloadedSources = new Set<string>();
  /** Layers the adapter added, bottom first. */
  styleLayers: Record<string, unknown>[] = [];
  /** Images the adapter added, by name. */
  readonly images = new Map<string, unknown>();
  /** The glyph URL of the loaded style; an inline raster style has none, as in MapLibre. */
  glyphs: string | undefined;
  /** The loaded basemap's own layers, always below the ones the adapter added. */
  basemapLayers: Record<string, unknown>[] = [];
  /** When true, `triggerRepaint` is followed by a `render` event, as a visible map does. */
  rendersOnRepaint = true;
  /** True while the map waits for a repaint before it reports `idle`. */
  idleOnRepaint = false;

  constructor(options: Record<string, unknown>) {
    const error = FakeMapLibreMap.nextConstructError;
    if (error) {
      FakeMapLibreMap.nextConstructError = undefined;
      throw error;
    }
    this.options = options;
    this.loadBasemapStyle(options.style);
    // A map fitted to `bounds` has no centre or zoom of its own until it is
    // fitted. MapLibre keeps its defaults when the fit fails, so the fake's
    // are somewhere a test would never ask for, which shows a missing fit.
    const [lng, lat] = (options.center as [number, number] | undefined) ?? [
      UNSET_CAMERA.lng,
      UNSET_CAMERA.lat,
    ];
    this.center = { lng, lat };
    this.minZoom = options.minZoom as number;
    this.maxZoom = options.maxZoom as number;
    this.zoom = (options.zoom as number | undefined) ?? UNSET_CAMERA.zoom;
    this.bearing = options.bearing as number;
    const container = options.container as HTMLElement;
    container.classList.add("maplibregl-map");
    this.canvasContainer = document.createElement("div");
    this.canvasContainer.className = "maplibregl-canvas-container";
    this.canvas = document.createElement("canvas");
    this.sizeCanvasToPixelRatio(container);
    this.canvas.setAttribute("tabindex", "0");
    this.canvas.setAttribute("aria-label", "Map");
    this.canvas.setAttribute("role", "region");
    this.canvasContainer.append(this.canvas);
    container.append(this.canvasContainer);
    FakeMapLibreMap.instances.push(this);
    for (const id of FakeMapLibreMap.styleSourceIds) {
      this.styleSources.set(id, { type: "vector" });
    }
    if (options.bounds) {
      const [[west, south], [east, north]] = options.bounds as [
        [number, number],
        [number, number],
      ];
      const { maxZoom } = (options.fitBoundsOptions ?? {}) as {
        maxZoom?: number;
      };
      this.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { maxZoom },
      );
    }
    if (FakeMapLibreMap.autoLoad) {
      const idles =
        !FakeMapLibreMap.holdIdle && !FakeMapLibreMap.settleOnRepaint;
      this.idleOnRepaint = FakeMapLibreMap.settleOnRepaint;
      FakeMapLibreMap.holdIdle = false;
      FakeMapLibreMap.settleOnRepaint = false;
      queueMicrotask(() => {
        this.fire("style.load");
        this.fire("load");
        if (idles) {
          this.fire("idle");
        }
      });
    }
  }

  /**
   * MapLibre makes the canvas `pixelRatio` times the container's CSS size, so
   * a map built with a ratio and a sized container has a canvas of that many pixels.
   */
  private sizeCanvasToPixelRatio(container: HTMLElement): void {
    const ratio = this.options.pixelRatio;
    if (typeof ratio !== "number") {
      return;
    }
    // MapLibre's `_containerDimensions` floors the container's width and
    // height, and `_resizeCanvas` rounds the ratio times that whole number.
    this.canvas.width = Math.round(
      ratio * Math.floor(Number.parseFloat(container.style.width)),
    );
    this.canvas.height = Math.round(
      ratio * Math.floor(Number.parseFloat(container.style.height)),
    );
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
    const camera = this.cameraForBounds(
      [
        [west, south],
        [east, north],
      ],
      options,
    );
    if (camera) {
      this.apply({ ...camera, bearing: options.bearing ?? 0 });
    }
  }
  /**
   * The centre and zoom that fit a box, or undefined when the box cannot be
   * fitted (`unfittableBounds`), as MapLibre answers for a box it cannot
   * fit, and `fitBounds` then leaves the camera where it was.
   */
  cameraForBounds(
    [[west, south], [east, north]]: [[number, number], [number, number]],
    options: {
      padding?: { top: number; right: number; bottom: number; left: number };
      maxZoom?: number;
    } = {},
  ): { center: [number, number]; zoom: number } | undefined {
    if (FakeMapLibreMap.unfittableBounds) {
      return undefined;
    }
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
    return {
      center: [centre.lng, centre.lat],
      zoom: Math.min(fitted, options.maxZoom ?? Number.POSITIVE_INFINITY),
    };
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
  isSourceLoaded(id: string): boolean {
    return !this.unloadedSources.has(id);
  }
  getSource(id: string): { setData(data: unknown): void } | undefined {
    const source = this.sources.get(id) ?? this.styleSources.get(id);
    return (
      source && {
        setData: (data: unknown) => {
          source.data = data;
        },
      }
    );
  }
  removeSource(id: string): void {
    this.record("removeSource", [id]);
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
    // A background layer draws from no source, as in MapLibre.
    if (
      spec.type !== "background" &&
      !this.sources.has(spec.source as string)
    ) {
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
    this.record("removeLayer", [id]);
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
  listImages(): string[] {
    return [...this.images.keys()];
  }
  /** The image as MapLibre hands it back: its pixels and the metadata it was added with. */
  getImage(name: string): {
    data: unknown;
    pixelRatio: number;
    sdf: boolean;
  } {
    const { image, options } = this.images.get(name) as {
      image: unknown;
      options?: { pixelRatio?: number; sdf?: boolean };
    };
    return {
      data: image,
      pixelRatio: options?.pixelRatio ?? 1,
      sdf: options?.sdf ?? false,
    };
  }
  /** What the style (or `setProjection`) last asked for. A test sets it to stand in for a style's own `projection`. */
  projection: { type: string } = { type: "mercator" };
  /** The engine's horizon test: on a globe, a place over a quarter of the way round from the centre is hidden. */
  readonly _camera = {
    transform: {
      isLocationOccluded: (lngLat: { lng: number; lat: number }): boolean =>
        this.projection.type === "globe" &&
        distanceMetres(this.center, { lat: lngLat.lat, lng: lngLat.lng }) >
          (Math.PI / 2) * EARTH_RADIUS_METRES,
    },
  };
  setProjection(projection: { type: string }): this {
    this.record("setProjection", [projection]);
    this.projection = projection;
    return this;
  }
  setStyle(style: unknown, options?: unknown): void {
    this.record("setStyle", [style, options]);
    // A full style swap drops every source, layer and image the adapter added.
    this.styleLoaded = false;
    this.loadBasemapStyle(style);
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
  getStyle(): {
    glyphs?: string;
    sources: Record<string, Record<string, unknown>>;
    layers: Record<string, unknown>[];
  } {
    return {
      ...(this.glyphs === undefined ? {} : { glyphs: this.glyphs }),
      sources: Object.fromEntries([...this.styleSources, ...this.sources]),
      layers: [...this.basemapLayers, ...this.styleLayers],
    };
  }
  getBounds(): {
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
  } {
    const corners = [
      [0, 0],
      [FAKE_VIEWPORT_WIDTH, 0],
      [FAKE_VIEWPORT_WIDTH, FAKE_VIEWPORT_HEIGHT],
      [0, FAKE_VIEWPORT_HEIGHT],
    ].map(([x, y]) => this.unproject([x as number, y as number]));
    const lngs = corners.map((corner) => corner.lng);
    const lats = corners.map((corner) => corner.lat);
    return {
      getWest: () => Math.min(...lngs),
      getSouth: () => Math.min(...lats),
      getEast: () => Math.max(...lngs),
      getNorth: () => Math.max(...lats),
    };
  }
  triggerRepaint(): void {
    this.record("triggerRepaint", []);
    if (this.idleOnRepaint) {
      this.idleOnRepaint = false;
      queueMicrotask(() => {
        this.fire("idle");
      });
    }
    if (this.rendersOnRepaint) {
      queueMicrotask(() => {
        this.fire("render");
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
    this.fire("remove");
    this.canvasContainer.remove();
  }

  /**
   * A style URL stands for a vector basemap, which brings glyphs and a text
   * layer with a literal font stack; an inline raster style has neither.
   */
  private loadBasemapStyle(style: unknown): void {
    if (typeof style === "string") {
      this.glyphs = "https://tiles.test/fonts/{fontstack}/{range}.pbf";
      this.basemapLayers = [
        { id: "background", type: "background" },
        {
          id: "place-label",
          type: "symbol",
          source: "openmaptiles",
          layout: {
            "text-field": "{name}",
            "text-font": ["Test Sans Regular"],
          },
        },
      ];
    } else {
      this.glyphs = undefined;
      this.basemapLayers = [];
    }
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
    readonly coordinates: unknown;
  };
  readonly properties: Record<string, unknown>;
}

/**
 * The part of an engine layer id after `mapcairn:<id>:`. Parts never contain a
 * colon, so the data layer id is everything before the last one.
 */
const ENGINE_ID = /^mapcairn:(.+):([^:]+)$/;

/** The first longitude and latitude of any GeoJSON coordinates. */
function firstPosition(coordinates: unknown): [number, number] {
  let current = coordinates;
  while (Array.isArray(current) && Array.isArray(current[0])) {
    current = current[0];
  }
  return Array.isArray(current) ? (current as [number, number]) : [0, 0];
}

/**
 * Describes the data layers the adapter added to a test engine, lowest
 * first, in the map adapter contract's terms. A data layer owns several
 * engine layers (`mapcairn:<id>:<part>`) over one source `mapcairn:<id>`, so each
 * is described once, from its first engine layer.
 */
export function describeDataLayers(map: FakeMapLibreMap): DrawnLayer[] {
  const drawn: DrawnLayer[] = [];
  const seen = new Set<string>();
  for (const layer of map.styleLayers) {
    const match = ENGINE_ID.exec(String(layer.id));
    if (!match || seen.has(String(layer.source))) {
      continue;
    }
    seen.add(String(layer.source));
    const id = match[1] as string;
    const part = match[2] as string;
    const source = map.sources.get(layer.source as string) ?? {};
    const count =
      (source.data as { features?: unknown[] } | undefined)?.features?.length ??
      0;
    const ofSource = map.styleLayers.filter(
      (item) => item.source === layer.source,
    );
    if (part === "tiles") {
      drawn.push({
        id,
        kind: "tiles",
        tiles: (source.tiles as string[])[0] as string,
        opacity: (layer.paint as Record<string, number>)[
          "raster-opacity"
        ] as number,
      });
    } else if (part.startsWith("styled-")) {
      const isArea = ofSource.some(
        (item) => item.id === `mapcairn:${id}:styled-fill`,
      );
      drawn.push({
        id,
        kind: "styled",
        geometry: isArea ? "area" : "line",
        count,
      });
    } else if (/^v\d+-/.test(part)) {
      const sourceLayers = [
        ...new Set(ofSource.map((item) => String(item["source-layer"]))),
      ];
      drawn.push({
        id,
        kind: "vector",
        tiles: (source.tiles as string[])[0] as string,
        sourceLayers,
      });
    } else if (part === "heat") {
      drawn.push({
        id,
        kind: "heatmap",
        source: source.type === "geojson" ? "points" : "vector",
        count,
      });
    } else {
      drawn.push({
        id,
        kind: part === "fill" ? "shapes" : "features",
        count,
      });
    }
  }
  return drawn;
}

/**
 * The engine layer a tap on one drawn feature lands on: its point layer, or
 * its polygon fill, or its coloured line. Undefined when the feature is not
 * drawn.
 */
function tappableEngineLayer(
  map: FakeMapLibreMap,
  layerId: string,
  featureId: string,
): { layer: string; feature: EngineFeature } | undefined {
  const source = map.sources.get(`mapcairn:${layerId}`);
  const feature = (
    (source?.data as { features?: EngineFeature[] } | undefined)?.features ?? []
  ).find((item) => item.properties["mapcairn:id"] === featureId);
  const layer = map.styleLayers.find(
    (item) =>
      item.source === `mapcairn:${layerId}` &&
      /:(points|styled-fill|styled-line-[a-z]+)$/.test(String(item.id)),
  );
  return feature && layer ? { layer: String(layer.id), feature } : undefined;
}

/**
 * Makes the test engine report one click that lands on every named feature
 * that is drawn, in the order given, at the position of the first. What the
 * engine returns for a query is filtered by the layers the adapter asks for,
 * as MapLibre does.
 */
export function simulateFeatureHits(
  map: FakeMapLibreMap,
  hits: readonly { layerId: string; featureId: string }[],
): void {
  const found = hits.flatMap(({ layerId, featureId }) => {
    const hit = tappableEngineLayer(map, layerId, featureId);
    return hit ? [hit] : [];
  });
  map.features = found.map(({ layer, feature }) => ({
    layer: { id: layer },
    ...feature,
  }));
  const [lng, lat] = firstPosition(found[0]?.feature.geometry.coordinates);
  map.fire("click", {
    lngLat: { lng, lat },
    point: map.project([lng, lat]),
  });
}

/** One call a test canvas context recorded, such as `fillText`. */
export interface CanvasCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/**
 * Stands in for the `<canvas>` features happy-dom lacks, so the image export
 * can run: a 2D context that records its calls, and a `toBlob` that yields a
 * PNG blob. Install it in a test and call the returned function to restore.
 */
export const canvasStub = {
  /** Every canvas a 2D context was asked of, oldest first, with its calls. */
  contexts: [] as {
    readonly canvas: HTMLCanvasElement;
    readonly calls: CanvasCall[];
    font: string;
    fillStyle: string;
  }[],
  /** When true, the next `toBlob` yields null, as a canvas the browser cannot encode does. */
  failNext: false,
  /** When set, the next `toBlob` throws it, as a tainted canvas does. */
  throwNext: undefined as Error | undefined,
  /** Clears what the stub recorded. */
  reset(): void {
    canvasStub.contexts = [];
    canvasStub.failNext = false;
    canvasStub.throwNext = undefined;
  },
  /** Installs the stub on `HTMLCanvasElement` and returns the function that removes it. */
  install(): () => void {
    const proto = HTMLCanvasElement.prototype as unknown as Record<
      string,
      unknown
    >;
    const original = {
      getContext: proto.getContext,
      toBlob: proto.toBlob,
    };
    canvasStub.reset();
    proto.getContext = function getContext(this: HTMLCanvasElement) {
      const calls: CanvasCall[] = [];
      const context: Record<string, unknown> = {
        font: "",
        fillStyle: "",
        textAlign: "",
        textBaseline: "",
      };
      for (const method of [
        "drawImage",
        "fillRect",
        "fillText",
        "save",
        "restore",
        "beginPath",
        "moveTo",
        "lineTo",
        "closePath",
        "arc",
        "fill",
        "stroke",
        "setLineDash",
      ]) {
        context[method] = (...args: unknown[]) => {
          calls.push({ method, args });
        };
      }
      context.measureText = (text: string) => ({ width: text.length * 6 });
      canvasStub.contexts.push(
        Object.assign(context, { canvas: this, calls }) as never,
      );
      return context;
    };
    proto.toBlob = function toBlob(
      this: HTMLCanvasElement,
      callback: (blob: Blob | null) => void,
      type?: string,
    ) {
      if (canvasStub.throwNext) {
        const error = canvasStub.throwNext;
        canvasStub.throwNext = undefined;
        throw error;
      }
      if (canvasStub.failNext) {
        canvasStub.failNext = false;
        callback(null);
        return;
      }
      // The header of a PNG the size of the canvas, so a test reads the size back.
      callback(new Blob([pngHeader(this.width, this.height)], { type }));
    };
    return () => {
      proto.getContext = original.getContext;
      proto.toBlob = original.toBlob;
    };
  },
};

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
