// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";

test.describe("zoom level readout", () => {
  test("shows the zoom beside the scale on a desktop and follows zoom changes", async ({
    mapPage,
    isMobile,
  }) => {
    test.skip(isMobile, "The readout carries the zoom on a fine pointer only.");
    await mapPage.goto("#map=10/-33.92/18.42");

    await expect(mapPage.zoomLevel).toBeVisible();
    await expect(mapPage.zoomLevel).toHaveText(/z\s*Zoom\s*10/);

    await mapPage.zoomInButton.click();
    await expect(mapPage.zoomLevel).toHaveText(/z\s*Zoom\s*11/);
  });

  test("is left off a narrow window, where the sheet layout has no room for it", async ({
    page,
    mapPage,
    isMobile,
  }) => {
    test.skip(isMobile, "This case is a narrow desktop window.");
    await page.setViewportSize({ width: 390, height: 844 });
    await mapPage.goto("#map=10/-33.92/18.42");

    await expect(mapPage.scaleBar).toBeVisible();
    await expect(mapPage.zoomLevel).toHaveCount(0);
  });

  test("is left off a touch screen", async ({ mapPage, isMobile }) => {
    test.skip(!isMobile, "A fine pointer shows the zoom.");
    await mapPage.goto("#map=10/-33.92/18.42");

    await expect(mapPage.zoomLevel).toHaveCount(0);
  });
});
