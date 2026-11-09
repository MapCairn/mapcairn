import type {
  BasemapDefinition,
  Bounds,
  LatLng,
  MapAdapter,
  MapCapabilities,
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
  NORMALISED_TILE_SIZE,
  toEngineZoom,
  toNormalisedZoom,
} from "@karta/core";
import type * as Leaflet from "leaflet";
import { Emitter } from "../shared/emitter";

type LeafletModule = typeof Leaflet;

const ENGINE = "leaflet" as const;

/**
 * Leaflet 1.9 internals the adapter toggles at runtime. Leaflet decides
 * `_zoomAnimated` and `_fadeAnimated` once, in its constructor, from the
 * options of that moment, so reduced motion cannot be switched through
 * options alone. The dependency is pinned exactly, so these names are stable.
 */
interface LeafletMapInternals {
  _zoomAnimated: boolean;
  _fadeAnimated: boolean;
}

/** Host attributes Leaflet may change and that the adapter puts back. */
const RESTORED_ATTRIBUTES = ["tabindex", "role", "aria-label"] as const;

/**
 * Map options shared by every Leaflet map.
 * @remarks
 * - `zoomSnap: 0` makes zoom continuous, as it is in MapLibre, so wheel,
 *   pinch and `fitBounds` land on fractional zooms on both engines and the
 *   normalised zoom never jumps to a whole number on its own.
 * - `zoomDelta: 1` matches MapLibre's zoom buttons, keys and double-click,
 *   which all add one to the current fractional zoom.
 * - `wheelPxPerZoomLevel: 120`: for small deltas Leaflet zooms by about
 *   `deltaY / (2 * wheelPxFactor * W * ln 2)` and MapLibre's mouse-wheel path
 *   by about `deltaY / (900 * ln 2)`. They agree when `W = 450 / wheelPxFactor`,
 *   which is 225 for Chrome on Windows at a device pixel ratio of 1 and 75 on
 *   a Mac with a device pixel ratio of 2. 120 sits between the two, and is half
 *   Leaflet's default speed of about four times MapLibre's per wheel notch.
 * - `wheelDebounceTime: 40` keeps Leaflet's default. Leaflet drops wheel input
 *   that arrives during a zoom animation, so a shorter debounce only loses
 *   more of it.
 * - `keyboard: false`: the ui implements keys once for both engines.
 * - `worldCopyJump: false`: there are no engine-drawn markers to keep in view.
 * - `zoomAnimation`, `fadeAnimation`, `markerZoomAnimation` and `inertia` start
 *   on so Leaflet builds its animation proxy; reduced motion then turns them
 *   off through {@link LeafletMapAdapter.setAnimationEnabled}.
 */
const MAP_OPTIONS = {
  zoomControl: false,
  attributionControl: false,
  keyboard: false,
  scrollWheelZoom: true,
  doubleClickZoom: true,
  touchZoom: true,
  dragging: true,
  boxZoom: false,
  inertia: true,
  bounceAtZoomLimits: true,
  zoomSnap: 0,
  zoomDelta: 1,
  wheelPxPerZoomLevel: 120,
  wheelDebounceTime: 40,
  worldCopyJump: false,
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true,
} as const;

/**
 * Loads Leaflet and its stylesheet.
 * @remarks Leaflet ships only a UMD build (`main`, no `module`), so every
 *   importer resolves to the same file and the bundle holds one Leaflet. CJS
 *   interop puts the namespace on `default`; the named-export fallback covers
 *   loaders that expose it directly.
 */
async function loadLeaflet(): Promise<LeafletModule> {
  const [module] = await Promise.all([
    import("leaflet"),
    import("leaflet/dist/leaflet.css"),
  ]);
  const withDefault = module as LeafletModule & { default?: LeafletModule };
  return withDefault.default ?? withDefault;
}

function isRaster(basemap: BasemapDefinition): basemap is BasemapDefinition & {
  source: Extract<BasemapDefinition["source"], { kind: "raster" }>;
} {
  return basemap.engine === ENGINE && basemap.source.kind === "raster";
}

