// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { FakeMapLibreMap } from "./maplibreTestEngine";
import {
  addDataLayerImages,
  coversBounds,
  dataLayerImages,
  FIT_TOLERANCE_DEGREES,
} from "./renderMap";

const PIXELS = { width: 1, height: 1, data: new Uint8Array(4) };

/** A fake engine map with a style loaded, as the adapter and the helpers see one. */
function loadedMap(): FakeMapLibreMap {
  const map = new FakeMapLibreMap({
    container: document.createElement("div"),
    style: "https://tiles.example/style",
    center: [0, 0],
    zoom: 1,
    bearing: 0,
  });
  map.fire("style.load");
  return map;
}

const asMap = (map: FakeMapLibreMap) => map as unknown as MapLibreMap;

/** A map's bounds as MapLibre's `getBounds()` gives them. */
const shown = (west: number, south: number, east: number, north: number) => ({
  getWest: () => west,
  getSouth: () => south,
  getEast: () => east,
  getNorth: () => north,
});

describe("coversBounds", () => {
  const BOX = { south: -34, west: 18, north: -33, east: 19 };

  it("accepts a view that holds the box, however much more it shows", () => {
    expect(coversBounds(shown(18, -34, 19, -33), BOX)).toBe(true);
    expect(coversBounds(shown(10, -40, 30, -20), BOX)).toBe(true);
  });

  it("accepts a view short of the box by less than the tolerance, which float error leaves", () => {
    const hair = FIT_TOLERANCE_DEGREES / 2;
    expect(coversBounds(shown(18 + hair, -34, 19 - hair, -33), BOX)).toBe(true);
  });

  it("refuses a view that crops the box on any side", () => {
    const more = FIT_TOLERANCE_DEGREES * 2;
    expect(coversBounds(shown(18 + more, -34, 19, -33), BOX)).toBe(false);
    expect(coversBounds(shown(18, -34 + more, 19, -33), BOX)).toBe(false);
    expect(coversBounds(shown(18, -34, 19 - more, -33), BOX)).toBe(false);
    expect(coversBounds(shown(18, -34, 19, -33 - more), BOX)).toBe(false);
  });
});

describe("render map images", () => {
  it("reads the marker and pattern images the adapter added, and none of a basemap's own", () => {
    const map = loadedMap();
    map.addImage("mapcairn-marker:circle:#ff0000:6", PIXELS, {
      pixelRatio: 2,
    });
    map.addImage("mapcairn-pattern:stripes", PIXELS, {
      pixelRatio: 2,
      sdf: true,
    });
    map.addImage("airport-icon", PIXELS);
    const images = dataLayerImages(asMap(map));
    expect(images.map(({ name }) => name)).toEqual([
      "mapcairn-marker:circle:#ff0000:6",
      "mapcairn-pattern:stripes",
    ]);
    expect(images[1]?.image).toMatchObject({ pixelRatio: 2, sdf: true });
  });

  it("adds them with their pixel ratio and SDF flag, and leaves an image the map already has", () => {
    const from = loadedMap();
    from.addImage("mapcairn-pattern:dots", PIXELS, {
      pixelRatio: 2,
      sdf: true,
    });
    from.addImage("mapcairn-marker:circle:#00ff00:4", PIXELS, {
      pixelRatio: 3,
    });
    const to = loadedMap();
    const existing = { image: PIXELS, options: { pixelRatio: 9 } };
    to.images.set("mapcairn-marker:circle:#00ff00:4", existing);
    addDataLayerImages(asMap(to), dataLayerImages(asMap(from)));
    expect(to.images.get("mapcairn-pattern:dots")).toEqual({
      image: PIXELS,
      options: { pixelRatio: 2, sdf: true },
    });
    expect(to.images.get("mapcairn-marker:circle:#00ff00:4")).toBe(existing);
  });
});
