// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";

/*
 * `/map` as a browser that runs no scripts shows it: the server's HTML and
 * nothing else. The map cannot start, so the page says so, offers the pages
 * that do not need it, and shows no control that does nothing.
 */
test.describe("the map page without scripts", () => {
  test.use({ javaScriptEnabled: false });

  test("says the map needs JavaScript and offers working links", async ({
    page,
  }) => {
    await page.goto("/map");
    const notice = page.getByTestId("no-script-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      "The map needs JavaScript. You can still read about MapCairn, its source code and its privacy policy.",
    );
    const product = notice.getByRole("link", {
      name: "About MapCairn, the SDK behind this map",
    });
    await expect(product).toHaveAttribute("href", "/");
    await expect(
      notice.getByRole("link", {
        name: "View the source code and licence on GitHub",
      }),
    ).toHaveAttribute("href", "https://github.com/MapCairn/mapcairn");
    await expect(
      notice.getByRole("link", { name: "Read the privacy policy" }),
    ).toHaveAttribute("href", "/privacy");

    await product.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("draws no control that cannot work and no skip link to a map that will not start", async ({
    page,
  }) => {
    await page.goto("/map");
    await expect(page.getByTestId("map-placeholder")).toBeVisible();
    await expect(page.getByTestId("chrome-skeleton")).toBeHidden();
    await expect(page.getByRole("link", { name: "Skip to map" })).toBeHidden();
    await expect(
      page.getByRole("main").getByRole("button"),
      "no button in the placeholder",
    ).toHaveCount(0);
  });

  test("reads as a short page: the banner names the page, the main landmark holds the notice and its links", async ({
    page,
  }) => {
    await page.goto("/map");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("heading", { level: 1 })).toHaveText(
      "MapCairn",
    );
    await expect(banner).toContainText("The MapCairn playground is");
    await expect(banner.getByRole("link")).toHaveCount(0);
    const main = page.getByRole("main");
    await expect(main.getByTestId("no-script-notice")).toBeVisible();
    await expect(main.getByRole("link")).toHaveCount(3);
  });

  test("keeps the notice inside a phone's width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/map");
    const box = await page.getByTestId("no-script-notice").boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });
});
