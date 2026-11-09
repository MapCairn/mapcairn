import { expect, test } from "./fixtures";
import { seedStoredSettings } from "./support/services";

declare global {
  interface Window {
    /** The theme on `<html>` when the body first appeared, before any app script ran. */
    __kartaFirstPaintTheme?: string | null;
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
      window.__kartaFirstPaintTheme =
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

      expect(await page.evaluate(() => window.__kartaFirstPaintTheme)).toBe(
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
    expect(await page.evaluate(() => window.__kartaFirstPaintTheme)).toBe(
      "dark",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the automatic basemap follows the theme, a chosen one does not", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const styles: string[] = [];
    page.on("request", (request) => {
      const match = /\/styles\/(\w+)$/.exec(request.url());
      if (match?.[1]) {
        styles.push(match[1]);
      }
    });
    await mapPage.goto();
    expect(styles).toContain("positron");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => styles).toContain("dark");

    await mapPage.openMapOptions();
    await mapPage.chooseBasemap("Liberty");
    await expect.poll(() => styles).toContain("liberty");
    const before = styles.length;
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(500);
    expect(styles.length).toBe(before);
  });
});
