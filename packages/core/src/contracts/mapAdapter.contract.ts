import { afterEach, describe, expect, it } from "vitest";
import type { DrawnLayer } from "../fakes/FakeMapAdapter";
import type { BasemapDefinition } from "../ports/basemap";
import { MapEngineError } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type {
  MapAdapter,
  MapEditHandle,
  MapEvents,
  MapFeature,
  MapFeatureTap,
  MapHandleDrag,
  MapHeatmap,
  MapHostElement,
  MapMountOptions,
  MapShapeLook,
  MapShapes,
  MapStyledShapes,
  MapTileOverlay,
  MapVectorTiles,
} from "../ports/map";

/**
 * What the map contract needs besides the adapter itself. A real adapter
 * supplies its own: a host in jsdom or a browser, and ways to make its engine
 * report clicks, loading, tile errors, zoom gestures and a failure after load.
 */
export interface MapAdapterControls {
  /** The element the adapter mounts into. */
  readonly host: MapHostElement;
  /** The size of `host` in pixels, as `getBoundingClientRect` reports it. */
  readonly hostSize: { readonly width: number; readonly height: number };
  /**
   * A basemap the adapter can mount. Its zoom limits must span at least four
   * zoom levels.
   */
  readonly basemap: BasemapDefinition;
  /** Waits until the engine has applied every change so far. A no-op for fakes. */
  settle(): Promise<void>;
  /** Makes the engine report a pointer click at a position. */
  simulateClick(latlng: LatLng): void;
  /** Makes the engine report a failed tile or style request. */
  simulateTileError(): void;
  /**
   * Makes the engine settle with every tile of the basemap failed and none
   * loaded, as when the provider is down.
   */
  simulateBasemapUnavailable(): void;
  /**
   * Makes the engine settle with every tile of the tile layer `layerId`
   * requested and none loaded, as when its provider has no imagery for what
   * was asked. A layer that was never set has no tiles, so nothing happens.
   */
  simulateTileLayerFailure(layerId: string): void;
  /**
   * Makes the engine report a zoom gesture it handles itself (a wheel, a
   * pinch or a double-click) that leaves the view at the normalised `zoom`.
   */
  simulateUserZoom(zoom: number): void;
  /** Makes the engine fail after it has loaded, the way a crashed worker does. */
  simulateFatalError(): void;
  /** Makes the engine report that loading started or finished. */
  simulateLoading(loading: boolean): void;
  /**
   * Makes the engine report a tap on the drawn point `featureId` of the
   * feed layer `layerId`. If no such point is drawn, the tap lands on
   * nothing.
   */
  simulateFeatureTap(layerId: string, featureId: string): void;
  /**
   * Makes the engine report one tap that lands on several drawn features,
   * topmost first (a point, polygon or line each). The same features are what
   * `featuresAt` finds under the pointer afterwards. A feature that is not
   * drawn is not under the tap.
   */
  simulateFeatureHits(
    hits: readonly { readonly layerId: string; readonly featureId: string }[],
  ): void;
  /**
   * Makes the next `toImage` fail, such as a canvas the browser will not
   * read. Optional because some engines cannot fail.
   */
  failNextImage?(): void;
  /**
   * Makes the engine report a pointer going down at a position, as a mouse
   * or pen (`mouse`, the default) or as a finger (`touch`).
   */
  pointerDown(latlng: LatLng, pointer?: "mouse" | "touch"): void;
  /** Makes the engine report the pointer moving to a position. */
  pointerMove(latlng: LatLng, pointer?: "mouse" | "touch"): void;
  /** Makes the engine report the pointer going up at a position. */
  pointerUp(latlng: LatLng, pointer?: "mouse" | "touch"): void;
  /** Describes the data layers the engine draws, lowest first. */
  drawnLayers(): readonly DrawnLayer[];
  /**
   * Builds an adapter whose `mount` rejects with a `MapEngineError`, for
   * example by hiding WebGL. Optional because some engines cannot fail.
   */
  createFailingMount?(): MapAdapter;
  /**
   * Makes the next `setBasemap` fail to load its style, for example by
   * failing the style request. Optional because some engines cannot fail.
   */
  failNextBasemap?(): void;
}

/** One map adapter under test, with its controls. */
export interface MapAdapterSubject {
  readonly adapter: MapAdapter;
  readonly controls: MapAdapterControls;
}

const CENTRE: LatLng = { lat: -33.9, lng: 18.4 };
const NO_ANIMATION = { animate: false } as const;

/**
 * Runs the shared behavioural suite for a {@link MapAdapter}. Every test calls
 * `create` for a fresh, unmounted subject, so tests never share state.
 * A real adapter passes the same suite with its own controls.
 */
