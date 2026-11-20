// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { FAKE_HYBRID_BASEMAP, FAKE_RASTER_BASEMAP } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { IMAGERY_ID } from "./basemapStyle";
import { BasemapTiles, isBasemapSource, ownSourceIds } from "./basemapTiles";
import { ENGINE_ID_PREFIX } from "./dataLayerPlan";

describe("isBasemapSource and ownSourceIds", () => {
  it("keeps a source of the basemap and drops one a data layer drew", () => {
    expect(isBasemapSource("planet")).toBe(true);
    expect(isBasemapSource(`${ENGINE_ID_PREFIX}layer`)).toBe(false);
    expect(isBasemapSource(undefined)).toBe(false);
    const map = {
      getStyle: () => ({
        sources: { planet: {}, [`${ENGINE_ID_PREFIX}layer`]: {} },
      }),
    } as unknown as MapLibreMap;
    expect(ownSourceIds(map)).toEqual(["planet"]);
  });
});

describe("BasemapTiles", () => {
  it("reports a basemap once, when tiles failed and none loaded", () => {
    const tiles = new BasemapTiles();
    tiles.startFor(FAKE_RASTER_BASEMAP);
    tiles.recordFailed("planet");
    expect(tiles.takeUnavailable()).toBe(FAKE_RASTER_BASEMAP);
    expect(tiles.takeUnavailable()).toBeUndefined();
  });

  it("does not report a basemap that drew a tile, or one with no failure", () => {
    const tiles = new BasemapTiles();
    tiles.startFor(FAKE_RASTER_BASEMAP);
    expect(tiles.takeUnavailable()).toBeUndefined();
    tiles.recordLoaded("planet");
    tiles.recordFailed("planet");
    expect(tiles.takeUnavailable()).toBeUndefined();
  });

  it("ignores data layer sources and blames no basemap before a style loads", () => {
    const tiles = new BasemapTiles();
    tiles.recordFailed("planet");
    tiles.startFor(FAKE_RASTER_BASEMAP);
    tiles.recordFailed(`${ENGINE_ID_PREFIX}layer`);
    expect(tiles.takeUnavailable()).toBeUndefined();
    tiles.recordFailed("planet");
    tiles.clear();
    expect(tiles.takeUnavailable()).toBeUndefined();
  });

  it("counts only the imagery for a hybrid basemap", () => {
    const tiles = new BasemapTiles();
    tiles.startFor(FAKE_HYBRID_BASEMAP);
    tiles.recordLoaded("planet");
    tiles.recordFailed(IMAGERY_ID);
    expect(tiles.takeUnavailable()).toBe(FAKE_HYBRID_BASEMAP);
  });
});
