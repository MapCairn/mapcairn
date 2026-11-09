import { afterEach, describe, expect, it } from "vitest";
import type { DrawnLayer } from "../fakes/FakeMapAdapter";
import type { BasemapDefinition } from "../ports/basemap";
import { MapEngineError } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type {
  MapAdapter,
  MapEvents,
  MapFeature,
  MapFeatureTap,
  MapHostElement,
  MapMountOptions,
  MapShapes,
  MapTileOverlay,
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
        expect(taps).toEqual([{ layerId: "quakes", featureId: "b" }]);
        adapter.removeLayer("quakes");
        await controls.settle();
        controls.simulateFeatureTap("quakes", "b");
        expect(taps).toHaveLength(1);
      });
    });
  });
}

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
