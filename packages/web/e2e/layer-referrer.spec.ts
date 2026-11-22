// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { RASTER_BASEMAP_ID } from "./support/basemaps";
import { mockLayerProviders } from "./support/layers";
import { RASTER_TILE_PATTERN } from "./support/network";

const LAYER_TILE_PATTERN = /gibs\.earthdata\.nasa\.gov\/wmts\//;

/** The Referer header a request was sent with, or undefined when it had none. */
async function refererOf(request: Request): Promise<string | undefined> {
  return (await request.allHeaders()).referer;
}

test.describe("data layer tile requests", () => {
  test.use({ reducedMotion: "reduce" });

  test("a layer's tiles carry no Referer, and the basemap's tiles keep the site's origin", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    const layerTile = page.waitForRequest(LAYER_TILE_PATTERN);
    const basemapTile = page.waitForRequest(RASTER_TILE_PATTERN);
    await mapPage.goto(`#basemap=${RASTER_BASEMAP_ID}&layers=imagery`);

    expect(await refererOf(await layerTile)).toBeUndefined();
    const origin = new URL(page.url()).origin;
    expect(await refererOf(await basemapTile)).toBe(`${origin}/`);
  });
});