function unsupported(basemap: BasemapDefinition): MapEngineError {
  return new MapEngineError(
    "load-failed",
    `The Leaflet engine renders raster basemaps only, not "${basemap.id}".`,
  );
}

function wrapLongitude(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lng > 0 ? 180 : wrapped;
}

/**
 * The {@link MapAdapter} for raster basemaps, built on Leaflet.
 *
 * @remarks
 * Leaflet mounts directly into the host. The adapter never draws on the map
 * and adds no Leaflet control; overlays are drawn by the app from `project`.
 *
 * Engine accessibility noise is neutralised as follows:
 * - Leaflet's keyboard handler forces `tabindex="0"` on the container. The
 *   adapter restores the host's own `tabindex` after enabling or disabling it
 *   and on destroy, so the ui keeps the single focus stop.
 * - The map pane (which holds every other pane and all tiles) and the empty
 *   control container get `aria-hidden="true"`.
 * - Every tile `<img>` gets `role="presentation"` when it starts loading;
 *   Leaflet already sets `alt=""`.
 * - On destroy the host's class list, inline `position`, `tabindex`, `role`
 *   and `aria-label` are put back as they were before mount.
 *
 * Raster tiles are requested at the provider's own size, without
 * `detectRetina`. Leaflet's retina mode lowers the layer's `maxZoom` by one and
 * shifts the tile zoom, and MapLibre does not upscale raster tiles either, so
 * both engines look the same and the zoom limits stay those of the basemap.
 */
export class LeafletMapAdapter implements MapAdapter {
  /** Leaflet cannot rotate and has no feature query for raster tiles. */
  readonly capabilities: MapCapabilities = {
    supportsRotation: false,
    supportsFeatureQuery: false,
  };

  private readonly emitter = new Emitter<MapEvents>();
  private L: LeafletModule | undefined;
  private map: Leaflet.Map | undefined;
  private host: HTMLElement | undefined;
  private tileLayer: Leaflet.TileLayer | undefined;
  private tileListeners: Leaflet.LeafletEventHandlerFnMap | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private mapListeners: Leaflet.LeafletEventHandlerFnMap | undefined;
  private savedHost:
    | {
        readonly className: string;
        readonly position: string;
        readonly attributes: ReadonlyMap<string, string | null>;
      }
    | undefined;
  private zoomAnimationSupported = false;
  private fadeAnimationSupported = false;
  private animationEnabled = true;
  private mounting = false;
  private destroyed = false;

  /**
   * Loads Leaflet, then creates the map inside `host`. Rejects with
   * `MapEngineError("load-failed")` when Leaflet cannot be loaded, when the
   * basemap is not a raster basemap, or when the adapter was already mounted
   * or destroyed. A `destroy` during loading resolves without creating a map.
   */
  async mount(host: MapHostElement, options: MapMountOptions): Promise<void> {
    if (this.destroyed || this.mounting || this.map) {
      throw new MapEngineError(
        "load-failed",
        "This map adapter was already mounted.",
      );
    }
    if (!isRaster(options.basemap)) {
      throw unsupported(options.basemap);
    }
    this.mounting = true;
    let L: LeafletModule;
    try {
      L = await loadLeaflet();
    } catch (error) {
      throw new MapEngineError(
        "load-failed",
        `Leaflet could not be loaded: ${String(error)}`,
      );
    } finally {
      this.mounting = false;
    }
    if (this.destroyed) {
      return;
    }
    this.L = L;
    // MapHostElement is the structural port type; the composition root
    // always passes a real element.
    const element = host as unknown as HTMLElement;
    this.host = element;
    this.saveHost(element);

    const { basemap, view } = options;
    let map: Leaflet.Map;
    try {
      map = L.map(element, {
        ...MAP_OPTIONS,
        minZoom: toEngineZoom(basemap.minZoom, ENGINE),
        maxZoom: toEngineZoom(basemap.maxZoom, ENGINE),
        trackResize: typeof ResizeObserver === "undefined",
        center: [view.center.lat, view.center.lng],
        zoom: toEngineZoom(
          clampZoom(view.zoom, basemap.minZoom, basemap.maxZoom),
          ENGINE,
        ),
      });
    } catch (error) {
      this.restoreHost();
      this.host = undefined;
      throw new MapEngineError(
        "load-failed",
        `Leaflet could not start: ${String(error)}`,
      );
    }
    this.map = map;
    const internals = this.internals(map);
    this.zoomAnimationSupported = internals._zoomAnimated;
    this.fadeAnimationSupported = internals._fadeAnimated;

    this.hideEngineDom(map);
    this.listenToMap(map);
    this.observeResize(element, map);
    this.setAnimationEnabled(!options.reducedMotion);
    this.addTileLayer(basemap);
  }

