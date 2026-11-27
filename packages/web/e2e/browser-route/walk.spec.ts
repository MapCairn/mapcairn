// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { expect, type Locator, test } from "@playwright/test";
import type { MapPage } from "../pages/MapPage";
import { tabKey } from "../support/keys";
import { collapseCredits } from "../support/states";
import {
  builtLanguages,
  currentView,
  openRoute,
  ROUTE_LANGUAGES,
  ROUTE_VIEWPORTS,
  type Route,
  type RouteLanguage,
} from "./route";

/*
 * The keyboard walk over the browser route: Tab reaches the search, the
 * controls, the map and the credits in order, the arrow keys pan, Escape
 * closes a sheet from the sheet or from the map and hands focus back to the
 * control that opened it, and a direction-aware control follows `<html dir>`.
 * It runs once for each page and each sample language, with `<html dir>` and
 * `<html lang>` set to match. Every title carries @a11y, so `npm run a11y`
 * runs it.
 */

/** A phone and a desktop: the sheet is a bottom sheet on one and a side panel on the other. */
const VIEWPORTS = [ROUTE_VIEWPORTS[0], ROUTE_VIEWPORTS[2]] as const;

/** The controls Tab visits, from the first, as locators on the page. */
function tabOrder(mapPage: MapPage): Locator[] {
  return [
    mapPage.searchInput,
    mapPage.searchSubmit,
    mapPage.mapOptionsButton,
    mapPage.measureButton,
    mapPage.locateButton,
    mapPage.settingsButton,
    mapPage.zoomInButton,
    mapPage.zoomOutButton,
    mapPage.region,
    mapPage.creditsButton,
  ];
}

/** The key that moves a segmented control on in the page's reading direction. */
function nextKey(language: RouteLanguage): "ArrowRight" | "ArrowLeft" {
  return language.direction === "ltr" ? "ArrowRight" : "ArrowLeft";
}

test.describe("the browser route, languages @a11y", () => {
  test("the page builds two languages from the English messages, one marked right to left @a11y", async ({
    page,
  }) => {
    const built = await builtLanguages(page, "function");
    expect(built.map(({ tag, direction }) => [tag, direction])).toEqual(
      ROUTE_LANGUAGES.map(({ tag, direction }) => [
        tag,
        direction === "rtl" ? "rtl" : undefined,
      ]),
    );
    for (const { messages } of built) {
      expect(Object.keys(messages)).toEqual(Object.keys(EN_GB_CATALOGUE));
      // The walk finds controls by these texts, so English would prove nothing.
      expect(messages["host.map.label"]).not.toBe(
        EN_GB_CATALOGUE["host.map.label"],
      );
    }
  });

  // No `dir` on the element and none left to inherit from: what is on the
  // map's own element is what the map wrote.
  for (const route of ["function", "element"] as const satisfies Route[]) {
    for (const language of ROUTE_LANGUAGES) {
      test(`the ${route} page's map carries lang and dir for ${language.tag} @a11y`, async ({
        page,
      }) => {
        await openRoute(page, { route, language, theme: "light" });
        const container = page.locator(
          route === "function" ? "#map" : "mapcairn-map",
        );
        await expect(container).toHaveAttribute("lang", language.tag);
        await expect(container).toHaveAttribute("dir", language.direction);
      });
    }
  }
});

