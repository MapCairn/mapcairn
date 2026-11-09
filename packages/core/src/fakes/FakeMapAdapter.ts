import type { BasemapDefinition } from "../ports/basemap";
import { MapEngineError, type MapEngineErrorReason } from "../ports/errors";
import type { Bounds, LatLng, PixelPoint, ViewState } from "../ports/geometry";
import type {
  MapAdapter,
  MapAdapterFactory,
  MapCapabilities,
  MapClickEvent,
  MapEvents,
  MapFitOptions,
  MapHostElement,
  MapMountOptions,
} from "../ports/map";
import {
  clampZoom,
  MAX_MERCATOR_LATITUDE,
  mercatorProject,
  mercatorUnproject,
  metresPerPixel,
} from "../zoom/zoom";

/** Capabilities of a Leaflet-like engine: no rotation, no feature query. */
export const LEAFLET_LIKE_CAPABILITIES: MapCapabilities = Object.freeze({
  supportsRotation: false,
  supportsFeatureQuery: false,
});

/** Capabilities of a MapLibre-like engine: rotation and feature query. */
export const MAPLIBRE_LIKE_CAPABILITIES: MapCapabilities = Object.freeze({
  supportsRotation: true,
  supportsFeatureQuery: true,
});

/** The view a {@link FakeMapAdapter} starts with before it is mounted. */
export const DEFAULT_FAKE_VIEW: ViewState = Object.freeze({
  center: Object.freeze({ lat: 0, lng: 0 }),
  zoom: 2,
  bearing: 0,
});

/** Options for {@link FakeMapAdapter}. */
export interface FakeMapAdapterOptions {
  /** Overrides on top of {@link MAPLIBRE_LIKE_CAPABILITIES}. */
  readonly capabilities?: Partial<MapCapabilities>;
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
 * - Pass `capabilities` to change what the map can do. Defaults are
 *   {@link MAPLIBRE_LIKE_CAPABILITIES}; use {@link LEAFLET_LIKE_CAPABILITIES}
 *   for an engine without rotation or feature query.
 * - Pass `failMount: "webgl-unavailable"` (or `"load-failed"`) to make
 *   `mount` reject with a `MapEngineError`.
 * - Mount it into a {@link FakeMapHost}; the host's size (800 by 600 by
 *   default) sets the pixel space used by `project` and `unproject`.
 * - Drive events with `simulateClick`, `simulateTileError` and
 *   `simulateLoading`. `setView`, `zoomIn`, `panBy` and the rest emit real
 *   `move`, `zoom`, `rotate` and `moveEnd` events, and only when something
 *   changed.
 * - Inspect `mountCount`, `destroyed`, `animationEnabled`, `keyboardEnabled`
 *   and `focusCount`.
 *
 * Animation options are accepted and ignored, because every change is
 * immediate. `project` ignores the bearing.
 */
export class FakeMapAdapter implements MapAdapter {
  readonly capabilities: MapCapabilities;
  mountCount = 0;
  focusCount = 0;
  animationEnabled = true;
  keyboardEnabled = true;

  #failMount: MapEngineErrorReason | undefined;
  #view: ViewState = DEFAULT_FAKE_VIEW;
  #basemap: BasemapDefinition | null = null;
  #host: MapHostElement | null = null;
  #hostSize = { width: 800, height: 600 };
  #destroyed = false;
  #listeners = new Map<keyof MapEvents, Set<Handler>>();

  constructor(options: FakeMapAdapterOptions = {}) {
    this.capabilities = Object.freeze({
      ...MAPLIBRE_LIKE_CAPABILITIES,
      ...options.capabilities,
    });
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
    if (this.capabilities.supportsRotation) {
      this.setView({ bearing: this.#view.bearing + degrees });
    }
  }

  resetBearing(): void {
    if (this.capabilities.supportsRotation) {
      this.setView({ bearing: 0 });
    }
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

  async setBasemap(basemap: BasemapDefinition): Promise<void> {
    this.#basemap = basemap;
    this.#applyView(this.#view);
    this.#emit("load", undefined);
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

  /** Emits a `click` at a position, with `features` only when queryable. */
  simulateClick(
    latlng: LatLng,
    features: MapClickEvent["features"] = [],
  ): void {
    this.#emit("click", {
      latlng,
      point: this.project(latlng),
      ...(this.capabilities.supportsFeatureQuery ? { features } : {}),
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
      bearing: this.capabilities.supportsRotation
        ? wrapBearing(view.bearing)
        : 0,
    };
  }

  #applyView(requested: ViewState): void {
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
 * Builds a `MapAdapterFactory` of fakes. Capabilities follow the basemap's
 * engine, as the real adapters do: `"leaflet"` gets
 * {@link LEAFLET_LIKE_CAPABILITIES} and any other engine gets
 * {@link MAPLIBRE_LIKE_CAPABILITIES}. `onCreate` receives each adapter built,
 * so a test can script it.
 */
export function createFakeMapAdapterFactory(
  onCreate?: (adapter: FakeMapAdapter) => void,
): MapAdapterFactory {
  return (basemap) => {
    const adapter = new FakeMapAdapter({
      capabilities:
        basemap.engine === "leaflet"
          ? LEAFLET_LIKE_CAPABILITIES
          : MAPLIBRE_LIKE_CAPABILITIES,
    });
    onCreate?.(adapter);
    return adapter;
  };
}
