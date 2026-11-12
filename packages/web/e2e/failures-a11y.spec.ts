// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import {
  OTHER_VECTOR_BASEMAP_NAME,
  RASTER_BASEMAP_ID,
  RASTER_BASEMAP_NAME,
} from "./support/basemaps";
import {
  OTHER_VECTOR_STYLE_PATTERN,
  STREETS_TILE_PATTERN,
} from "./support/network";
import { waitForStableLayout } from "./support/states";

/*
 * Accessibility of the states a failure leaves on screen: a basemap whose
 * provider is down (the banner, its tile's disabled radio and Try again), a
 * basemap whose style cannot load, and a map image that could not be saved.
 * Each runs axe in light and dark. Tagged @a11y, so `npm run a11y` runs them.
 */

test.use({ reducedMotion: "reduce" });

for (const colorScheme of ["light", "dark"] as const) {
  test(`a basemap that is not available, its marked tile and Try again pass axe in ${colorScheme} @a11y`, async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.route(STREETS_TILE_PATTERN, (route) => route.abort("failed"));
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.pressBasemapTile(RASTER_BASEMAP_NAME);
    await mapPage.sheetClose.click();
    const banner = page.getByTestId("basemap-error");
    await expect(banner).toContainText("Streets is not available right now.", {
      timeout: 20_000,
    });

    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: /^Streets/ }),
    ).toBeDisabled();
    await expect(
      page.getByTestId(`basemap-unavailable-note-${RASTER_BASEMAP_ID}`),
    ).toHaveText("Not available right now");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(banner).toBeVisible();
    await waitForStableLayout(page);
    // axe leaves out colour contrast for the label of a disabled control, so
    // this scan does not check the note's contrast; DESIGN.md's WCAG 2.2 AA
    // rule still applies to it.
    expect(await axeViolations(page)).toEqual([]);
  });

  test(`a basemap that could not be loaded passes axe in ${colorScheme} @a11y`, async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.route(OTHER_VECTOR_STYLE_PATTERN, (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(OTHER_VECTOR_BASEMAP_NAME);
    await mapPage.sheetClose.click();
    const banner = page.getByTestId("basemap-error");
    await expect(banner).toContainText("That basemap could not be loaded.", {
      timeout: 20_000,
    });
    await expect(
      banner.getByRole("button", { name: "Use previous basemap" }),
    ).toBeVisible();
    await waitForStableLayout(page);
    expect(await axeViolations(page)).toEqual([]);
  });

  test(`a map image that could not be saved passes axe in ${colorScheme} @a11y`, async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme });
    // A canvas the browser cannot encode hands back no image.
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
        callback(null);
      };
    });
    await mapPage.goto();
    await mapPage.openMapOptions();
    await page.getByRole("button", { name: "Save image" }).click();
    await expect(page.getByTestId("export-error")).toHaveText(
      "The map image could not be saved. Try again.",
    );
    await waitForStableLayout(page);
    expect(await axeViolations(page)).toEqual([]);
  });
}