  /** Removes the map, every listener and every host change. Safe to call twice. */
  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    const map = this.map;
    if (map) {
      this.removeTileLayer();
      if (this.mapListeners) {
        map.off(this.mapListeners);
      }
      map.stop();
      map.remove();
    }
    this.map = undefined;
    this.mapListeners = undefined;
    this.restoreHost();
    this.host = undefined;
    this.emitter.clear();
  }

  /** The view with the normalised zoom; the bearing is always 0. */
  getView(): ViewState {
    const map = this.requireMap();
    const center = map.getCenter();
    return {
      center: { lat: center.lat, lng: wrapLongitude(center.lng) },
      zoom: toNormalisedZoom(map.getZoom(), ENGINE),
      bearing: 0,
    };
  }

  /** Moves to a centre and normalised zoom. The bearing is ignored. */
  setView(view: Partial<ViewState>, options?: MapMoveOptions): void {
    const map = this.requireMap();
    if (view.center === undefined && view.zoom === undefined) {
      return;
    }
    const center = view.center ?? map.getCenter();
    const zoom =
      view.zoom === undefined
        ? map.getZoom()
        : toEngineZoom(
            clampZoom(view.zoom, this.getMinZoom(), this.getMaxZoom()),
            ENGINE,
          );
    const move = this.moveOptions(options);
    // Without animation, a reset lands exactly on the centre. Leaflet's pan
    // path rounds the offset to whole pixels, which drifts the centre.
    // `reset` is a real `setView` option that @types/leaflet leaves out.
    const reset = { reset: true } as Leaflet.ZoomPanOptions;
    map.setView(
      [center.lat, center.lng],
      zoom,
      move.animate === false ? reset : move,
    );
  }

  /** Zooms in by one level, stopping at the basemap's maximum. */
  zoomIn(options?: MapMoveOptions): void {
    this.requireMap().zoomIn(MAP_OPTIONS.zoomDelta, this.moveOptions(options));
  }

  /** Zooms out by one level, stopping at the basemap's minimum. */
  zoomOut(options?: MapMoveOptions): void {
    this.requireMap().zoomOut(MAP_OPTIONS.zoomDelta, this.moveOptions(options));
  }

  /** Moves the view by screen pixels; positive y is down. */
  panBy(dx: number, dy: number, options?: MapMoveOptions): void {
    this.requireMap().panBy([dx, dy], this.moveOptions(options));
  }

  /** A no-op: Leaflet cannot rotate. */
  rotateBy(_degrees: number, _options?: MapMoveOptions): void {}

  /** A no-op: the bearing is always north. */
  resetBearing(_options?: MapMoveOptions): void {}

  /** Fits `bounds`, keeping `padding` clear and never passing `maxZoom`. */
  fitBounds(bounds: Bounds, options?: MapFitOptions): void {
    const map = this.requireMap();
    const padding = options?.padding;
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      {
        ...this.moveOptions(options),
        paddingTopLeft: padding ? [padding.left, padding.top] : [0, 0],
        paddingBottomRight: padding ? [padding.right, padding.bottom] : [0, 0],
        ...(options?.maxZoom === undefined
          ? {}
          : { maxZoom: toEngineZoom(options.maxZoom, ENGINE) }),
      },
    );
  }

  /** The active basemap's normalised minimum zoom. */
  getMinZoom(): number {
    return toNormalisedZoom(this.requireMap().getMinZoom(), ENGINE);
  }

  /** The active basemap's normalised maximum zoom. */
  getMaxZoom(): number {
    return toNormalisedZoom(this.requireMap().getMaxZoom(), ENGINE);
  }

  /** Converts a position to pixels relative to the host's top-left corner. */
  project(latlng: LatLng): PixelPoint {
    const point = this.requireMap().latLngToContainerPoint([
      latlng.lat,
      latlng.lng,
    ]);
    return { x: point.x, y: point.y };
  }

  /** Converts host-relative pixels to a position. */
  unproject(point: PixelPoint): LatLng {
    const latlng = this.requireMap().containerPointToLatLng([point.x, point.y]);
    return { lat: latlng.lat, lng: latlng.lng };
  }

  /** Ground resolution from core's single implementation. */
  metresPerPixel(lat?: number): number {
    const view = this.getView();
    return metresPerPixel(lat ?? view.center.lat, view.zoom);
  }

  /**
   * Swaps the tile layer without recreating the map. The view is kept, then
   * clamped once into the new zoom limits. Resolves when the swap is done, not
   * when tiles finish loading. Rejects with `MapEngineError("load-failed")` for
   * a vector basemap or before mount.
   */
  async setBasemap(basemap: BasemapDefinition): Promise<void> {
    if (!isRaster(basemap)) {
      throw unsupported(basemap);
    }
    const map = this.map;
    if (!map || this.destroyed) {
      throw new MapEngineError(
        "load-failed",
        "The map adapter is not mounted.",
      );
    }
    this.removeTileLayer();
    // Assign both limits before clamping: setting them one at a time clamps
    // against the old opposite limit and can leave the zoom out of range.
    map.options.minZoom = toEngineZoom(basemap.minZoom, ENGINE);
    map.options.maxZoom = toEngineZoom(basemap.maxZoom, ENGINE);
    const zoom = toNormalisedZoom(map.getZoom(), ENGINE);
    const clamped = clampZoom(zoom, basemap.minZoom, basemap.maxZoom);
    if (clamped !== zoom) {
      map.setView(map.getCenter(), toEngineZoom(clamped, ENGINE), {
        animate: false,
      });
    }
    this.addTileLayer(basemap);
  }

  /**
   * Turns every Leaflet animation on or off. When off, zoom, fade, marker
   * animation and inertia stop and every view change is instant.
   */
  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled;
    const map = this.map;
    if (!map) {
      return;
    }
    if (!enabled) {
      map.stop();
    }
    map.options.zoomAnimation = enabled;
    map.options.fadeAnimation = enabled;
    map.options.markerZoomAnimation = enabled;
    map.options.inertia = enabled;
    const internals = this.internals(map);
    internals._zoomAnimated = enabled && this.zoomAnimationSupported;
    internals._fadeAnimated = enabled && this.fadeAnimationSupported;
    map
      .getContainer()
      .classList.toggle("leaflet-fade-anim", internals._fadeAnimated);
  }

  /**
   * Turns Leaflet's own key handler on or off. The host's `tabindex` is put
   * back afterwards, because Leaflet forces one when the handler starts.
   */
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
    this.restoreAttribute("tabindex");
  }

  /** Moves keyboard focus to the host without scrolling the page. */
  focus(): void {
    this.host?.focus({ preventScroll: true });
  }

  /** Subscribes to an adapter event. Returns the unsubscribe function. */
  on<K extends keyof MapEvents>(
    event: K,
    handler: (payload: MapEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler);
  }

  private requireMap(): Leaflet.Map {
    if (!this.map) {
      throw new Error("The Leaflet map adapter is not mounted.");
    }
    return this.map;
  }

  private internals(map: Leaflet.Map): LeafletMapInternals {
    return map as unknown as LeafletMapInternals;
  }

  private moveOptions(options?: MapMoveOptions): { animate?: boolean } {
    // An empty object lets Leaflet decide, which skips animating pans
    // further than one screen as MapLibre does for long moves.
    return this.animationEnabled && options?.animate !== false
      ? {}
      : { animate: false };
  }

  private listenToMap(map: Leaflet.Map): void {
    const emitView = (event: "move" | "moveEnd" | "zoom") => () => {
      this.emitter.emit(event, this.getView());
    };
    this.mapListeners = {
      move: emitView("move"),
      moveend: emitView("moveEnd"),
      zoom: emitView("zoom"),
      click: (event) => {
        const { latlng, containerPoint } = event as Leaflet.LeafletMouseEvent;
        this.emitter.emit("click", {
          latlng: { lat: latlng.lat, lng: wrapLongitude(latlng.lng) },
          point: { x: containerPoint.x, y: containerPoint.y },
        });
      },
    };
    map.on(this.mapListeners);
  }

  private addTileLayer(
    basemap: BasemapDefinition & {
      source: Extract<BasemapDefinition["source"], { kind: "raster" }>;
    },
  ): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) {
      return;
    }
    const { tileSize } = basemap.source;
    // A 512 px tile covers what a 256 px tile does one zoom level up.
    const zoomOffset = Math.log2(NORMALISED_TILE_SIZE / tileSize);
    const minZoom = toEngineZoom(basemap.minZoom, ENGINE);
    const maxZoom = toEngineZoom(basemap.maxZoom, ENGINE);
    const layer = L.tileLayer(basemap.source.tileUrl, {
      tileSize,
      zoomOffset,
      minZoom,
      maxZoom,
      minNativeZoom: Math.max(minZoom, -zoomOffset),
      maxNativeZoom: maxZoom,
      detectRetina: false,
    });

    let loaded = false;
    this.tileListeners = {
      loading: () => {
        this.emitter.emit("loading", true);
      },
      load: () => {
        this.emitter.emit("loading", false);
        if (!loaded) {
          loaded = true;
          this.emitter.emit("load", undefined);
        }
      },
      tileerror: () => {
        this.emitter.emit("tileError", undefined);
      },
      tileloadstart: (event) => {
        (event as Leaflet.TileEvent).tile.setAttribute("role", "presentation");
      },
    };
    layer.on(this.tileListeners);

    // A layer copies `_zoomAnimated` from the map when it is added and only
    // subscribes to zoom animation if it was true. Add it as if animation
    // were on, so re-enabling animation later still scales its tiles.
    const internals = this.internals(map);
    const current = internals._zoomAnimated;
    internals._zoomAnimated = this.zoomAnimationSupported;
    try {
      layer.addTo(map);
    } finally {
      internals._zoomAnimated = current;
    }
    this.tileLayer = layer;
  }

  private removeTileLayer(): void {
    const layer = this.tileLayer;
    if (!layer) {
      return;
    }
    if (this.tileListeners) {
      layer.off(this.tileListeners);
    }
    layer.remove();
    this.tileLayer = undefined;
    this.tileListeners = undefined;
  }

  private observeResize(element: HTMLElement, map: Leaflet.Map): void {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // MapLibre follows its container's size; Leaflet only follows the window.
    this.resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false, pan: true });
    });
    this.resizeObserver.observe(element);
  }

  private hideEngineDom(map: Leaflet.Map): void {
    map.getPane("mapPane")?.setAttribute("aria-hidden", "true");
    map
      .getContainer()
      .querySelector(".leaflet-control-container")
      ?.setAttribute("aria-hidden", "true");
    for (const name of RESTORED_ATTRIBUTES) {
      this.restoreAttribute(name);
    }
  }

  private saveHost(element: HTMLElement): void {
    this.savedHost = {
      className: element.className,
      position: element.style.position,
      attributes: new Map(
        RESTORED_ATTRIBUTES.map((name) => [name, element.getAttribute(name)]),
      ),
    };
  }

  private restoreAttribute(name: string): void {
    const element = this.host;
    const saved = this.savedHost?.attributes.get(name);
    if (!element || saved === undefined) {
      return;
    }
    if (saved === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, saved);
    }
  }

  private restoreHost(): void {
    const element = this.host;
    const saved = this.savedHost;
    if (!element || !saved) {
      return;
    }
    element.className = saved.className;
    element.style.position = saved.position;
    for (const name of RESTORED_ATTRIBUTES) {
      this.restoreAttribute(name);
    }
    this.savedHost = undefined;
  }
}

/** Creates an unmounted {@link LeafletMapAdapter}. */
export function createLeafletMapAdapter(): MapAdapter {
  return new LeafletMapAdapter();
}