export function runMapAdapterContract(
  name: string,
  create: () => MapAdapterSubject,
): void {
  describe(`MapAdapter contract: ${name}`, () => {
    const live: MapAdapter[] = [];

    afterEach(() => {
      for (const adapter of live.splice(0)) {
        adapter.destroy();
      }
    });

    function mountOptions(
      controls: MapAdapterControls,
      zoom: number,
    ): MapMountOptions {
      return {
        view: { center: CENTRE, zoom, bearing: 0 },
        basemap: controls.basemap,
        reducedMotion: true,
      };
    }

    async function mounted(): Promise<
      MapAdapterSubject & { readonly zoom: number }
    > {
      const subject = create();
      live.push(subject.adapter);
      const { adapter, controls } = subject;
      const zoom = Math.floor(
        (controls.basemap.minZoom + controls.basemap.maxZoom) / 2,
      );
      await adapter.mount(controls.host, mountOptions(controls, zoom));
      await controls.settle();
      return { ...subject, zoom };
    }

    it("mounts into the host with the requested view and valid zoom limits", async () => {
      const { adapter, zoom } = await mounted();
      const view = adapter.getView();
      expect(view.center.lat).toBeCloseTo(CENTRE.lat, 3);
      expect(view.center.lng).toBeCloseTo(CENTRE.lng, 3);
      expect(view.zoom).toBeCloseTo(zoom, 3);
      expect(view.bearing).toBe(0);
      expect(adapter.getMinZoom()).toBeLessThan(adapter.getMaxZoom());
    });

    it("reports load once the first frame is ready", async () => {
      const subject = create();
      live.push(subject.adapter);
      let loads = 0;
      subject.adapter.on("load", () => {
        loads += 1;
      });
      await subject.adapter.mount(
        subject.controls.host,
        mountOptions(subject.controls, subject.controls.basemap.minZoom + 2),
      );
      await subject.controls.settle();
      expect(loads).toBeGreaterThanOrEqual(1);
    });

    it("rejects mount with a MapEngineError when the engine cannot start", async () => {
      const { controls } = create();
      if (controls.createFailingMount === undefined) {
        return;
      }
      const failing = controls.createFailingMount();
      live.push(failing);
      await expect(
        failing.mount(controls.host, mountOptions(controls, 3)),
      ).rejects.toBeInstanceOf(MapEngineError);
    });

    it("round-trips a view set with setView", async () => {
      const { adapter, controls, zoom } = await mounted();
      adapter.setView(
        { center: { lat: 10, lng: 20 }, zoom: zoom + 1 },
        NO_ANIMATION,
      );
      await controls.settle();
      const view = adapter.getView();
      expect(view.center.lat).toBeCloseTo(10, 3);
      expect(view.center.lng).toBeCloseTo(20, 3);
      expect(view.zoom).toBeCloseTo(zoom + 1, 3);
    });

    it("keeps the fields a partial setView leaves out", async () => {
      const { adapter, controls, zoom } = await mounted();
      adapter.setView({ zoom: zoom + 1 }, NO_ANIMATION);
      await controls.settle();
      const view = adapter.getView();
      expect(view.center.lat).toBeCloseTo(CENTRE.lat, 3);
      expect(view.center.lng).toBeCloseTo(CENTRE.lng, 3);
    });

    it("keeps the normalised zoom inside the basemap limits after setView", async () => {
      const { adapter, controls } = await mounted();
      const min = adapter.getMinZoom();
      const max = adapter.getMaxZoom();
      adapter.setView({ zoom: max + 5 }, NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().zoom).toBeLessThanOrEqual(max);
      expect(adapter.getView().zoom).toBeGreaterThanOrEqual(min);
      adapter.setView({ zoom: min - 5 }, NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().zoom).toBeGreaterThanOrEqual(min);
      expect(adapter.getView().zoom).toBeLessThanOrEqual(max);
    });

    it("zooms in and out by one level", async () => {
      const { adapter, controls, zoom } = await mounted();
      adapter.zoomIn(NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().zoom).toBeCloseTo(zoom + 1, 3);
      adapter.zoomOut(NO_ANIMATION);
      adapter.zoomOut(NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().zoom).toBeCloseTo(zoom - 1, 3);
    });

    it("does not zoom past the maximum or the minimum", async () => {
      const { adapter, controls } = await mounted();
      const min = adapter.getMinZoom();
      const max = adapter.getMaxZoom();
      adapter.setView({ zoom: max }, NO_ANIMATION);
      await controls.settle();
      adapter.zoomIn(NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().zoom).toBeCloseTo(max, 3);
      adapter.setView({ zoom: min }, NO_ANIMATION);
      await controls.settle();
      adapter.zoomOut(NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().zoom).toBeCloseTo(min, 3);
    });

    it("pans by screen pixels, positive x right and positive y down", async () => {
      const { adapter, controls } = await mounted();
      const before = adapter.project(adapter.getView().center);
      const centre = adapter.getView().center;
      adapter.panBy(100, 50, NO_ANIMATION);
      await controls.settle();
      const after = adapter.project(centre);
      expect(after.x).toBeCloseTo(before.x - 100, 0);
      expect(after.y).toBeCloseTo(before.y - 50, 0);
    });

    it("rotates with rotateBy and resetBearing", async () => {
      const { adapter, controls } = await mounted();
      adapter.rotateBy(90, NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().bearing).toBeCloseTo(90, 3);
      adapter.rotateBy(-180, NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().bearing).toBeCloseTo(270, 3);
      adapter.resetBearing(NO_ANIMATION);
      await controls.settle();
      expect(adapter.getView().bearing).toBeCloseTo(0, 3);
    });

    it("keeps the bearing in [0, 360)", async () => {
      const { adapter, controls } = await mounted();
      for (const bearing of [-90, 450, 720, -0.5]) {
        adapter.setView({ bearing }, NO_ANIMATION);
        await controls.settle();
        expect(adapter.getView().bearing).toBeGreaterThanOrEqual(0);
        expect(adapter.getView().bearing).toBeLessThan(360);
      }
    });

    it("fits bounds inside the host without passing maxZoom", async () => {
      const { adapter, controls } = await mounted();
      const bounds = { south: -34.1, west: 18.3, north: -33.8, east: 18.7 };
      adapter.fitBounds(bounds, { ...NO_ANIMATION, maxZoom: 12 });
      await controls.settle();
      const view = adapter.getView();
      expect(view.zoom).toBeLessThanOrEqual(12);
      expect(view.center.lat).toBeGreaterThan(bounds.south);
      expect(view.center.lat).toBeLessThan(bounds.north);
      expect(view.center.lng).toBeGreaterThan(bounds.west);
      expect(view.center.lng).toBeLessThan(bounds.east);
      const southWest = adapter.project({
        lat: bounds.south,
        lng: bounds.west,
      });
      const northEast = adapter.project({
        lat: bounds.north,
        lng: bounds.east,
      });
      expect(southWest.x).toBeGreaterThanOrEqual(-1);
      expect(northEast.y).toBeGreaterThanOrEqual(-1);
      expect(northEast.x).toBeLessThanOrEqual(controls.hostSize.width + 1);
      expect(southWest.y).toBeLessThanOrEqual(controls.hostSize.height + 1);
    });

    it("projects the view centre to the middle of the host", async () => {
      const { adapter, controls } = await mounted();
      const point = adapter.project(adapter.getView().center);
      expect(Math.abs(point.x - controls.hostSize.width / 2)).toBeLessThan(1);
      expect(Math.abs(point.y - controls.hostSize.height / 2)).toBeLessThan(1);
    });

    it("round-trips positions and pixels through project and unproject within one pixel", async () => {
      const { adapter } = await mounted();
      const position = { lat: CENTRE.lat + 0.01, lng: CENTRE.lng + 0.01 };
      const projected = adapter.project(position);
      const again = adapter.project(adapter.unproject(projected));
      expect(Math.abs(again.x - projected.x)).toBeLessThan(1);
      expect(Math.abs(again.y - projected.y)).toBeLessThan(1);
      const pixel = { x: 100, y: 120 };
      const back = adapter.project(adapter.unproject(pixel));
      expect(Math.abs(back.x - pixel.x)).toBeLessThan(1);
      expect(Math.abs(back.y - pixel.y)).toBeLessThan(1);
    });

    it("reports positions east of the antimeridian with longitudes inside [-180, 180)", async () => {
      const { adapter, controls } = await mounted();
      adapter.setView({ center: { lat: 0, lng: 179.99 } }, NO_ANIMATION);
      await controls.settle();
      const east = adapter.unproject({
        x: controls.hostSize.width,
        y: controls.hostSize.height / 2,
      });
      expect(east.lng).toBeLessThan(-170);
      expect(east.lng).toBeGreaterThanOrEqual(-180);
      const clicks: LatLng[] = [];
      adapter.on("click", (click) => clicks.push(click.latlng));
      controls.simulateClick({ lat: 0, lng: 180.005 });
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.lng).toBeCloseTo(-179.995, 6);
    });

    it("halves metres per pixel with every zoom level, within one percent", async () => {
      const { adapter, controls, zoom } = await mounted();
      const coarse = adapter.metresPerPixel(0);
      adapter.setView({ zoom: zoom + 1 }, NO_ANIMATION);
      await controls.settle();
      const fine = adapter.metresPerPixel(0);
      expect(coarse / fine).toBeGreaterThan(1.98);
      expect(coarse / fine).toBeLessThan(2.02);
    });

    it("measures at the view centre latitude when no latitude is given", async () => {
      const { adapter } = await mounted();
      expect(adapter.metresPerPixel()).toBeCloseTo(
        adapter.metresPerPixel(adapter.getView().center.lat),
        6,
      );
      expect(adapter.metresPerPixel(60)).toBeLessThan(
        adapter.metresPerPixel(0),
      );
    });

    it("emits move, zoom and moveEnd when the view changes", async () => {
      const { adapter, controls, zoom } = await mounted();
      const seen: string[] = [];
      adapter.on("move", () => seen.push("move"));
      adapter.on("zoom", () => seen.push("zoom"));
      adapter.on("moveEnd", () => seen.push("moveEnd"));
      adapter.setView(
        { center: { lat: 10, lng: 20 }, zoom: zoom + 1 },
        NO_ANIMATION,
      );
      await controls.settle();
      expect(seen).toContain("move");
      expect(seen).toContain("zoom");
      expect(seen.at(-1)).toBe("moveEnd");
    });

    it("emits rotate when the bearing changes", async () => {
      const { adapter, controls } = await mounted();
      let rotations = 0;
      adapter.on("rotate", () => {
        rotations += 1;
      });
      adapter.rotateBy(30, NO_ANIMATION);
      await controls.settle();
      expect(rotations).toBeGreaterThan(0);
    });

    it("stops calling a handler once it is unsubscribed, and unsubscribing twice is safe", async () => {
      const { adapter, controls, zoom } = await mounted();
      let moves = 0;
      const unsubscribe = adapter.on("move", () => {
        moves += 1;
      });
      adapter.setView({ zoom: zoom + 1 }, NO_ANIMATION);
      await controls.settle();
      const seen = moves;
      expect(seen).toBeGreaterThan(0);
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
      adapter.setView({ zoom }, NO_ANIMATION);
      await controls.settle();
      expect(moves).toBe(seen);
    });

    it("emits click with the position, the pixel and a list of features", async () => {
      const { adapter, controls } = await mounted();
      const clicks: MapEvents["click"][] = [];
      adapter.on("click", (event) => clicks.push(event));
      controls.simulateClick({ lat: CENTRE.lat + 0.01, lng: CENTRE.lng });
      await controls.settle();
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.latlng.lat).toBeCloseTo(CENTRE.lat + 0.01, 3);
      expect(typeof clicks[0]?.point.x).toBe("number");
      expect(typeof clicks[0]?.point.y).toBe("number");
      expect(Array.isArray(clicks[0]?.features)).toBe(true);
    });

    it("emits loading and tileError, and a tile error is not fatal", async () => {
      const { adapter, controls } = await mounted();
      const loading: boolean[] = [];
      let tileErrors = 0;
      let fatalErrors = 0;
      adapter.on("loading", (state) => loading.push(state));
      adapter.on("tileError", () => {
        tileErrors += 1;
      });
      adapter.on("fatalError", () => {
        fatalErrors += 1;
      });
      controls.simulateLoading(true);
      controls.simulateLoading(false);
      controls.simulateTileError();
      await controls.settle();
      expect(loading).toEqual([true, false]);
      expect(tileErrors).toBe(1);
      expect(fatalErrors).toBe(0);
    });

    it("emits basemapUnavailable once, naming the basemap, when no tile of it loads, and it is not fatal", async () => {
      const { adapter, controls } = await mounted();
      const unavailable: MapEvents["basemapUnavailable"][] = [];
      let fatalErrors = 0;
      adapter.on("basemapUnavailable", (value) => unavailable.push(value));
      adapter.on("fatalError", () => {
        fatalErrors += 1;
      });
      controls.simulateBasemapUnavailable();
      await controls.settle();
      expect(unavailable.map((basemap) => basemap.id)).toEqual([
        controls.basemap.id,
      ]);
      expect(fatalErrors).toBe(0);
    });

    it("emits fatalError, and not tileError, when the engine fails after loading", async () => {
      const { adapter, controls } = await mounted();
      const fatal: MapEvents["fatalError"][] = [];
      let tileErrors = 0;
      adapter.on("fatalError", (error) => fatal.push(error));
      adapter.on("tileError", () => {
        tileErrors += 1;
      });
      controls.simulateFatalError();
      await controls.settle();
      expect(fatal).toHaveLength(1);
      expect(fatal[0]).toBeInstanceOf(MapEngineError);
      expect(fatal[0]?.reason).toBe("stopped");
      expect(tileErrors).toBe(0);
    });

    it("emits userZoom for a zoom gesture, with the new view", async () => {
      const { adapter, controls, zoom } = await mounted();
      const zooms: number[] = [];
      adapter.on("userZoom", (view) => zooms.push(view.zoom));
      controls.simulateUserZoom(zoom + 1);
      await controls.settle();
      expect(zooms.length).toBeGreaterThan(0);
      expect(zooms.at(-1)).toBeCloseTo(zoom + 1, 3);
      expect(adapter.getView().zoom).toBeCloseTo(zoom + 1, 3);
    });

    it("never emits userZoom for a change made in code", async () => {
      const { adapter, controls, zoom } = await mounted();
      let userZooms = 0;
      adapter.on("userZoom", () => {
        userZooms += 1;
      });
      adapter.setView({ zoom: zoom + 1 }, NO_ANIMATION);
      adapter.zoomIn(NO_ANIMATION);
      adapter.zoomOut(NO_ANIMATION);
      adapter.panBy(40, -20, NO_ANIMATION);
      adapter.rotateBy(30, NO_ANIMATION);
      adapter.resetBearing(NO_ANIMATION);
      adapter.fitBounds(
        { south: -34.1, west: 18.3, north: -33.8, east: 18.7 },
        { ...NO_ANIMATION, maxZoom: 12 },
      );
      await adapter.setBasemap(controls.basemap);
      await controls.settle();
      expect(userZooms).toBe(0);
    });

    it("swaps the basemap and keeps valid zoom limits", async () => {
      const { adapter, controls } = await mounted();
      await adapter.setBasemap(controls.basemap);
      await controls.settle();
      expect(adapter.getMinZoom()).toBeLessThan(adapter.getMaxZoom());
    });

    it("swaps the basemap in Save data mode and back, keeping valid zoom limits", async () => {
      const { adapter, controls } = await mounted();
      await adapter.setBasemap(controls.basemap, { saveData: true });
      await controls.settle();
      expect(adapter.getMinZoom()).toBeLessThan(adapter.getMaxZoom());
      await adapter.setBasemap(controls.basemap, { saveData: false });
      await controls.settle();
      expect(adapter.getMinZoom()).toBeLessThan(adapter.getMaxZoom());
    });

    it("keeps the previous basemap when a swap fails, and swaps again afterwards", async () => {
      const { adapter, controls } = await mounted();
      if (controls.failNextBasemap === undefined) {
        return;
      }
      const { basemap } = controls;
      const narrower: BasemapDefinition = {
        ...basemap,
        id: `${basemap.id}-narrower`,
        minZoom: basemap.minZoom + 1,
        maxZoom: basemap.maxZoom - 1,
      };
      let fatalErrors = 0;
      adapter.on("fatalError", () => {
        fatalErrors += 1;
      });
      controls.failNextBasemap();
      await expect(adapter.setBasemap(narrower)).rejects.toBeInstanceOf(
        MapEngineError,
      );
      await controls.settle();
      expect(adapter.getMinZoom()).toBe(basemap.minZoom);
      expect(adapter.getMaxZoom()).toBe(basemap.maxZoom);
      expect(fatalErrors).toBe(0);

      await adapter.setBasemap(narrower);
      await controls.settle();
      expect(adapter.getMinZoom()).toBe(narrower.minZoom);
      expect(adapter.getMaxZoom()).toBe(narrower.maxZoom);
    });

    describe("projection", () => {
      const ANTIPODE: LatLng = { lat: -CENTRE.lat, lng: CENTRE.lng - 180 };
      const NEAR: LatLng = { lat: CENTRE.lat + 1, lng: CENTRE.lng + 1 };

      it("sees every place on a flat map, by default", async () => {
        const { adapter } = await mounted();
        expect(adapter.isVisible(CENTRE)).toBe(true);
        expect(adapter.isVisible(NEAR)).toBe(true);
        expect(adapter.isVisible(ANTIPODE)).toBe(true);
      });

      it("hides the far side of a globe, and shows the near side", async () => {
        const { adapter, controls } = await mounted();
        adapter.setProjection("globe");
        await controls.settle();
        expect(adapter.isVisible(CENTRE)).toBe(true);
        expect(adapter.isVisible(NEAR)).toBe(true);
        expect(adapter.isVisible(ANTIPODE)).toBe(false);
      });

      it("sees every place again when set back to flat", async () => {
        const { adapter, controls } = await mounted();
        adapter.setProjection("globe");
        adapter.setProjection("flat");
        await controls.settle();
        expect(adapter.isVisible(ANTIPODE)).toBe(true);
      });

      it("keeps the chosen shape through a basemap swap", async () => {
        const { adapter, controls } = await mounted();
        adapter.setProjection("globe");
        await adapter.setBasemap(controls.basemap);
        await controls.settle();
        expect(adapter.isVisible(ANTIPODE)).toBe(false);
      });

      it("keeps the view centre's ground resolution across the whole globe", async () => {
        const { adapter, controls } = await mounted();
        const flatAtCentre = adapter.metresPerPixel();
        adapter.setProjection("globe");
        await controls.settle();
        expect(adapter.metresPerPixel()).toBeCloseTo(flatAtCentre, 6);
        expect(adapter.metresPerPixel(60)).toBeCloseTo(flatAtCentre, 6);
        expect(adapter.metresPerPixel(0)).toBeCloseTo(flatAtCentre, 6);
      });

      it("mounts as a globe when asked, without the camera or zoom changing", async () => {
        const subject = create();
        live.push(subject.adapter);
        const { adapter, controls } = subject;
        const zoom = controls.basemap.minZoom + 2;
        await adapter.mount(controls.host, {
          ...mountOptions(controls, zoom),
          projection: "globe",
        });
        await controls.settle();
        expect(adapter.isVisible(ANTIPODE)).toBe(false);
        const view = adapter.getView();
        expect(view.zoom).toBeCloseTo(zoom, 3);
        expect(view.bearing).toBe(0);
      });
    });

    it("never throws from the animation, keyboard and focus switches", async () => {
      const { adapter } = await mounted();
      expect(() => {
        adapter.setAnimationEnabled(false);
        adapter.setAnimationEnabled(true);
        adapter.setKeyboardEnabled(false);
        adapter.setKeyboardEnabled(true);
        adapter.focus();
      }).not.toThrow();
    });

    it("can be destroyed twice, and before it is mounted", async () => {
      expect(() => create().adapter.destroy()).not.toThrow();
      const { adapter } = await mounted();
      adapter.destroy();
      expect(() => adapter.destroy()).not.toThrow();
    });

    describe("data layers", () => {
      it("draws a feed layer's points and replaces them on the next call", async () => {
        const { adapter, controls } = await mounted();
        adapter.setFeatureLayer("quakes", [POINT_A, POINT_B]);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "quakes", kind: "features", count: 2 },
        ]);
        adapter.setFeatureLayer("quakes", [POINT_A]);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "quakes", kind: "features", count: 1 },
        ]);
      });

      it("reports a tile overlay whose tiles all failed, naming it and its tiles, and raises no general tile error", async () => {
        const { adapter, controls } = await mounted();
        const reports: MapEvents["tileLayerUnavailable"][] = [];
        let tileErrors = 0;
        let fatalErrors = 0;
        adapter.on("tileLayerUnavailable", (report) => reports.push(report));
        adapter.on("tileError", () => {
          tileErrors += 1;
        });
        adapter.on("fatalError", () => {
          fatalErrors += 1;
        });
        adapter.setTileLayer("imagery", TILES);
        await controls.settle();
        controls.simulateTileLayerFailure("imagery");
        await controls.settle();
        expect(reports).toEqual([{ layerId: "imagery", tiles: TILES.tiles }]);
        expect(tileErrors).toBe(0);
        expect(fatalErrors).toBe(0);
      });

      it("reports a tile overlay again for the tiles it was set to next", async () => {
        const { adapter, controls } = await mounted();
        const reports: MapEvents["tileLayerUnavailable"][] = [];
        adapter.on("tileLayerUnavailable", (report) => reports.push(report));
        adapter.setTileLayer("imagery", TILES);
        await controls.settle();
        controls.simulateTileLayerFailure("imagery");
        const next = "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg";
        adapter.setTileLayer("imagery", { ...TILES, tiles: next });
        await controls.settle();
        controls.simulateTileLayerFailure("imagery");
        await controls.settle();
        expect(reports.map((report) => report.tiles)).toEqual([
          TILES.tiles,
          next,
        ]);
      });

      it("reports nothing for a tile overlay that was removed or never set", async () => {
        const { adapter, controls } = await mounted();
        const reports: MapEvents["tileLayerUnavailable"][] = [];
        adapter.on("tileLayerUnavailable", (report) => reports.push(report));
        adapter.setTileLayer("imagery", TILES);
        adapter.removeLayer("imagery");
        await controls.settle();
        controls.simulateTileLayerFailure("imagery");
        controls.simulateTileLayerFailure("never-set");
        await controls.settle();
        expect(reports).toEqual([]);
      });

      it("draws a tile overlay, and changes its opacity in place", async () => {
        const { adapter, controls } = await mounted();
        adapter.setTileLayer("imagery", TILES);
        adapter.setTileLayer("imagery", { ...TILES, opacity: 0.4 });
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "imagery", kind: "tiles", tiles: TILES.tiles, opacity: 0.4 },
        ]);
        adapter.setTileLayer("imagery", {
          ...TILES,
          tiles: "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg",
        });
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          {
            id: "imagery",
            kind: "tiles",
            tiles: "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg",
            opacity: 0.8,
          },
        ]);
      });

      it("draws shapes, and removes any layer by id", async () => {
        const { adapter, controls } = await mounted();
        adapter.setShapeLayer("area", SHAPES);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "area", kind: "shapes", count: 2 },
        ]);
        adapter.removeLayer("area");
        adapter.removeLayer("never-drawn");
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([]);
      });

      it("keeps tile overlays lowest, then shapes, then points, whatever the order of calls", async () => {
        const { adapter, controls } = await mounted();
        adapter.setFeatureLayer("quakes", [POINT_A]);
        adapter.setShapeLayer("area", SHAPES);
        adapter.setTileLayer("imagery", TILES);
        await controls.settle();
        expect(controls.drawnLayers().map((layer) => layer.id)).toEqual([
          "imagery",
          "area",
          "quakes",
        ]);
      });

      it("keeps every data layer through a basemap swap", async () => {
        const { adapter, controls } = await mounted();
        adapter.setTileLayer("imagery", TILES);
        adapter.setFeatureLayer("quakes", [POINT_A, POINT_B]);
        await adapter.setBasemap(controls.basemap);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "imagery", kind: "tiles", tiles: TILES.tiles, opacity: 0.8 },
          { id: "quakes", kind: "features", count: 2 },
        ]);
      });

      it("draws layers set before it was mounted", async () => {
        const subject = create();
        live.push(subject.adapter);
        const { adapter, controls } = subject;
        adapter.setFeatureLayer("quakes", [POINT_A]);
        await adapter.mount(controls.host, mountOptions(controls, 5));
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "quakes", kind: "features", count: 1 },
        ]);
      });

      it("reports a tap on a drawn point, and nothing once its layer is gone", async () => {
        const { adapter, controls } = await mounted();
        const taps: MapFeatureTap[] = [];
        adapter.on("featureTap", (tap) => taps.push(tap));
        adapter.setFeatureLayer("quakes", [POINT_A, POINT_B]);
        await controls.settle();
        controls.simulateFeatureTap("quakes", "b");
        expect(taps).toEqual([
          {
            layerId: "quakes",
            featureId: "b",
            hits: [{ layerId: "quakes", featureId: "b" }],
          },
        ]);
        adapter.removeLayer("quakes");
        await controls.settle();
        controls.simulateFeatureTap("quakes", "b");
        expect(taps).toHaveLength(1);
      });

      it("draws styled polygons and lines, replaces them and removes them", async () => {
        const { adapter, controls } = await mounted();
        adapter.setStyledShapes("regions", STYLED_AREAS);
        adapter.setStyledShapes("routes", STYLED_LINES);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "regions", kind: "styled", geometry: "area", count: 2 },
          { id: "routes", kind: "styled", geometry: "line", count: 1 },
        ]);
        adapter.setStyledShapes("regions", {
          ...STYLED_AREAS,
          shapes: STYLED_AREAS.shapes.slice(0, 1),
        });
        adapter.removeLayer("routes");
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "regions", kind: "styled", geometry: "area", count: 1 },
        ]);
      });

      it("draws a vector tile layer with its source layers", async () => {
        const { adapter, controls } = await mounted();
        adapter.setVectorLayer("districts", VECTOR);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          {
            id: "districts",
            kind: "vector",
            tiles: VECTOR.source.tiles,
            sourceLayers: ["areas", "borders"],
          },
        ]);
        adapter.removeLayer("districts");
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([]);
      });

      it("draws a heatmap from points or from vector tiles", async () => {
        const { adapter, controls } = await mounted();
        adapter.setHeatmapLayer("density", HEATMAP_POINTS);
        adapter.setHeatmapLayer("tile-density", HEATMAP_VECTOR);
        await controls.settle();
        expect(controls.drawnLayers()).toEqual([
          { id: "density", kind: "heatmap", source: "points", count: 2 },
          { id: "tile-density", kind: "heatmap", source: "vector", count: 0 },
        ]);
        adapter.setHeatmapLayer("density", {
          ...HEATMAP_POINTS,
          style: { ...HEATMAP_POINTS.style, radius: 40 },
        });
        await controls.settle();
        expect(controls.drawnLayers()).toHaveLength(2);
      });

      it("stacks imagery, vector tiles, styled shapes, shapes, heatmaps and points in that order", async () => {
        const { adapter, controls } = await mounted();
        adapter.setFeatureLayer("quakes", [POINT_A]);
        adapter.setHeatmapLayer("density", HEATMAP_POINTS);
        adapter.setShapeLayer("area", SHAPES);
        adapter.setStyledShapes("regions", STYLED_AREAS);
        adapter.setVectorLayer("districts", VECTOR);
        adapter.setTileLayer("imagery", TILES);
        await controls.settle();
        expect(controls.drawnLayers().map((layer) => layer.id)).toEqual([
          "imagery",
          "districts",
          "regions",
          "area",
          "density",
          "quakes",
        ]);
      });

      it("keeps styled, vector and heatmap layers through a basemap swap", async () => {
        const { adapter, controls } = await mounted();
        adapter.setVectorLayer("districts", VECTOR);
        adapter.setStyledShapes("regions", STYLED_AREAS);
        adapter.setHeatmapLayer("density", HEATMAP_POINTS);
        await adapter.setBasemap(controls.basemap);
        await controls.settle();
        expect(controls.drawnLayers().map((layer) => layer.kind)).toEqual([
          "vector",
          "styled",
          "heatmap",
        ]);
      });

      it("reports a tap on a styled polygon like a tap on a point", async () => {
        const { adapter, controls } = await mounted();
        const taps: MapFeatureTap[] = [];
        adapter.on("featureTap", (tap) => taps.push(tap));
        adapter.setStyledShapes("regions", STYLED_AREAS);
        await controls.settle();
        controls.simulateFeatureTap("regions", "south");
        expect(taps.map((tap) => tap.featureId)).toEqual(["south"]);
      });

      it("reports every feature under a tap, topmost first and once each", async () => {
        const { adapter, controls } = await mounted();
        const taps: MapFeatureTap[] = [];
        adapter.on("featureTap", (tap) => taps.push(tap));
        adapter.setFeatureLayer("quakes", [POINT_A, POINT_B]);
        adapter.setStyledShapes("regions", STYLED_AREAS);
        await controls.settle();
        controls.simulateFeatureHits([
          { layerId: "quakes", featureId: "a" },
          { layerId: "regions", featureId: "south" },
          { layerId: "quakes", featureId: "a" },
          { layerId: "regions", featureId: "not-drawn" },
        ]);
        expect(taps).toEqual([
          {
            layerId: "quakes",
            featureId: "a",
            hits: [
              { layerId: "quakes", featureId: "a" },
              { layerId: "regions", featureId: "south" },
            ],
          },
        ]);
      });

      it("finds the features under a pixel, and none where nothing is drawn", async () => {
        const { adapter, controls } = await mounted();
        const centre = adapter.project(CENTRE);
        expect(adapter.featuresAt(centre)).toEqual([]);
        adapter.setFeatureLayer("quakes", [POINT_A]);
        adapter.setStyledShapes("regions", STYLED_AREAS);
        await controls.settle();
        controls.simulateFeatureHits([
          { layerId: "quakes", featureId: "a" },
          { layerId: "regions", featureId: "south" },
        ]);
        expect(adapter.featuresAt(centre)).toEqual([
          { layerId: "quakes", featureId: "a" },
          { layerId: "regions", featureId: "south" },
        ]);
        adapter.removeLayer("quakes");
        await controls.settle();
        expect(adapter.featuresAt(centre)).toEqual([
          { layerId: "regions", featureId: "south" },
        ]);
      });
    });

    describe("view bounds", () => {
      it("reports the box the map shows, around the view centre", async () => {
        const { adapter } = await mounted();
        const bounds = adapter.getBounds();
        expect(bounds.west).toBeLessThan(CENTRE.lng);
        expect(bounds.east).toBeGreaterThan(CENTRE.lng);
        expect(bounds.south).toBeLessThan(CENTRE.lat);
        expect(bounds.north).toBeGreaterThan(CENTRE.lat);
      });

      it("shrinks as the map zooms in, and follows the centre", async () => {
        const { adapter, controls, zoom } = await mounted();
        const wide = adapter.getBounds();
        adapter.setView({ zoom: zoom + 2 }, NO_ANIMATION);
        await controls.settle();
        const tight = adapter.getBounds();
        expect(tight.east - tight.west).toBeLessThan(wide.east - wide.west);
        expect(tight.north - tight.south).toBeLessThan(wide.north - wide.south);
        adapter.setView({ center: { lat: 10, lng: 20 } }, NO_ANIMATION);
        await controls.settle();
        const moved = adapter.getBounds();
        expect(moved.west).toBeLessThan(20);
        expect(moved.east).toBeGreaterThan(20);
      });
    });

    describe("image export", () => {
      it("returns the map as a PNG blob, with credit text when given", async () => {
        const { adapter } = await mounted();
        const plain = await adapter.toImage();
        expect(plain.type).toBe("image/png");
        expect(plain.size).toBeGreaterThan(0);
        const credited = await adapter.toImage({
          attribution: "© Example contributors",
        });
        expect(credited.type).toBe("image/png");
      });

      it("draws the ui's own marks into the image, and still makes a PNG", async () => {
        const { adapter } = await mounted();
        const image = await adapter.toImage({
          attribution: "© Example contributors",
          drawing: {
            colour: "#1a73c8",
            halo: "#ffffff",
            marks: [
              {
                kind: "path",
                positions: [
                  CENTRE,
                  { lat: -33.95, lng: 18.5 },
                  { lat: -33.85, lng: 18.45 },
                ],
                closed: true,
                fill: true,
                dashed: false,
              },
              { kind: "dot", position: CENTRE },
            ],
          },
        });
        expect(image.type).toBe("image/png");
        expect(image.size).toBeGreaterThan(0);
      });

      it("rejects with an export-failed engine error when it cannot produce an image", async () => {
        const { adapter, controls } = await mounted();
        if (controls.failNextImage === undefined) {
          return;
        }
        controls.failNextImage();
        await expect(adapter.toImage()).rejects.toMatchObject({
          name: "MapEngineError",
          reason: "export-failed",
        });
        const again = await adapter.toImage();
        expect(again.type).toBe("image/png");
      });

      it("rejects when the map is not mounted", async () => {
        const subject = create();
        live.push(subject.adapter);
        await expect(subject.adapter.toImage()).rejects.toBeInstanceOf(
          MapEngineError,
        );
      });
    });

    describe("edit handles", () => {
      /** The position `dx` pixels to the right of a position, on screen. */
      function beside(adapter: MapAdapter, at: LatLng, dx: number): LatLng {
        const point = adapter.project(at);
        return adapter.unproject({ x: point.x + dx, y: point.y });
      }

      function record(adapter: MapAdapter) {
        const drags: MapHandleDrag[] = [];
        const hovers: (string | null)[] = [];
        const clicks: LatLng[] = [];
        adapter.on("handleDrag", (drag) => drags.push(drag));
        adapter.on("handleHover", (id) => hovers.push(id));
        adapter.on("click", (click) => clicks.push(click.latlng));
        return { drags, hovers, clicks };
      }

      const HANDLE: MapEditHandle = {
        id: "v0",
        position: CENTRE,
        kind: "vertex",
      };

      it("reports a press on a handle as start, move and end, and never as a click", async () => {
        const { adapter, controls } = await mounted();
        const { drags, clicks } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        const target = beside(adapter, CENTRE, 60);
        controls.pointerDown(CENTRE);
        controls.pointerMove(beside(adapter, CENTRE, 30));
        controls.pointerMove(target);
        controls.pointerUp(target);
        controls.simulateClick(target);
        expect(drags.map((drag) => drag.phase)).toEqual([
          "start",
          "move",
          "move",
          "end",
        ]);
        expect(drags.every((drag) => drag.id === "v0")).toBe(true);
        expect(drags.at(-1)?.moved).toBe(true);
        expect(drags.at(-2)?.latlng.lng).toBeCloseTo(target.lng, 4);
        expect(clicks).toEqual([]);
      });

      it("reports a press that does not travel as a tap, still without a click", async () => {
        const { adapter, controls } = await mounted();
        const { drags, clicks } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        controls.pointerDown(CENTRE);
        controls.pointerUp(CENTRE);
        controls.simulateClick(CENTRE);
        expect(drags.map((drag) => drag.phase)).toEqual(["start", "end"]);
        expect(drags[1]?.moved).toBe(false);
        expect(clicks).toEqual([]);
      });

      it("lets the next click through after a press on a handle", async () => {
        const { adapter, controls } = await mounted();
        const { clicks } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        controls.pointerDown(CENTRE);
        controls.pointerUp(CENTRE);
        controls.simulateClick(CENTRE);
        controls.pointerDown(beside(adapter, CENTRE, 200));
        controls.pointerUp(beside(adapter, CENTRE, 200));
        controls.simulateClick(beside(adapter, CENTRE, 200));
        expect(clicks).toHaveLength(1);
      });

      it("ignores a press away from every handle", async () => {
        const { adapter, controls } = await mounted();
        const { drags, clicks } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        const away = beside(adapter, CENTRE, 100);
        controls.pointerDown(away);
        controls.pointerMove(beside(adapter, CENTRE, 140));
        controls.pointerUp(away);
        controls.simulateClick(away);
        expect(drags).toEqual([]);
        expect(clicks).toHaveLength(1);
      });

      it("reaches further for a finger than for a mouse", async () => {
        const { adapter, controls } = await mounted();
        const { drags } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        const near = beside(adapter, CENTRE, 18);
        controls.pointerDown(near, "mouse");
        controls.pointerUp(near, "mouse");
        expect(drags).toEqual([]);
        controls.pointerDown(near, "touch");
        controls.pointerUp(near, "touch");
        expect(drags.map((drag) => drag.phase)).toEqual(["start", "end"]);
      });

      it("turns gestures off when the list is emptied", async () => {
        const { adapter, controls } = await mounted();
        const { drags } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        adapter.setEditHandles([]);
        controls.pointerDown(CENTRE);
        controls.pointerUp(CENTRE);
        expect(drags).toEqual([]);
      });

      it("ignores a handle beyond the horizon of a globe, though a press lands where it would project", async () => {
        const { adapter, controls } = await mounted();
        adapter.setProjection("globe");
        await controls.settle();
        const { drags } = record(adapter);
        const farSide: LatLng = { lat: -CENTRE.lat, lng: CENTRE.lng - 180 };
        adapter.setEditHandles([{ ...HANDLE, position: farSide }]);
        controls.pointerDown(farSide);
        controls.pointerUp(farSide);
        expect(drags).toEqual([]);
      });

      it("presses a handle across the antimeridian where the overlay draws it", async () => {
        const { adapter, controls } = await mounted();
        adapter.setView({ center: { lat: 0, lng: 179.99 } }, NO_ANIMATION);
        await controls.settle();
        const { drags } = record(adapter);
        adapter.setEditHandles([
          { ...HANDLE, position: { lat: 0, lng: -179.995 } },
        ]);
        // The copy of the world east of the antimeridian, beside the centre.
        controls.pointerDown({ lat: 0, lng: 180.005 });
        expect(drags.map((drag) => drag.phase)).toEqual(["start"]);
        controls.pointerUp({ lat: 0, lng: 180.005 });
      });

      it("picks the nearest of two handles", async () => {
        const { adapter, controls } = await mounted();
        const { drags } = record(adapter);
        adapter.setEditHandles([
          HANDLE,
          { id: "v1", position: beside(adapter, CENTRE, 16), kind: "vertex" },
        ]);
        controls.pointerDown(beside(adapter, CENTRE, 12));
        controls.pointerUp(beside(adapter, CENTRE, 12));
        expect(drags[0]?.id).toBe("v1");
      });

      it("carries on a press with the handle it began on when the handles change", async () => {
        const { adapter, controls } = await mounted();
        const { drags } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        controls.pointerDown(CENTRE);
        adapter.setEditHandles([]);
        const target = beside(adapter, CENTRE, 50);
        controls.pointerMove(target);
        controls.pointerUp(target);
        expect(drags.map((drag) => drag.phase)).toEqual([
          "start",
          "move",
          "end",
        ]);
        expect(drags.every((drag) => drag.id === "v0")).toBe(true);
      });

      it("reports hover for a mouse over a handle and off it again", async () => {
        const { adapter, controls } = await mounted();
        const { hovers } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        controls.pointerMove(beside(adapter, CENTRE, 4));
        controls.pointerMove(beside(adapter, CENTRE, 6));
        controls.pointerMove(beside(adapter, CENTRE, 80));
        expect(hovers).toEqual(["v0", null]);
      });

      it("reports no hover for a finger", async () => {
        const { adapter, controls } = await mounted();
        const { hovers } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        controls.pointerMove(beside(adapter, CENTRE, 4), "touch");
        expect(hovers).toEqual([]);
      });

      it("clears the hover when the hovered handle goes", async () => {
        const { adapter, controls } = await mounted();
        const { hovers } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        controls.pointerMove(beside(adapter, CENTRE, 2));
        adapter.setEditHandles([]);
        expect(hovers).toEqual(["v0", null]);
      });

      it("keeps the handles through a basemap change", async () => {
        const { adapter, controls } = await mounted();
        const { drags } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        await adapter.setBasemap(controls.basemap);
        await controls.settle();
        controls.pointerDown(CENTRE);
        controls.pointerUp(CENTRE);
        expect(drags.map((drag) => drag.phase)).toEqual(["start", "end"]);
      });

      it("stops reporting after destroy", async () => {
        const { adapter, controls } = await mounted();
        const { drags } = record(adapter);
        adapter.setEditHandles([HANDLE]);
        adapter.destroy();
        expect(() => {
          adapter.setEditHandles([HANDLE]);
          controls.pointerDown(CENTRE);
        }).not.toThrow();
        expect(drags).toEqual([]);
      });
    });
  });
}

