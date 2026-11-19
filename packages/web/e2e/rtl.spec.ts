// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import {
  controlsOverFeature,
  FIT_START,
  FIT_VIEWPORTS,
  showCountryOnMap,
} from "./support/fit";
import { mockLayerProviders } from "./support/layers";
import { scriptSearch } from "./support/services";

/** Keyboard pan steps that take the fitted polygon back under the side panel. */
const PAN_STEPS_UNDER_PANEL = 4;

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
    const outline = page.getByTestId("selection-marker");
    await expect(outline).toBeVisible();
    const clearOfPanel = async () => {
      const polygon = await outline.boundingBox();
      const panel = await mapPage.sheet.boundingBox();
      return (
        polygon !== null &&
        panel !== null &&
        polygon.x + polygon.width <= panel.x
      );
    };
    await expect.poll(clearOfPanel).toBe(true);
    // 3. Pan the polygon back under the panel. The fit keeps it clear of the
    // search pill, the end stack and the map key as well, so it sits smaller
    // and further from the panel than one keyboard pan step.
    await mapPage.focusMap();
    for (let step = 0; step < PAN_STEPS_UNDER_PANEL; step += 1) {
      await page.keyboard.press("ArrowLeft");
    }
    // Sample the outline itself, not just its bounding box.
    await expect
      .poll(async () => {
        const panel = await mapPage.sheet.boundingBox();
        if (!panel) {
          return false;
        }
        return outline
          .locator("path")
          .first()
          .evaluate((path, bounds) => {
            if (!(path instanceof SVGPathElement)) {
              return false;
            }
            const matrix = path.getScreenCTM();
            if (!matrix) {
              return false;
            }
            const length = path.getTotalLength();
            for (let distance = 0; distance <= length; distance += 1) {
              const point = path
                .getPointAtLength(distance)
                .matrixTransform(matrix);
              if (
                point.x > bounds.x &&
                point.x < bounds.x + bounds.width &&
                point.y > bounds.y &&
                point.y < bounds.y + bounds.height
              ) {
                return true;
              }
            }
            return false;
          }, panel);
      })
      .toBe(true);
    // 4. Show the polygon and check its outline against the panel.
    await page.getByTestId("feature-card-show").click();
    await expect.poll(clearOfPanel).toBe(true);
  });

  for (const viewport of FIT_VIEWPORTS) {
    test(`Show on map keeps a polygon clear of the mirrored end stack and map key at ${viewport.width} by ${viewport.height}`, async ({
      page,
      mapPage,
    }) => {
      await page.setViewportSize(viewport);
      await mockLayerProviders(page);
      await mapPage.goto(FIT_START);
      await showCountryOnMap(page, mapPage, "Australia");
      await expect(page.getByTestId("selection-marker")).toBeVisible();
      await expect.poll(() => controlsOverFeature(page)).toEqual([]);
    });
  }

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
