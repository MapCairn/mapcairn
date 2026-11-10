import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  DEFAULT_VECTOR_BASEMAP_NAME,
  RASTER_BASEMAP_NAME,
} from "./support/basemaps";
import {
  MINIMAL_VECTOR_STYLE,
  TRANSPARENT_PNG,
  VECTOR_STYLE_PATTERN,
} from "./support/network";

/*
 * Save data mode: a stored choice or the browser's signal turns it on, and
 * while it is on the picker requests no thumbnail and the default basemap
 * leaves out its shaded-relief raster layer. The real Liberty style is
 * replaced by a small one with a layer of the same id, "natural_earth", drawn
 * from a relief source, so the test can count relief tile requests.
 */

const RELIEF_TILES = /\/natural_earth\/ne2sr\//;
const THUMBNAILS = /\/basemaps\/[\w-]+\.jpg/;

/** Liberty's own relief layer id and source, over the suite's minimal style. */
const STYLE_WITH_RELIEF = {
  ...MINIMAL_VECTOR_STYLE,
  sources: {
    ...MINIMAL_VECTOR_STYLE.sources,
    ne2_shaded: {
      type: "raster",
      tiles: [
        "https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 7,
    },
  },
  layers: [
    { id: "natural_earth", type: "raster", source: "ne2_shaded" },
    ...MINIMAL_VECTOR_STYLE.layers,
  ],
};

/** What {@link serveRelief} has seen so far. */
interface ReliefRequests {
  /** Every relief tile requested. */
  readonly relief: string[];
  /** Every style document fetched: one for each time the map draws the basemap. */
  readonly styles: string[];
}

/** Serves the relief style and its tiles, and returns the requests seen so far. */
async function serveRelief(page: Page): Promise<ReliefRequests> {
  const requests: ReliefRequests = { relief: [], styles: [] };
  await page.route(VECTOR_STYLE_PATTERN, (route) => {
    requests.styles.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STYLE_WITH_RELIEF),
    });
  });
  await page.route(RELIEF_TILES, (route) => {
    requests.relief.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_PNG,
    });
  });
  return requests;
}

/** Records the thumbnail requests. They are served by the app itself, not stubbed. */
function watchThumbnails(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (THUMBNAILS.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

/** Stores an explicit Save data choice before the page loads. */
function storeChoice(page: Page, value: boolean) {
  return page.addInitScript((stored) => {
    localStorage.setItem("karta:saveData", JSON.stringify(stored));
  }, value);
}

/** Gives the page a `navigator.connection` like Chrome's, before the page loads. */
function reportConnection(
  page: Page,
  connection: { saveData?: boolean; effectiveType?: string },
) {
  return page.addInitScript((value) => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { addEventListener() {}, removeEventListener() {}, ...value },
    });
  }, connection);
}

test.describe("save data", () => {
  test.use({ reducedMotion: "reduce" });

  test("is off by default: the picker shows previews and the relief is drawn", async ({
    page,
    mapPage,
  }) => {
    const { relief } = await serveRelief(page);
    const thumbnails = watchThumbnails(page);
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(
      page.getByRole("switch", { name: "Save data" }),
    ).not.toBeChecked();
    await mapPage.switchToMapOptions();
    await expect(mapPage.basemapPicker.locator("img")).toHaveCount(3);
    await expect.poll(() => thumbnails.length).toBeGreaterThan(0);
    expect(relief.length).toBeGreaterThan(0);
  });

  test("a stored choice leaves out the relief, the previews and the Streets download until chosen", async ({
    page,
    mapPage,
  }) => {
    await storeChoice(page, true);
    const { relief } = await serveRelief(page);
    const thumbnails = watchThumbnails(page);
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(page.getByRole("switch", { name: "Save data" })).toBeChecked();
    await mapPage.switchToMapOptions();
    await expect(mapPage.basemapPicker.locator("img")).toHaveCount(0);
    for (const name of [DEFAULT_VECTOR_BASEMAP_NAME, RASTER_BASEMAP_NAME]) {
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: new RegExp(`^${name}`),
        }),
      ).toBeAttached();
    }
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: `${RASTER_BASEMAP_NAME} Uses more data`,
      }),
    ).toBeAttached();
    expect(relief).toEqual([]);
    expect(thumbnails).toEqual([]);
  });

  test("the switch turns it on and off on the same map, and remembers the choice", async ({
    page,
    mapPage,
  }) => {
    const { relief, styles } = await serveRelief(page);
    const thumbnails = watchThumbnails(page);
    await mapPage.goto();
    await mapPage.openSettings();
    const saveData = page.getByRole("switch", { name: "Save data" });
    await expect(saveData).toHaveAccessibleDescription(
      /instead of previews.*heavy map layers/,
    );
    expect(relief.length).toBeGreaterThan(0);

    relief.length = 0;
    await saveData.click();
    await expect(saveData).toBeChecked();
    expect(
      await page.evaluate(() => localStorage.getItem("karta:saveData")),
    ).toBe("true");
    await mapPage.switchToMapOptions();
    await expect(mapPage.basemapPicker.locator("img")).toHaveCount(0);
    // The map draws the basemap again: wait for its style to be fetched, then
    // for it to finish loading, before saying no relief tile was asked for.
    await expect.poll(() => styles.length).toBe(2);
    await mapPage.waitForMap();
    expect(relief, "relief tiles after the redraw").toEqual([]);

    await mapPage.switchToSettings();
    await saveData.click();
    await expect(saveData).not.toBeChecked();
    expect(
      await page.evaluate(() => localStorage.getItem("karta:saveData")),
    ).toBe("false");
    await mapPage.switchToMapOptions();
    await expect(mapPage.basemapPicker.locator("img")).toHaveCount(3);
    await expect.poll(() => relief.length).toBeGreaterThan(0);
    expect(thumbnails.length).toBeGreaterThan(0);
  });

  test("starts on when the browser asks to save data, and an explicit choice still wins", async ({
    page,
    mapPage,
  }) => {
    await reportConnection(page, { saveData: true, effectiveType: "4g" });
    const { relief } = await serveRelief(page);
    await mapPage.goto();
    await mapPage.openSettings();
    const saveData = page.getByRole("switch", { name: "Save data" });
    await expect(saveData).toBeChecked();
    expect(relief).toEqual([]);

    await saveData.click();
    await expect(saveData).not.toBeChecked();
    await mapPage.switchToMapOptions();
    await expect(mapPage.basemapPicker.locator("img")).toHaveCount(3);
    await expect.poll(() => relief.length).toBeGreaterThan(0);
  });

  test("starts on for a 2g connection", async ({ page, mapPage }) => {
    await reportConnection(page, { effectiveType: "2g" });
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(page.getByRole("switch", { name: "Save data" })).toBeChecked();
  });

  test("stays off on 3g, and a stored choice beats a slow connection", async ({
    page,
    mapPage,
  }) => {
    await reportConnection(page, { effectiveType: "3g" });
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(
      page.getByRole("switch", { name: "Save data" }),
    ).not.toBeChecked();

    await storeChoice(page, false);
    await reportConnection(page, { effectiveType: "slow-2g" });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openSettings();
    await expect(
      page.getByRole("switch", { name: "Save data" }),
    ).not.toBeChecked();
  });
});
