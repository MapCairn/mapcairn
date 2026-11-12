// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import {
  DEFAULT_VECTOR_BASEMAP_BACKGROUND,
  DEFAULT_VECTOR_BASEMAP_ID,
} from "./support/basemaps";
import { seedStoredSettings } from "./support/services";

declare global {
  interface Window {
    /** The theme on `<html>` when the body first appeared, before any app script ran. */
    __mapcairnFirstPaintTheme?: string | null;
  }
}

/**
 * Records `data-theme` on `<html>` at the moment `<body>` is first parsed.
 * The inline bootstrap in `<head>` must have set it by then, or the first
 * paint would be in the wrong theme.
 */
function recordFirstPaintTheme() {
  const observer = new MutationObserver(() => {
    if (document.body) {
      window.__mapcairnFirstPaintTheme =
        document.documentElement.getAttribute("data-theme");
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true, subtree: true });
}

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`follows a ${colorScheme} system theme from the first paint`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(recordFirstPaintTheme);
      await mapPage.goto();

      expect(await page.evaluate(() => window.__mapcairnFirstPaintTheme)).toBe(
        colorScheme,
      );
      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-theme", colorScheme);
      expect(
        await html.evaluate((element) => getComputedStyle(element).colorScheme),
      ).toContain(colorScheme);
      const themeColour = await page
        .locator('meta[name="theme-color"]')
        .first()
        .getAttribute("content");
      expect(themeColour).toBeTruthy();
    });
  }

  test("changes with the system while the app is open", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await mapPage.goto();
    const html = page.locator("html");
    const background = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lightBackground = await background();

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(await background()).not.toBe(lightBackground);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("a stored dark choice paints dark first, even with a light system", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await seedStoredSettings(page, { theme: "dark" });
    await page.addInitScript(recordFirstPaintTheme);
    await mapPage.goto();
    expect(await page.evaluate(() => window.__mapcairnFirstPaintTheme)).toBe(
      "dark",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the default basemap is the same in both themes, and the theme never changes the basemap", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const styles: string[] = [];
    page.on("request", (request) => {
      const match = /\/styles\/(\w+)$/.exec(request.url());
      if (match?.[1]) {
        styles.push(match[1]);
      }
    });
    await mapPage.goto();
    expect(styles).toEqual([DEFAULT_VECTOR_BASEMAP_ID]);

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // Nothing should load, so there is no event to wait for; give a swap
    // time to start if one were going to.
    await page.waitForTimeout(500);
    expect(styles).toEqual([DEFAULT_VECTOR_BASEMAP_ID]);
  });

  test("a basemap saved as auto by an earlier version starts on the default, and stays saved as it was", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await seedStoredSettings(page, { basemapId: "auto" });
    const styles: string[] = [];
    page.on("request", (request) => {
      const match = /\/styles\/(\w+)$/.exec(request.url());
      if (match?.[1]) {
        styles.push(match[1]);
      }
    });
    await mapPage.goto();
    expect(styles).toEqual([DEFAULT_VECTOR_BASEMAP_ID]);
    // The address is written when the map settles after a move.
    await mapPage.focusMap();
    await page.keyboard.press("+");
    await expect
      .poll(() => mapPage.hashBasemap())
      .toBe(DEFAULT_VECTOR_BASEMAP_ID);
    expect(
      await page.evaluate(() => localStorage.getItem("mapcairn:basemapId")),
    ).toBe('"auto"');
  });
});

test.describe("map background before the app runs", () => {
  test.use({ javaScriptEnabled: false });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`is the default basemap's land colour in a ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      const placeholder = page.getByTestId("map-placeholder");
      await expect(placeholder).toBeVisible();
      expect(
        await placeholder.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      ).toBe(DEFAULT_VECTOR_BASEMAP_BACKGROUND);
    });
  }
});
