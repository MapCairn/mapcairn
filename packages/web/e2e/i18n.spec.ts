// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import {
  buildThemeBootstrapScript,
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
} from "@mapcairn/core";
import type { Page } from "@playwright/test";
import { AF_CATALOGUE } from "../src/i18n/af";
import { expect, test } from "./fixtures";
import { MapPage } from "./pages/MapPage";
import { axeViolations } from "./support/a11y";
import { storedLanguage, storeLanguageBeforeLoad } from "./support/language";
import { waitForStableLayout } from "./support/states";

/*
 * The reference site in Afrikaans. The layout collision and accessibility
 * matrices run in Afrikaans too, in the `af-*` projects (playwright.config.ts);
 * this spec proves the language itself: the page says which language it is
 * in, the chrome speaks it, and the choice in Settings sticks.
 */
test.use({ reducedMotion: "reduce" });

test("the English product page stays English before app scripts run", async ({
  page,
}) => {
  await page.addInitScript(storeLanguageBeforeLoad, storedLanguage("af"));
  await page.route("**/*", (route) =>
    route.request().resourceType() === "script"
      ? route.abort()
      : route.fallback(),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("a stored sample right-to-left language is marked before app scripts run", async ({
  page,
}) => {
  // 1. Offer a sample catalogue and store its tag before loading the map.
  const sample = createLanguageCatalogue(
    [
      { tag: "en-GB", label: "English" },
      { tag: "ar", label: "Arabic" },
    ],
    "en-GB",
    (tag) => createMessageCatalogue(tag, EN_GB_CATALOGUE, EN_GB_CATALOGUE),
  );
  expect((await sample.load("ar")).language).toBe("ar");
  const bootstrap = buildThemeBootstrapScript(sample.languages);
  const hash = createHash("sha256").update(bootstrap).digest("base64");
  await page.addInitScript(storeLanguageBeforeLoad, storedLanguage("ar"));
  await page.addInitScript(() => {
    Object.defineProperty(Intl, "Locale", { value: undefined });
  });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.body) {
        Object.assign(window, {
          __firstLanguage: document.documentElement.lang,
          __firstDirection: document.documentElement.dir,
        });
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.route("**/*", (route) =>
    route.request().resourceType() === "script"
      ? route.abort()
      : route.fallback(),
  );
  await page.route("**/map", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toMatch(/<script>\(function\(\)/);
    const body = html.replace(
      /<script>\(function\(\)[\s\S]*?<\/script>/,
      `<script>${bootstrap}</script>`,
    );
    const headers = response.headers();
    const policy = headers["content-security-policy"] ?? "";
    expect(policy).toContain("script-src");
    headers["content-security-policy"] = policy.replace(
      "script-src ",
      `script-src 'sha256-${hash}' `,
    );
    await route.fulfill({ response, headers, body });
  });
  await page.goto("/map");
  expect(
    await page.evaluate(() => {
      const observed = window as Window & {
        __firstLanguage?: string;
        __firstDirection?: string;
      };
      return [observed.__firstLanguage, observed.__firstDirection];
    }),
  ).toEqual(["ar", "rtl"]);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

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
    await page.goto("/map");
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

  test("the map region describes its keyboard controls in Afrikaans", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    await expect(mapPage.region).toHaveAccessibleDescription(
      /Pyltjies: Skuif die kaart\..*P: Plaas 'n speld in die middel van die kaart\./,
    );
  });

  test("shows the host's privacy note in Afrikaans", async ({ mapPage }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(
      mapPage.page.getByTestId("settings-privacy-note"),
    ).toContainText("MapCairn het geen rekeninge nie");
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

test.describe("when the Afrikaans messages fail to load", () => {
  const AFRIKAANS_CHUNK = "**/assets/js/af-*.js";

  /** Fails the first request for the Afrikaans module and lets later ones through. */
  async function failAfrikaansOnce(page: Page): Promise<void> {
    let failures = 0;
    await page.route(AFRIKAANS_CHUNK, (route) => {
      if (failures === 0) {
        failures += 1;
        return route.abort("failed");
      }
      return route.continue();
    });
  }

  async function chooseAfrikaans(page: Page) {
    const english = new MapPage(page, EN_GB_CATALOGUE);
    await english.goto();
    await english.openSettings();
    const languages = page.getByRole("radiogroup", { name: "Language" });
    await languages.getByRole("radio", { name: "Afrikaans" }).click();
    return { english, languages };
  }

  test("says so in English, keeps English on screen and retries with Try again", async ({
    page,
  }) => {
    await failAfrikaansOnce(page);
    const { english, languages } = await chooseAfrikaans(page);
    const status = page.getByTestId("language-status");
    await expect(status).toHaveText("Afrikaans could not be loaded.Try again");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(english.settingsHeading).toBeVisible();
    await expect(
      languages.getByRole("radio", { name: "English" }),
    ).toHaveAttribute("aria-checked", "true");

    await status.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "af");
    await expect(new MapPage(page, AF_CATALOGUE).settingsHeading).toBeVisible();
    await expect(status).toBeHidden();
  });

  test("retries from the keyboard", async ({ page }) => {
    await failAfrikaansOnce(page);
    await chooseAfrikaans(page);
    const retry = page
      .getByTestId("language-status")
      .getByRole("button", { name: "Try again" });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "af");
    await expect(page.getByRole("radio", { name: "Afrikaans" })).toBeFocused();
  });

  test("announces the failure once, politely", async ({ page }) => {
    await failAfrikaansOnce(page);
    await chooseAfrikaans(page);
    await expect(page.getByTestId("live-region-polite")).toHaveText(
      "Afrikaans could not be loaded.",
    );
  });

  test("passes axe with the failure showing @a11y", async ({ page }) => {
    await failAfrikaansOnce(page);
    await chooseAfrikaans(page);
    await expect(page.getByTestId("language-status")).toBeVisible();
    await waitForStableLayout(page);
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("the error page", () => {
  const MISSING_PAGE = "/this-route-does-not-exist";

  /** The page's heading, in the language of `text`. */
  function notFoundHeading(page: Page, text: typeof AF_CATALOGUE) {
    return page.getByRole("heading", {
      level: 1,
      name: text["app.error.notFound.title"],
    });
  }

  test.describe("with Afrikaans chosen", () => {
    test.use({ language: "af" });

    test("speaks Afrikaans and links back to the map", async ({ page }) => {
      await page.goto(MISSING_PAGE);
      await expect(notFoundHeading(page, AF_CATALOGUE)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "af");
      await page
        .getByRole("link", { name: AF_CATALOGUE["app.error.notFound.link"] })
        .click();
      await expect(page).toHaveURL(/\/map$/);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes axe in Afrikaans in ${colorScheme} @a11y`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(MISSING_PAGE);
        await expect(notFoundHeading(page, AF_CATALOGUE)).toBeVisible();
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });

  test.describe("with Automatic and an Afrikaans browser", () => {
    test.use({ locale: "af-ZA" });

    test("speaks Afrikaans", async ({ page }) => {
      await page.goto(MISSING_PAGE);
      await expect(notFoundHeading(page, AF_CATALOGUE)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "af");
    });
  });

  test.describe("with English chosen", () => {
    test.use({ language: "en-GB" });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes axe in English in ${colorScheme} @a11y`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(MISSING_PAGE);
        await expect(notFoundHeading(page, EN_GB_CATALOGUE)).toBeVisible();
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });

  test.describe("with Afrikaans chosen but not loadable", () => {
    test.use({ language: "af" });

    test("stays in English", async ({ page }) => {
      await page.route("**/assets/js/af-*.js", (route) =>
        route.abort("failed"),
      );
      await page.goto(MISSING_PAGE);
      await expect(notFoundHeading(page, EN_GB_CATALOGUE)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    });
  });
});