const LOOK: MapShapeLook = {
  colour: "#0072b2",
  fillOpacity: 0.55,
  pattern: "solid",
  dash: "solid",
  width: 1.5,
};

const STYLED_AREAS: MapStyledShapes = {
  geometry: "area",
  shapes: [
    {
      id: "north",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.3, -33.8],
            [18.6, -33.8],
            [18.6, -33.7],
            [18.3, -33.8],
          ],
        ],
      },
      look: LOOK,
      label: "North",
    },
    {
      id: "south",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [18.3, -34],
            [18.6, -34],
            [18.6, -33.85],
            [18.3, -34],
          ],
        ],
      },
      look: { ...LOOK, colour: "#d55e00", pattern: "dots" },
    },
  ],
  labelMinZoom: 3,
};

const STYLED_LINES: MapStyledShapes = {
  geometry: "line",
  shapes: [
    {
      id: "main",
      geometry: {
        type: "LineString",
        coordinates: [
          [18.3, -34],
          [18.6, -33.8],
        ],
      },
      look: { ...LOOK, dash: "dashed", width: 4 },
    },
  ],
};

const VECTOR_SOURCE = {
  tiles: "https://vector.test/{z}/{x}/{y}.pbf",
  minzoom: 0,
  maxzoom: 14,
} as const;

