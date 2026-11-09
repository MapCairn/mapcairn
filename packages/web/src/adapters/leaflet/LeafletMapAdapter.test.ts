import type { MapAdapter, MapEvents, MapMountOptions } from "@karta/core";
import { MapEngineError, metresPerPixel } from "@karta/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLeafletMapAdapter } from "./LeafletMapAdapter";
import {
  captureMaps,
  createSizedHost,
  L,
  loadPendingTiles,
  rasterBasemap,
  type SizedHost,
  tileLayerOf,
  vectorBasemap,
} from "./leafletTestHost";

const latestMap = captureMaps();

const CENTRE = { lat: -33.9, lng: 18.4 };

function options(overrides: Partial<MapMountOptions> = {}): MapMountOptions {
  return {
    view: { center: CENTRE, zoom: 10, bearing: 0 },
    basemap: rasterBasemap(),
    reducedMotion: true,
    ...overrides,
  };
}

const live: MapAdapter[] = [];
const hosts: SizedHost[] = [];

async function mounted(
  overrides: Partial<MapMountOptions> = {},
  prepareHost?: (element: HTMLElement) => void,
) {
  const host = createSizedHost();
  hosts.push(host);
  prepareHost?.(host.element);
  const adapter = createLeafletMapAdapter();
  live.push(adapter);
  await adapter.mount(host.element, options(overrides));
  return { adapter, host: host.element, sized: host, map: latestMap() };
}

beforeAll(() => {
  // happy-dom reports no 3D transforms, which makes Leaflet round every zoom
  // to a whole number and disables zoom animation. Real browsers have both.
  L.Browser.any3d = true;
});

afterEach(() => {
  for (const adapter of live.splice(0)) {
    adapter.destroy();
  }
  for (const host of hosts.splice(0)) {
    host.element.remove();
  }
  vi.unstubAllGlobals();
});

