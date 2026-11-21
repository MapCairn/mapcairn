// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  DEFAULT_VECTOR_BASEMAP_BACKGROUND,
  DEFAULT_VECTOR_BASEMAP_ID,
  DEFAULT_VECTOR_BASEMAP_NAME,
  FIORD_BASEMAP_BACKGROUND,
  FIORD_BASEMAP_ID,
  FIORD_BASEMAP_NAME,
  OTHER_VECTOR_BASEMAP_ID,
  OTHER_VECTOR_BASEMAP_NAME,
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

  /** Records the id of every OpenFreeMap style the page requests, in order. */
  function recordStyles(page: Page): string[] {
    const styles: string[] = [];
    page.on("request", (request) => {
      const match = /\/styles\/(\w+)$/.exec(request.url());
      if (match?.[1]) {
        styles.push(match[1]);
      }
    });
    return styles;
  }

  for (const [colorScheme, id, name] of [
    ["light", DEFAULT_VECTOR_BASEMAP_ID, DEFAULT_VECTOR_BASEMAP_NAME],
    ["dark", FIORD_BASEMAP_ID, FIORD_BASEMAP_NAME],
  ] as const) {
    test(`a first visit in a ${colorScheme} theme opens ${name}, with its tile checked and nothing saved`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      const styles = recordStyles(page);
      await mapPage.goto();
      expect(styles).toEqual([id]);
      await mapPage.openMapOptions();
      await expect(
        mapPage.basemapPicker.getByRole("radio", { name }),
      ).toBeChecked();
      expect(
        await page.evaluate(() => localStorage.getItem("mapcairn:basemapId")),
      ).toBeNull();
    });
  }

  test("the default follows the theme live until a basemap is chosen, and the link records the one showing", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const styles = recordStyles(page);
    await mapPage.goto();
    await mapPage.focusMap();
    await page.keyboard.press("+");
    await expect.poll(() => mapPage.hashBasemap()).toBe(FIORD_BASEMAP_ID);

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(() => styles)
      .toEqual([FIORD_BASEMAP_ID, DEFAULT_VECTOR_BASEMAP_ID]);
    await expect
      .poll(() => mapPage.hashBasemap())
      .toBe(DEFAULT_VECTOR_BASEMAP_ID);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() => styles)
      .toEqual([FIORD_BASEMAP_ID, DEFAULT_VECTOR_BASEMAP_ID, FIORD_BASEMAP_ID]);
    expect(
      await page.evaluate(() => localStorage.getItem("mapcairn:basemapId")),
    ).toBeNull();
  });

  test("a basemap the visitor chose stays through a theme change and a reload", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const styles = recordStyles(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(OTHER_VECTOR_BASEMAP_NAME);
    await expect
      .poll(() => mapPage.hashBasemap())
      .toBe(OTHER_VECTOR_BASEMAP_ID);
    const requested = styles.length;

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // Nothing should load, so there is no event to wait for; give a swap
    // time to start if one were going to.
    await page.waitForTimeout(500);
    expect(styles).toHaveLength(requested);
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: OTHER_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();

    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: OTHER_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("choosing the default's own basemap is a choice too, and stays in the other theme", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.pressBasemapTile(DEFAULT_VECTOR_BASEMAP_NAME);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("mapcairn:basemapId")),
      )
      .toBe('"bright"');
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: DEFAULT_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("a basemap saved as auto by an earlier version is no choice: the theme's default shows, and the saved value stays as it was", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await seedStoredSettings(page, { basemapId: "auto" });
    const styles = recordStyles(page);
    await mapPage.goto();
    expect(styles).toEqual([FIORD_BASEMAP_ID]);
    // The address is written when the map settles after a move.
    await mapPage.focusMap();
    await page.keyboard.press("+");
    await expect.poll(() => mapPage.hashBasemap()).toBe(FIORD_BASEMAP_ID);
    expect(
      await page.evaluate(() => localStorage.getItem("mapcairn:basemapId")),
    ).toBe('"auto"');
  });
});

test.describe("map background before the app runs", () => {
  test.use({ javaScriptEnabled: false });

  const landColour = {
    light: DEFAULT_VECTOR_BASEMAP_BACKGROUND,
    dark: FIORD_BASEMAP_BACKGROUND,
  } as const;
  for (const colorScheme of ["light", "dark"] as const) {
    test(`is the land colour of the theme's default basemap in a ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/map");
      const placeholder = page.getByTestId("map-placeholder");
      await expect(placeholder).toBeVisible();
      expect(
        await placeholder.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      ).toBe(landColour[colorScheme]);
    });
  }
});
