// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { RASTER_BASEMAP_ID } from "./support/basemaps";
import { mockLayerProviders } from "./support/layers";
import { RASTER_TILE_PATTERN, TRANSPARENT_PNG } from "./support/network";

/**
 * The map region is `aria-busy` while the style and the basemap's own tiles
 * load. A data layer's tiles do not count: the engine goes idle only when
 * every source has its tiles, so a layer's tile that never answered would
 * otherwise tell assistive technology the region is busy for good.
 */
test.describe("map region busy state", () => {
  test.use({ reducedMotion: "reduce" });

  test("is not busy for the tiles of a layer whose server never answers", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page, { holdTiles: true });
    await mapPage.goto("#layers=rainfall");
    await expect.poll(() => requests.urls.length).toBeGreaterThan(0);
    await expect(mapPage.host).toHaveAttribute("aria-busy", "false");
    await expect(page.getByTestId("map-loading")).toHaveCount(0);
  });

  test("stays busy until the basemap's tiles are in", async ({
    page,
    mapPage,
  }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asked = 0;
    await page.route(RASTER_TILE_PATTERN, async (route) => {
      asked += 1;
      await held;
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: TRANSPARENT_PNG,
      });
    });
    await page.goto(`/#basemap=${RASTER_BASEMAP_ID}`);
    // Busy is true before the engine exists, so only a tile that the engine
    // has asked for and not been answered proves the state follows the tiles.
    await expect.poll(() => asked).toBeGreaterThan(0);
    await expect(mapPage.host).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("map-loading")).toBeVisible();
    release();
    await mapPage.waitForMap();
    await expect(page.getByTestId("map-loading")).toHaveCount(0);
  });
});
