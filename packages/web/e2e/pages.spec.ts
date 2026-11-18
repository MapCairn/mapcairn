// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";

test.describe("other pages", () => {
  test("an unknown address shows Page not found with a way back to the map", async ({
    page,
  }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);

    const errorPage = page.getByTestId("error-page");
    await expect(errorPage).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await page.getByRole("link", { name: "Go to the map" }).click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByTestId("map-host")).toBeVisible();
  });

  test("the privacy page has one heading, plain landmarks and no map", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/privacy/i);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByTestId("privacy-page")).toContainText(/cookies/i);
    await expect(page.getByTestId("map-host")).toHaveCount(0);
  });

  test("the privacy page and its tab title are in English by default", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle("Privacy policy | MapCairn");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy policy" }),
    ).toBeVisible();
    await expect(page.getByTestId("privacy-page")).toContainText(
      "The site sets no cookies.",
    );
  });
});

test.describe("the privacy page in Afrikaans", () => {
  test.use({ language: "af" });

  test("shows its text, links and tab title in Afrikaans", async ({ page }) => {
    await page.goto("/privacy");
    const privacy = page.getByTestId("privacy-page");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privaatheidsbeleid" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Privaatheidsbeleid | MapCairn");
    await expect(page.locator("html")).toHaveAttribute("lang", "af");
    await expect(privacy).toContainText("Die webwerf stel geen koekies nie.");
    await expect(privacy).not.toContainText("The site sets no cookies.");
    await expect(
      page.getByRole("link", { name: /Cloudflare se eie privaatheidsbeleid/ }),
    ).toHaveAttribute("href", "https://www.cloudflare.com/privacypolicy/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
  });

  test("the tab title of the map page is in Afrikaans too", async ({
    page,
  }) => {
    await page.goto("/map");
    await expect(page).toHaveTitle("MapCairn | Interaktiewe kaart");
  });

  test("leads from the Settings link to the page in Afrikaans, and back", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    await page
      .getByRole("link", { name: "Lees die privaatheidsbeleid" })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privaatheidsbeleid" }),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Terug na die produkbladsy" }),
    ).toHaveAttribute("href", "/");
    await page.getByRole("link", { name: "Terug na die kaart" }).click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page).toHaveTitle("MapCairn | Interaktiewe kaart");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`passes axe in ${colorScheme} @a11y`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/privacy");
      await expect(
        page.getByRole("heading", { level: 1, name: "Privaatheidsbeleid" }),
      ).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
    });
  }
});