const VECTOR: MapVectorTiles = {
  source: VECTOR_SOURCE,
  minzoom: 2,
  maxzoom: 16,
  layers: [
    {
      sourceLayer: "areas",
      geometry: "area",
      rule: {
        kind: "category",
        field: "kind",
        cases: [{ value: "park", look: LOOK }],
        fallback: { ...LOOK, colour: "#e69f00" },
      },
      label: { field: "name", minzoom: 6 },
    },
    {
      sourceLayer: "borders",
      geometry: "line",
      rule: {
        kind: "steps",
        field: "rank",
        steps: [
          { min: 0, look: LOOK },
          { min: 5, look: { ...LOOK, dash: "dashed", width: 3 } },
        ],
      },
      minzoom: 4,
    },
  ],
};

const HEATMAP_STYLE = {
  radius: 20,
  intensity: 1,
  opacity: 0.8,
  ramp: ["#440154", "#21918c", "#fde725"],
} as const;

const HEATMAP_POINTS: MapHeatmap = {
  source: {
    kind: "points",
    points: [
      { position: CENTRE, weight: 3 },
      { position: { lat: -33.95, lng: 18.5 } },
    ],
  },
  style: HEATMAP_STYLE,
};

const HEATMAP_VECTOR: MapHeatmap = {
  source: {
    kind: "vector",
    source: VECTOR_SOURCE,
    sourceLayer: "events",
    weightField: "size",
  },
  style: HEATMAP_STYLE,
};

const POINT_A: MapFeature = {
  id: "a",
  position: CENTRE,
  colour: "#e69f00",
  radius: 6,
  shape: "circle",
};

const POINT_B: MapFeature = {
  id: "b",
  position: { lat: -33.95, lng: 18.5 },
  colour: "#0072b2",
  radius: 9,
  shape: "triangle",
};

const TILES: MapTileOverlay = {
  tiles: "https://tiles.test/2026-11-08/{z}/{y}/{x}.jpg",
  tileSize: 256,
  maxzoom: 9,
  opacity: 0.8,
};

const SHAPES: MapShapes = {
  colour: "#d55e00",
  geometries: [
    {
      type: "Polygon",
      coordinates: [
        [
          [18.3, -34],
          [18.6, -34],
          [18.6, -33.8],
          [18.3, -34],
        ],
      ],
    },
    {
      type: "LineString",
      coordinates: [
        [18.3, -34],
        [18.6, -33.8],
      ],
    },
  ],
};
