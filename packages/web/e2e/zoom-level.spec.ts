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
    await expect(mapPage.zoomLevel).toContainText("z 10");

    await mapPage.zoomInButton.click();
    await expect(mapPage.zoomLevel).toContainText("z 11");
  });

  test("keeps the drawn zoom out of a copy of the text, which carries Zoom 11 once", async ({
    page,
    mapPage,
    isMobile,
  }) => {
    test.skip(isMobile, "The readout carries the zoom on a fine pointer only.");
    await mapPage.goto("#map=11/-33.92/18.42");

    const drawn = mapPage.zoomLevel.locator('[aria-hidden="true"]');
    await expect(drawn).toHaveText("z 11");
    await expect(drawn).toHaveCSS("user-select", "none");
    await expect(mapPage.zoomLevel).toContainText("Zoom 11");

    await page.mouse.move(600, 400);
    await page.mouse.move(700, 450, { steps: 5 });
    await expect(page.getByTestId("map-readout")).toContainText(
      /-?\d+\.\d{5}, -?\d+\.\d{5}/,
    );
    const copied = await page.evaluate(() => {
      const text = document.querySelector('[data-chrome="cursor-coordinates"]');
      const range = document.createRange();
      range.selectNodeContents(text as Element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() ?? "";
    });
    expect(copied).toMatch(/^-?\d+\.\d{5}, -?\d+\.\d{5}, Zoom 11$/);
  });

  test("is left off a narrow window, which still shows the coordinates", async ({
    page,
    mapPage,
    isMobile,
  }) => {
    test.skip(isMobile, "This case is a narrow desktop window.");
    await page.setViewportSize({ width: 390, height: 844 });
    await mapPage.goto("#map=10/-33.92/18.42");
    await page.mouse.move(200, 400);

    await expect(page.getByTestId("map-readout")).toContainText(
      /-?\d+\.\d{5}, -?\d+\.\d{5}/,
    );
    await expect(mapPage.zoomLevel).toHaveCount(0);
  });

  test("is left off a touch screen", async ({ mapPage, isMobile }) => {
    test.skip(!isMobile, "A fine pointer shows the zoom.");
    await mapPage.goto("#map=10/-33.92/18.42");

    await expect(mapPage.zoomLevel).toHaveCount(0);
  });
});