describe("LeafletMapAdapter options", () => {
  it("declares no rotation and no feature query", () => {
    expect(createLeafletMapAdapter().capabilities).toEqual({
      supportsRotation: false,
      supportsFeatureQuery: false,
    });
  });

  it("creates a map without engine controls or engine keys and with continuous zoom", async () => {
    const { host, map } = await mounted();
    expect(map.options).toMatchObject({
      zoomControl: false,
      attributionControl: false,
      keyboard: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      bounceAtZoomLimits: true,
      worldCopyJump: false,
      zoomSnap: 0,
      zoomDelta: 1,
    });
    expect(host.querySelector(".leaflet-control")).toBeNull();
    expect(map.keyboard.enabled()).toBe(false);
  });

  it("uses the normalised zoom as Leaflet's zoom and the basemap's limits", async () => {
    const { adapter, map } = await mounted({
      view: { center: CENTRE, zoom: 7.25, bearing: 0 },
      basemap: rasterBasemap({ minZoom: 2, maxZoom: 17 }),
    });
    expect(map.getZoom()).toBe(7.25);
    expect(adapter.getView()).toEqual({
      center: {
        lat: expect.closeTo(CENTRE.lat, 6),
        lng: expect.closeTo(CENTRE.lng, 6),
      },
      zoom: 7.25,
      bearing: 0,
    });
    expect(adapter.getMinZoom()).toBe(2);
    expect(adapter.getMaxZoom()).toBe(17);
  });

  it("clamps the mount zoom into the basemap limits", async () => {
    const { adapter } = await mounted({
      view: { center: CENTRE, zoom: 30, bearing: 0 },
      basemap: rasterBasemap({ maxZoom: 18 }),
    });
    expect(adapter.getView().zoom).toBe(18);
  });

  it("keeps the zoom limits and tile zoom unchanged on a retina screen", async () => {
    const retina = L.Browser.retina;
    L.Browser.retina = true;
    try {
      const { adapter, host } = await mounted({
        view: { center: CENTRE, zoom: 19, bearing: 0 },
        basemap: rasterBasemap({ maxZoom: 19 }),
      });
      expect(adapter.getMaxZoom()).toBe(19);
      expect(adapter.getView().zoom).toBe(19);
      const tile = host.querySelector<HTMLImageElement>("img.leaflet-tile");
      expect(tile?.getAttribute("src")).toMatch(/^https:\/\/tiles\.test\/19\//);
    } finally {
      L.Browser.retina = retina;
    }
  });

  it("requests 512 px tiles one zoom level lower", async () => {
    const { host } = await mounted({
      view: { center: CENTRE, zoom: 10, bearing: 0 },
      basemap: rasterBasemap({
        source: {
          kind: "raster",
          tileUrl: "https://tiles.test/{z}/{x}/{y}.png",
          tileSize: 512,
        },
      }),
    });
    const tile = host.querySelector<HTMLImageElement>("img.leaflet-tile");
    expect(tile?.getAttribute("src")).toMatch(/^https:\/\/tiles\.test\/9\//);
    expect(tile?.style.width).toBe("512px");
  });
});

describe("LeafletMapAdapter mount and destroy", () => {
  it("rejects a vector basemap with a load-failed MapEngineError", async () => {
    const host = createSizedHost();
    hosts.push(host);
    const adapter = createLeafletMapAdapter();
    const result = adapter.mount(
      host.element,
      options({ basemap: vectorBasemap }),
    );
    await expect(result).rejects.toBeInstanceOf(MapEngineError);
    await expect(result).rejects.toMatchObject({ reason: "load-failed" });
    expect(host.element.childElementCount).toBe(0);
  });

  it("rejects with load-failed when Leaflet cannot start in the host", async () => {
    const { host } = await mounted({}, (element) => {
      element.className = "app-map";
    });
    // A second engine in the same, still-occupied host makes Leaflet throw.
    const second = createLeafletMapAdapter();
    await expect(second.mount(host, options())).rejects.toMatchObject({
      reason: "load-failed",
    });
    expect(host.classList.contains("leaflet-container")).toBe(true);
  });

  it("rejects a second mount", async () => {
    const { adapter, host } = await mounted();
    await expect(adapter.mount(host, options())).rejects.toMatchObject({
      reason: "load-failed",
    });
  });

  it("creates no map when destroyed while Leaflet is loading", async () => {
    const host = createSizedHost();
    hosts.push(host);
    const adapter = createLeafletMapAdapter();
    const pending = adapter.mount(host.element, options());
    adapter.destroy();
    await pending;
    expect(host.element.childElementCount).toBe(0);
    expect(host.element.className).toBe("");
  });

  it("puts the host back as it was and can be destroyed twice", async () => {
    const { adapter, host } = await mounted({}, (element) => {
      element.className = "app-map";
      element.setAttribute("tabindex", "0");
      element.setAttribute("aria-label", "Map");
    });
    expect(host.classList.contains("leaflet-container")).toBe(true);
    adapter.destroy();
    expect(() => adapter.destroy()).not.toThrow();
    expect(host.className).toBe("app-map");
    expect(host.style.position).toBe("");
    expect(host.getAttribute("tabindex")).toBe("0");
    expect(host.getAttribute("aria-label")).toBe("Map");
    expect(host.childElementCount).toBe(0);
  });

  it("stops emitting and removes its engine listeners on destroy", async () => {
    const { adapter, map } = await mounted();
    const tiles = tileLayerOf(map);
    const moves = vi.fn();
    adapter.on("move", moves);
    adapter.on("tileError", moves);
    adapter.destroy();
    map.fire("move");
    tiles.fire("tileerror");
    expect(moves).not.toHaveBeenCalled();
    expect(map.listens("move")).toBe(false);
    expect(tiles.listens("tileerror")).toBe(false);
  });

  it("can be destroyed before it is mounted", () => {
    expect(() => createLeafletMapAdapter().destroy()).not.toThrow();
  });

  it("refuses to mount after it was destroyed", async () => {
    const host = createSizedHost();
    hosts.push(host);
    const adapter = createLeafletMapAdapter();
    adapter.destroy();
    await expect(adapter.mount(host.element, options())).rejects.toBeInstanceOf(
      MapEngineError,
    );
  });

  it("throws a clear error when the view is read before mount", () => {
    expect(() => createLeafletMapAdapter().getView()).toThrow(/not mounted/);
  });
});

describe("LeafletMapAdapter accessibility", () => {
  it("leaves no tabindex, role or label from the engine on the host", async () => {
    const { host } = await mounted();
    expect(host.hasAttribute("tabindex")).toBe(false);
    expect(host.hasAttribute("role")).toBe(false);
    expect(host.hasAttribute("aria-label")).toBe(false);
  });

  it("hides the engine panes and control container from assistive technology", async () => {
    const { host } = await mounted();
    expect(
      host.querySelector(".leaflet-map-pane")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      host
        .querySelector(".leaflet-control-container")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("marks every tile image as decorative", async () => {
    const { host } = await mounted();
    const tiles = host.querySelectorAll("img.leaflet-tile");
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.getAttribute("alt")).toBe("");
      expect(tile.getAttribute("role")).toBe("presentation");
    }
  });

  it("keeps the host's own tabindex when the engine keyboard is toggled", async () => {
    const { adapter, host, map } = await mounted({}, (element) => {
      element.setAttribute("tabindex", "-1");
    });
    adapter.setKeyboardEnabled(true);
    expect(map.keyboard.enabled()).toBe(true);
    expect(host.getAttribute("tabindex")).toBe("-1");
    adapter.setKeyboardEnabled(false);
    expect(map.keyboard.enabled()).toBe(false);
    expect(host.getAttribute("tabindex")).toBe("-1");
  });

  it("adds no tabindex when the engine keyboard is turned on", async () => {
    const { adapter, host } = await mounted();
    adapter.setKeyboardEnabled(true);
    expect(host.hasAttribute("tabindex")).toBe(false);
  });

  it("focuses the host", async () => {
    const { adapter, host } = await mounted({}, (element) => {
      element.tabIndex = 0;
    });
    adapter.focus();
    expect(document.activeElement).toBe(host);
  });
});

describe("LeafletMapAdapter view", () => {
  it("lands exactly on a nearby centre when not animating", async () => {
    const { adapter } = await mounted({
      view: { center: CENTRE, zoom: 4, bearing: 0 },
    });
    adapter.setView({ center: { lat: -33.95, lng: 18.43 } });
    expect(adapter.getView().center.lat).toBeCloseTo(-33.95, 9);
    expect(adapter.getView().center.lng).toBeCloseTo(18.43, 9);
  });

  it("sets a partial view, keeps the rest and ignores the bearing", async () => {
    const { adapter } = await mounted();
    adapter.setView({ zoom: 12.5, bearing: 90 });
    expect(adapter.getView()).toMatchObject({ zoom: 12.5, bearing: 0 });
    expect(adapter.getView().center.lat).toBeCloseTo(CENTRE.lat, 6);
    adapter.setView({ center: { lat: 1, lng: 2 } });
    expect(adapter.getView().center.lat).toBeCloseTo(1, 6);
    expect(adapter.getView().zoom).toBe(12.5);
  });

  it("clamps setView into the zoom limits", async () => {
    const { adapter } = await mounted({
      basemap: rasterBasemap({ minZoom: 3, maxZoom: 15 }),
    });
    adapter.setView({ zoom: 40 });
    expect(adapter.getView().zoom).toBe(15);
    adapter.setView({ zoom: -4 });
    expect(adapter.getView().zoom).toBe(3);
  });

  it("zooms by one level and stops at the limits", async () => {
    const { adapter } = await mounted({
      view: { center: CENTRE, zoom: 14.5, bearing: 0 },
      basemap: rasterBasemap({ minZoom: 13, maxZoom: 15 }),
    });
    adapter.zoomIn();
    expect(adapter.getView().zoom).toBe(15);
    adapter.zoomOut();
    expect(adapter.getView().zoom).toBe(14);
    adapter.zoomOut();
    adapter.zoomOut();
    expect(adapter.getView().zoom).toBe(13);
  });

  it("pans by screen pixels with positive y down", async () => {
    const { adapter } = await mounted();
    const before = adapter.project(CENTRE);
    adapter.panBy(100, 50);
    const after = adapter.project(CENTRE);
    expect(after.x).toBeCloseTo(before.x - 100, 6);
    expect(after.y).toBeCloseTo(before.y - 50, 6);
  });

  it("treats rotation as a no-op", async () => {
    const { adapter } = await mounted();
    const before = adapter.getView();
    adapter.rotateBy(45);
    adapter.resetBearing();
    expect(adapter.getView()).toEqual(before);
  });

  it("maps fit padding and maxZoom onto Leaflet's options", async () => {
    const { adapter, map } = await mounted();
    const fit = vi.spyOn(map, "fitBounds");
    adapter.fitBounds(
      { south: -34, west: 18, north: -33, east: 19 },
      { padding: { top: 1, right: 2, bottom: 3, left: 4 }, maxZoom: 11 },
    );
    expect(fit).toHaveBeenCalledWith(
      [
        [-34, 18],
        [-33, 19],
      ],
      expect.objectContaining({
        paddingTopLeft: [4, 1],
        paddingBottomRight: [2, 3],
        maxZoom: 11,
        animate: false,
      }),
    );
    expect(adapter.getView().zoom).toBeLessThanOrEqual(11);
  });

  it("fits bounds to a fractional zoom", async () => {
    const { adapter } = await mounted();
    adapter.fitBounds({ south: -34.1, west: 18.3, north: -33.8, east: 18.7 });
    expect(Number.isInteger(adapter.getView().zoom)).toBe(false);
  });

  it("projects to plain host-relative pixels and back", async () => {
    const { adapter } = await mounted();
    const point = adapter.project(CENTRE);
    expect(point).toEqual({ x: 400, y: 300 });
    expect(Object.getPrototypeOf(point)).toBe(Object.prototype);
    const latlng = adapter.unproject({ x: 400, y: 300 });
    expect(Object.getPrototypeOf(latlng)).toBe(Object.prototype);
    // Leaflet rounds its pixel origin, so a pixel maps back within half a pixel.
    const halfPixelDegrees = 360 / (256 * 2 ** 10) / 2;
    expect(Math.abs(latlng.lat - CENTRE.lat)).toBeLessThan(halfPixelDegrees);
    expect(Math.abs(latlng.lng - CENTRE.lng)).toBeLessThan(halfPixelDegrees);
  });

  it("reports the centre longitude in [-180, 180] after panning across the antimeridian", async () => {
    const { adapter } = await mounted({
      view: { center: { lat: 0, lng: 179 }, zoom: 4, bearing: 0 },
    });
    adapter.setView({ center: { lat: 0, lng: 190 } });
    expect(adapter.getView().center.lng).toBeCloseTo(-170, 6);
  });

  it("measures ground resolution with core's formula", async () => {
    const { adapter } = await mounted({
      view: { center: CENTRE, zoom: 9.5, bearing: 0 },
    });
    expect(adapter.metresPerPixel()).toBe(metresPerPixel(CENTRE.lat, 9.5));
    expect(adapter.metresPerPixel(0)).toBe(metresPerPixel(0, 9.5));
  });

  it("follows the host's size", async () => {
    let observed: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observed = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { adapter, sized, map } = await mounted();
    expect(map.options.trackResize).toBe(false);
    sized.resize(400, 200);
    observed?.([], {} as ResizeObserver);
    expect(adapter.project(CENTRE)).toEqual({ x: 200, y: 100 });
    adapter.destroy();
    expect(disconnect).toHaveBeenCalled();
  });
});

describe("LeafletMapAdapter events", () => {
  it("emits move, zoom and moveEnd with the normalised view", async () => {
    const { adapter } = await mounted();
    const seen: Array<[string, MapEvents["move"]]> = [];
    adapter.on("move", (view) => seen.push(["move", view]));
    adapter.on("zoom", (view) => seen.push(["zoom", view]));
    adapter.on("moveEnd", (view) => seen.push(["moveEnd", view]));
    adapter.setView({ zoom: 11.5 });
    expect(seen.map(([name]) => name)).toContain("move");
    expect(seen.map(([name]) => name)).toContain("zoom");
    expect(seen.at(-1)?.[0]).toBe("moveEnd");
    expect(seen.at(-1)?.[1]).toMatchObject({ zoom: 11.5, bearing: 0 });
  });

  it("never emits rotate", async () => {
    const { adapter } = await mounted();
    const rotate = vi.fn();
    adapter.on("rotate", rotate);
    adapter.rotateBy(90);
    adapter.setView({ zoom: 12 });
    expect(rotate).not.toHaveBeenCalled();
  });

  it("emits a click with the position and host pixel and no features", async () => {
    const { adapter, host } = await mounted();
    const clicks: MapEvents["click"][] = [];
    adapter.on("click", (event) => clicks.push(event));
    host.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 500, clientY: 200 }),
    );
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.point).toEqual({ x: 500, y: 200 });
    const expected = adapter.unproject({ x: 500, y: 200 });
    expect(clicks[0]?.latlng.lat).toBeCloseTo(expected.lat, 6);
    expect(clicks[0]?.latlng.lng).toBeCloseTo(expected.lng, 6);
    expect(clicks[0]).not.toHaveProperty("features");
  });

  it("emits load once per basemap, and loading around each tile load", async () => {
    const { adapter, host, map } = await mounted();
    const events: string[] = [];
    adapter.on("load", () => events.push("load"));
    adapter.on("loading", (state) => events.push(`loading:${state}`));
    loadPendingTiles(host);
    expect(events).toEqual(["loading:false", "load"]);
    tileLayerOf(map).fire("loading");
    tileLayerOf(map).fire("load");
    expect(events).toEqual([
      "loading:false",
      "load",
      "loading:true",
      "loading:false",
    ]);
    await adapter.setBasemap(rasterBasemap({ id: "other" }));
    loadPendingTiles(host);
    expect(events.filter((name) => name === "load")).toHaveLength(2);
  });

  it("reports loading when a tile layer starts loading", async () => {
    const host = createSizedHost();
    hosts.push(host);
    const adapter = createLeafletMapAdapter();
    live.push(adapter);
    const loading: boolean[] = [];
    adapter.on("loading", (state) => loading.push(state));
    await adapter.mount(host.element, options());
    expect(loading).toEqual([true]);
  });

  it("emits tileError when a tile fails", async () => {
    const { adapter, host } = await mounted();
    const errors = vi.fn();
    adapter.on("tileError", errors);
    host.querySelector("img.leaflet-tile")?.dispatchEvent(new Event("error"));
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe("LeafletMapAdapter basemap swap", () => {
  it("swaps the tiles without recreating the map and keeps the view", async () => {
    const { adapter, host, map } = await mounted({
      view: { center: CENTRE, zoom: 8.5, bearing: 0 },
    });
    await adapter.setBasemap(
      rasterBasemap({
        id: "other",
        source: {
          kind: "raster",
          tileUrl: "https://other.test/{z}/{x}/{y}.png",
          tileSize: 256,
        },
      }),
    );
    expect(latestMap()).toBe(map);
    expect(adapter.getView().zoom).toBe(8.5);
    const sources = [...host.querySelectorAll("img.leaflet-tile")].map((tile) =>
      tile.getAttribute("src"),
    );
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((src) => src?.startsWith("https://other.test/"))).toBe(
      true,
    );
  });

  it("applies the new limits and clamps the view once", async () => {
    const { adapter } = await mounted({
      view: { center: CENTRE, zoom: 4, bearing: 0 },
      basemap: rasterBasemap({ minZoom: 0, maxZoom: 5 }),
    });
    await adapter.setBasemap(rasterBasemap({ minZoom: 8, maxZoom: 19 }));
    expect(adapter.getMinZoom()).toBe(8);
    expect(adapter.getMaxZoom()).toBe(19);
    expect(adapter.getView().zoom).toBe(8);
    adapter.setView({ zoom: 19 });
    await adapter.setBasemap(rasterBasemap({ minZoom: 0, maxZoom: 5 }));
    expect(adapter.getView().zoom).toBe(5);
  });

  it("rejects a vector basemap and keeps the current tiles", async () => {
    const { adapter, map } = await mounted();
    const before = tileLayerOf(map);
    const result = adapter.setBasemap(vectorBasemap);
    await expect(result).rejects.toBeInstanceOf(MapEngineError);
    await expect(result).rejects.toMatchObject({ reason: "load-failed" });
    expect(tileLayerOf(map)).toBe(before);
  });

  it("rejects before mount", async () => {
    await expect(
      createLeafletMapAdapter().setBasemap(rasterBasemap()),
    ).rejects.toMatchObject({ reason: "load-failed" });
  });
});

describe("LeafletMapAdapter animation", () => {
  it("starts with every animation off under reduced motion", async () => {
    const { host, map } = await mounted({ reducedMotion: true });
    expect(map.options).toMatchObject({
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
    });
    expect(host.classList.contains("leaflet-fade-anim")).toBe(false);
  });

  it("changes the view instantly while animation is off, even when asked to animate", async () => {
    const { adapter } = await mounted({ reducedMotion: true });
    adapter.zoomIn({ animate: true });
    expect(adapter.getView().zoom).toBe(11);
  });

  it("animates zoom once animation is turned on at runtime, including tiles added while it was off", async () => {
    const { adapter, host, map } = await mounted({ reducedMotion: true });
    await adapter.setBasemap(rasterBasemap({ id: "other" }));
    adapter.setAnimationEnabled(true);
    expect(map.options).toMatchObject({
      zoomAnimation: true,
      fadeAnimation: true,
      inertia: true,
    });
    expect(host.classList.contains("leaflet-fade-anim")).toBe(true);
    expect(host.querySelector(".leaflet-tile-container")?.classList).toContain(
      "leaflet-zoom-animated",
    );
    adapter.zoomIn();
    // An animated zoom starts on the next frame, so the zoom has not moved yet.
    expect(adapter.getView().zoom).toBe(10);
    adapter.setAnimationEnabled(false);
    adapter.zoomIn();
    expect(adapter.getView().zoom).toBe(11);
  });

  it("does not animate a move the caller asks to be instant", async () => {
    const { adapter } = await mounted({ reducedMotion: false });
    adapter.zoomIn({ animate: false });
    expect(adapter.getView().zoom).toBe(11);
  });
});
