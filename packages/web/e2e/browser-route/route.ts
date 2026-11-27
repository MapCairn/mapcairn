// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { MapPage } from "../pages/MapPage";
import {
  type CatalogueText,
  catalogueText,
  SAMPLE_LANGUAGES,
  type SampleLanguage,
} from "../support/language";
import { mockThirdPartyServices } from "../support/network";

/**
 * The two ways a page adds the map from `@mapcairn/sdk/browser`, and the page
 * in `pages/` that carries each.
 */
export const ROUTES = {
  function: "/function.html",
  element: "/element.html",
} as const;

/** `"function"` for `mountMap` and `"element"` for `<mapcairn-map>`. */
export type Route = keyof typeof ROUTES;

/** A sample language and the reading direction its page is set to. */
export interface RouteLanguage {
  readonly sample: SampleLanguage;
  readonly direction: "ltr" | "rtl";
}

/**
 * The two sample languages the map is offered: accented and expanded English
 * (left to right) and English isolated as right-to-left text (marked `rtl`).
 * They are the web host's test languages, built from the English messages.
 */
export const ROUTE_LANGUAGES: readonly RouteLanguage[] = [
  { sample: SAMPLE_LANGUAGES["en-XA"] as SampleLanguage, direction: "ltr" },
  { sample: SAMPLE_LANGUAGES["en-XB"] as SampleLanguage, direction: "rtl" },
];

/** The tools the pages turn on: every optional one, with the providers for search and Locate me. */
export const ROUTE_TOOLS = [
  "search",
  "map-options",
  "measure",
  "locate",
  "settings",
] as const;

/** The viewports the accessibility checks use: a phone, a tablet and a desktop. */
export const ROUTE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;

/**
 * The map page object for a page that loads the browser bundle. The host
 * names two elements with a test id (`map-host`, `map-options-sheet`) that the
 * bundle does not, so they are found by the attributes the interface itself
 * writes, `data-map-host` and `data-chrome="sheet"`; the locators built on
 * them follow.
 */
class BrowserRoutePage extends MapPage {
  constructor(page: Page, messages: CatalogueText) {
    super(page, messages);
    const sheet = page.locator('[data-chrome="sheet"]');
    Object.assign(this, {
      host: page.locator("[data-map-host]"),
      sheet,
      sheetHeading: sheet.getByRole("heading", {
        name: messages["app.sheetTitle.mapOptions"],
        level: 2,
      }),
      settingsHeading: sheet.getByRole("heading", {
        name: messages["app.sheetTitle.settings"],
        level: 2,
      }),
      sheetClose: sheet.getByRole("button", {
        name: messages["chrome.sheet.close"],
        exact: true,
      }),
    });
  }
}

/** What the pages put on `window`. */
interface RouteWindow extends Window {
  mountMap(element: HTMLElement, options: object): { getView(): unknown };
  sampleServices: object;
  mapHandle?: { getView(): unknown };
}

/** The `<mapcairn-map>` element, which holds the handle `mountMap` returns as `map`. */
interface ElementWithMap {
  readonly map?: { getView(): unknown };
}

/** What one opening of a page is told. */
export interface OpenOptions {
  readonly route: Route;
  readonly language: RouteLanguage;
  readonly theme: "light" | "dark";
  /** Sets `dir` on the `<mapcairn-map>` element too, for the element route. */
  readonly directionOnElement?: boolean;
}

/**
 * Opens the page for a route and adds the map in the language, theme and
 * reading direction asked for. `<html lang>` and `<html dir>` are set before
 * the map mounts, because the scripted direction reads only `<html dir>`.
 * Basemap and Nominatim requests are answered as the host's tests answer them.
 *
 * @returns The page object for the map, named in the language.
 */
export async function openRoute(
  page: Page,
  options: OpenOptions,
): Promise<MapPage> {
  await mockThirdPartyServices(page);
  await page.goto(ROUTES[options.route]);
  await page.waitForFunction(
    () =>
      (window as unknown as Partial<RouteWindow>).sampleServices !==
        undefined &&
      ((window as unknown as Partial<RouteWindow>).mountMap !== undefined ||
        customElements.get("mapcairn-map") !== undefined),
  );
  await page.evaluate(
    ({ route, language, theme, tools, directionOnElement }) => {
      const win = window as unknown as RouteWindow;
      document.documentElement.lang = language.sample.tag;
      document.documentElement.dir = language.direction;
      if (route === "function") {
        win.mapHandle = win.mountMap(
          document.getElementById("map") as HTMLElement,
          {
            languages: [language.sample],
            language: language.sample.tag,
            theme,
            tools,
            services: win.sampleServices,
          },
        );
        return;
      }
      const element = document.createElement("mapcairn-map");
      element.setAttribute("language", language.sample.tag);
      element.setAttribute("theme", theme);
      element.setAttribute("tools", tools.join(" "));
      if (directionOnElement) {
        element.setAttribute("dir", language.direction);
      }
      Object.assign(element, {
        languages: [language.sample],
        services: win.sampleServices,
      });
      document.getElementById("host")?.append(element);
    },
    {
      route: options.route,
      language: options.language,
      theme: options.theme,
      tools: [...ROUTE_TOOLS],
      directionOnElement: options.directionOnElement ?? false,
    },
  );
  const mapPage = new BrowserRoutePage(
    page,
    catalogueText(options.language.sample.tag),
  );
  await mapPage.waitForMap();
  return mapPage;
}

/** The view the map reports now, through the handle `mountMap` returned or the element's `map`. */
export function currentView(
  page: Page,
  route: Route,
): Promise<{
  readonly zoom: number;
  readonly center: { readonly lat: number; readonly lng: number };
}> {
  return page.evaluate((which) => {
    const handle =
      which === "function"
        ? (window as unknown as RouteWindow).mapHandle
        : (document.querySelector("mapcairn-map") as unknown as ElementWithMap)
            .map;
    return handle?.getView();
  }, route) as Promise<{
    readonly zoom: number;
    readonly center: { readonly lat: number; readonly lng: number };
  }>;
}
