// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { AF_CATALOGUE } from "../src/i18n/af";
import { expect, test } from "./fixtures";
import { MapPage } from "./pages/MapPage";

/*
 * The reference site in Afrikaans. The layout collision and accessibility
 * matrices run in Afrikaans too, in the `af-*` projects (playwright.config.ts);
 * this spec proves the language itself: the page says which language it is
 * in, the chrome speaks it, and the choice in Settings sticks.
 */
test.use({ reducedMotion: "reduce" });

test.describe("with Afrikaans chosen", () => {
  test.use({ language: "af" });

  test("the page is marked Afrikaans before the app starts", async ({
    page,
  }) => {
    // With the app's own scripts blocked, only the inline pre-paint script
    // can set the language.
    await page.route("**/*", (route) =>
      route.request().resourceType() === "script"
        ? route.abort()
        : route.fallback(),
    );
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "af");
  });

  test("the chrome speaks Afrikaans", async ({ page, mapPage }) => {
    await mapPage.goto();
    await expect(page.locator("html")).toHaveAttribute("lang", "af");
    await expect(
      page.getByRole("combobox", { name: "Soek plekke" }),
    ).toHaveAttribute("placeholder", "Soek plekke");
    await expect(
      page.getByRole("button", { name: "Instellings", exact: true }),
    ).toBeVisible();
    await mapPage.openMapOptions();
    await expect(mapPage.sheetHeading).toHaveText("Kaartopsies");
    const picker = page.getByRole("radiogroup", { name: "Basiskaart" });
    await expect(picker.getByRole("radio", { name: "Strate" })).toBeVisible();
    await expect(picker.getByRole("radio", { name: "Donker" })).toBeVisible();
    await expect(
      mapPage.layersSection.getByRole("heading", { name: "Lae" }),
    ).toBeVisible();
  });

  test("marks the host's English notes as English", async ({ mapPage }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(
      mapPage.page
        .getByTestId("settings-privacy-note")
        .locator('[lang="en-GB"]'),
    ).toContainText("MapCairn has no accounts");
  });
});

test("the Language setting switches to Afrikaans and back, and is remembered", async ({
  page,
}) => {
  const english = new MapPage(page, EN_GB_CATALOGUE);
  await english.goto();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await english.openSettings();
  const languages = page.getByRole("radiogroup", { name: "Language" });
  await expect(languages.getByRole("radio")).toHaveText([
    "Automatic",
    "English",
    "Afrikaans",
  ]);
  await expect(
    languages.getByRole("radio", { name: "Afrikaans" }),
  ).toHaveAttribute("lang", "af");

  await languages.getByRole("radio", { name: "Afrikaans" }).click();
  const afrikaans = new MapPage(page, AF_CATALOGUE);
  await expect(page.locator("html")).toHaveAttribute("lang", "af");
  await expect(afrikaans.settingsHeading).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Taal" })).toBeVisible();

  await page.reload();
  await afrikaans.waitForMap();
  await expect(page.locator("html")).toHaveAttribute("lang", "af");
  await expect(afrikaans.searchInput).toBeVisible();

  await afrikaans.openSettings();
  await page
    .getByRole("radiogroup", { name: "Taal" })
    .getByRole("radio", { name: "English" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(english.settingsHeading).toBeVisible();
});
