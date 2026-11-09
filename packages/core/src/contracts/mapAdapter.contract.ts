import { afterEach, describe, expect, it } from "vitest";
import type { BasemapDefinition } from "../ports/basemap";
import { MapEngineError } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type {
  MapAdapter,
  MapEvents,
  MapHostElement,
  MapMountOptions,
} from "../ports/map";

/**
 * What the map contract needs besides the adapter itself. A real adapter
 * supplies its own: a host in jsdom or a browser, and ways to make its engine
 * report clicks, loading and tile errors.
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
  /** Makes the engine report that loading started or finished. */
  simulateLoading(loading: boolean): void;
  /**
   * Builds an adapter whose `mount` rejects with a `MapEngineError`, for
   * example by hiding WebGL. Optional because some engines cannot fail.
   */
  createFailingMount?(): MapAdapter;
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

    it("reports its capabilities as booleans", () => {
      const { adapter } = create();
      expect(typeof adapter.capabilities.supportsRotation).toBe("boolean");
      expect(typeof adapter.capabilities.supportsFeatureQuery).toBe("boolean");
    });

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

    it("rotates with rotateBy and resetBearing only when it supports rotation", async () => {
      const { adapter, controls } = await mounted();
      adapter.rotateBy(90, NO_ANIMATION);
      await controls.settle();
      if (adapter.capabilities.supportsRotation) {
        expect(adapter.getView().bearing).toBeCloseTo(90, 3);
        adapter.rotateBy(-180, NO_ANIMATION);
        await controls.settle();
        expect(adapter.getView().bearing).toBeCloseTo(270, 3);
        adapter.resetBearing(NO_ANIMATION);
        await controls.settle();
        expect(adapter.getView().bearing).toBeCloseTo(0, 3);
      } else {
        adapter.resetBearing(NO_ANIMATION);
        await controls.settle();
        expect(adapter.getView().bearing).toBe(0);
      }
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

    it("emits rotate only when it supports rotation", async () => {
      const { adapter, controls } = await mounted();
      let rotations = 0;
      adapter.on("rotate", () => {
        rotations += 1;
      });
      adapter.rotateBy(30, NO_ANIMATION);
      await controls.settle();
      expect(rotations > 0).toBe(adapter.capabilities.supportsRotation);
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

    it("emits click with the position and pixel, and features only when it can query them", async () => {
      const { adapter, controls } = await mounted();
      const clicks: MapEvents["click"][] = [];
      adapter.on("click", (event) => clicks.push(event));
      controls.simulateClick({ lat: CENTRE.lat + 0.01, lng: CENTRE.lng });
      await controls.settle();
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.latlng.lat).toBeCloseTo(CENTRE.lat + 0.01, 3);
      expect(typeof clicks[0]?.point.x).toBe("number");
      expect(typeof clicks[0]?.point.y).toBe("number");
      if (!adapter.capabilities.supportsFeatureQuery) {
        expect(clicks[0]?.features).toBeUndefined();
      }
    });

    it("emits loading and tileError", async () => {
      const { adapter, controls } = await mounted();
      const loading: boolean[] = [];
      let tileErrors = 0;
      adapter.on("loading", (state) => loading.push(state));
      adapter.on("tileError", () => {
        tileErrors += 1;
      });
      controls.simulateLoading(true);
      controls.simulateLoading(false);
      controls.simulateTileError();
      await controls.settle();
      expect(loading).toEqual([true, false]);
      expect(tileErrors).toBe(1);
    });

    it("swaps the basemap and keeps valid zoom limits", async () => {
      const { adapter, controls } = await mounted();
      await adapter.setBasemap(controls.basemap);
      await controls.settle();
      expect(adapter.getMinZoom()).toBeLessThan(adapter.getMaxZoom());
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
  });
}