test.describe("the browser route, keyboard walk @a11y", () => {
  for (const route of ["function", "element"] as const satisfies Route[]) {
    for (const language of ROUTE_LANGUAGES) {
      for (const viewport of VIEWPORTS) {
        test.describe(`${route} page in ${language.tag} at${viewport.width}x${viewport.height}`, () => {
          test.beforeEach(async ({ page }) => {
            await page.setViewportSize(viewport);
            await page.clock.install();
          });

          test("Tab reaches the search, the controls, the map and the credits in order @a11y", async ({
            page,
            browserName,
          }) => {
            const mapPage = await openRoute(page, {
              route,
              language,
              theme: "light",
              directionOnElement: true,
            });
            await collapseCredits(mapPage);
            await expect(page.locator("html")).toHaveAttribute(
              "dir",
              language.direction,
            );
            for (const control of tabOrder(mapPage)) {
              await page.keyboard.press(tabKey(browserName));
              await expect(control).toBeFocused();
            }
            await page.keyboard.press("Enter");
            await expect(mapPage.creditsRegion).toBeVisible();
            await expect(
              mapPage.creditsRegion.getByRole("link").first(),
            ).toBeFocused();
            await page.keyboard.press("Escape");
            await expect(mapPage.creditsRegion).toBeHidden();
            await expect(mapPage.creditsButton).toBeFocused();
          });

          test("the arrow keys pan the map @a11y", async ({ page }) => {
            const mapPage = await openRoute(page, {
              route,
              language,
              theme: "light",
              directionOnElement: true,
            });
            await mapPage.focusMap();
            const start = await currentView(page, route);
            const centre = async () => (await currentView(page, route)).center;
            await page.keyboard.press("ArrowRight");
            await expect
              .poll(async () => (await centre()).lng)
              .toBeGreaterThan(start.center.lng);
            const east = (await centre()).lng;
            await page.keyboard.press("ArrowUp");
            await expect
              .poll(async () => (await centre()).lat)
              .toBeGreaterThan(start.center.lat);
            const north = (await centre()).lat;
            await page.keyboard.press("ArrowLeft");
            await expect
              .poll(async () => (await centre()).lng)
              .toBeLessThan(east);
            await page.keyboard.press("ArrowDown");
            await expect
              .poll(async () => (await centre()).lat)
              .toBeLessThan(north);
            await expect(mapPage.region).toBeFocused();
          });

          test("Escape closes a sheet from the sheet or from the map, and focus returns to its opener @a11y", async ({
            page,
          }) => {
            const mapPage = await openRoute(page, {
              route,
              language,
              theme: "light",
              directionOnElement: true,
            });
            for (const [opener, heading] of [
              [mapPage.mapOptionsButton, mapPage.sheetHeading],
              [mapPage.settingsButton, mapPage.settingsHeading],
            ] as const) {
              await opener.focus();
              await page.keyboard.press("Enter");
              await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
              await expect(heading).toBeFocused();
              await page.keyboard.press("Escape");
              await expect(mapPage.sheet).toHaveAttribute(
                "data-state",
                "closed",
              );
              await expect(opener).toBeFocused();

              await page.keyboard.press("Enter");
              await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
              await mapPage.focusMap();
              await page.keyboard.press("Escape");
              await expect(mapPage.sheet).toHaveAttribute(
                "data-state",
                "closed",
              );
              await expect(opener).toBeFocused();
            }
          });

          test("the search and the measure tool work from the keyboard @a11y", async ({
            page,
          }) => {
            const mapPage = await openRoute(page, {
              route,
              language,
              theme: "light",
              directionOnElement: true,
            });
            await mapPage.searchInput.focus();
            await page.keyboard.type("cape");
            await page.keyboard.press("Enter");
            await expect(mapPage.searchOptions).toHaveCount(2);
            await page.keyboard.press("Escape");
            await expect(mapPage.searchPanel).toBeHidden();

            await mapPage.measureButton.focus();
            await page.keyboard.press("Enter");
            await expect(mapPage.measureToolbar).toBeVisible();
            await mapPage.measureDone.focus();
            await page.keyboard.press("Enter");
            await expect(mapPage.measureToolbar).toHaveCount(0);
            await expect(mapPage.measureButton).toBeFocused();
          });

          test("a segmented control in Settings follows the page's reading direction @a11y", async ({
            page,
          }) => {
            const mapPage = await openRoute(page, {
              route,
              language,
              theme: "light",
              directionOnElement: true,
            });
            const m = mapPage.messages;
            await mapPage.settingsButton.focus();
            await page.keyboard.press("Enter");
            await expect(mapPage.settingsHeading).toBeFocused();
            const theme = mapPage.sheet.getByRole("radiogroup", {
              name: m["settings.theme.label"],
            });
            const light = theme.getByRole("radio", {
              name: m["settings.theme.light"],
            });
            await light.focus();
            await expect(light).toBeChecked();
            await page.keyboard.press(nextKey(language));
            await expect(
              theme.getByRole("radio", { name: m["settings.theme.dark"] }),
            ).toBeFocused();
          });
        });
      }
    }
  }
});
