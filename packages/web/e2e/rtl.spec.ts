// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";
import { scriptSearch } from "./support/services";

/**
 * The layout, mirrored. These specs need the `direction: "rtl"` option, so they
 * run in the `rtl-*` projects only; the rest of the subset those projects run
 * proves the specs still pass mirrored, and these prove it is mirrored.
 */
test.describe("right to left", () => {
  test.skip(
    ({ direction }) => direction !== "rtl",
    "Runs in the right-to-left projects only.",
  );
  test.use({ reducedMotion: "reduce" });

  test("the page reads right to left", async ({ page, mapPage }) => {
    await mapPage.goto();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("never scrolls sideways", async ({ page, mapPage }) => {
    await mapPage.goto();
    await mapPage.openMapOptions();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the side panel opens at the right edge and the controls sit at the left", async ({
    page,
    mapPage,
  }) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width < 768, "The side panel is a desktop layout.");
    await mapPage.goto();
    await mapPage.openMapOptions();
    const panel = await mapPage.sheet.boundingBox();
    const zoomIn = await mapPage.zoomInButton.boundingBox();
    if (!panel || !zoomIn) {
      throw new Error("The panel or the zoom button has no box.");
    }
    expect(panel.x + panel.width).toBeGreaterThan(width - 24);
    expect(zoomIn.x).toBeLessThan(24);
  });

  test("Show on map keeps a polygon clear of the right-hand panel", async ({
    page,
    mapPage,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 768,
      "The side panel is a desktop layout.",
    );
    await mockLayerProviders(page);
    // 1. Open the country layer and Map options.
    await mapPage.goto("#layers=world-countries&map=2.00/0.00000/0.00000");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-world-countries");
    await expect(list).toBeVisible();
    // 2. Choose Australia from the list.
    await list.locator("summary").click();
    await list
      .getByTestId("layer-list-row")
      .filter({ hasText: "Australia" })
      .click();
    await expect(page.getByTestId("feature-card-heading")).toHaveText(
      "Australia",
    );
    // 3. Show the polygon and check its outline against the panel.
    await page.getByTestId("feature-card-show").click();
    const outline = page.getByTestId("selection-marker");
    await expect(outline).toBeVisible();
    await expect
      .poll(async () => {
        const polygon = await outline.boundingBox();
        const panel = await mapPage.sheet.boundingBox();
        return (
          polygon !== null &&
          panel !== null &&
          polygon.x + polygon.width <= panel.x
        );
      })
      .toBe(true);
  });

  test("the scale and zoom level stay clear of the open side panel", async ({
    page,
    mapPage,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 768,
      "The side panel is a desktop layout.",
    );
    await mapPage.goto();
    await mapPage.openMapOptions();
    const panel = await mapPage.sheet.boundingBox();
    await expect(mapPage.zoomLevel).toBeVisible();
    // The readout slides clear of the panel with a transition.
    await expect
      .poll(async () => {
        const zoom = await mapPage.zoomLevel.boundingBox();
        return (
          panel !== null && zoom !== null && zoom.x + zoom.width <= panel.x
        );
      })
      .toBe(true);
  });

  test("the active search suggestion's chevron points the other way", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.search("Cape");
    await expect(mapPage.searchOptions.first()).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const chevron = mapPage.searchOptions.first().locator("svg");
    await expect(chevron).toBeVisible();
    await expect
      .poll(() => chevron.evaluate((svg) => getComputedStyle(svg).transform))
      .toBe("matrix(-1, 0, 0, 1, 0, 0)");
  });
});
