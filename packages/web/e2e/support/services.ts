// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { BasemapDefinition } from "@mapcairn/core";
import type { Page } from "@playwright/test";
import { TRANSPARENT_PNG } from "./network";

/*
 * Scripted services for end-to-end tests.
 *
 * The e2e build keeps a test seam: `createServices()` merges whatever is on
 * `window.__MAPCAIRN_TEST_SERVICES__` over the real adapters (see
 * `src/composition/testSeam.ts`). Each helper here adds one service to that
 * object with `addInitScript`, so it is in place before the app boots, and
 * keeps its script on a `window.__mapcairn*` object a test can change later.
 *
 * Two things are scripted outside the seam on purpose:
 *
 * - Geolocation. The ui tells a denied, unavailable and timed-out location
 *   apart with `instanceof LocationError`, a class an init script cannot
 *   reach, so a seamed provider could only ever fail as "unavailable".
 *   Stubbing `navigator.geolocation` instead keeps the real
 *   `BrowserLocationProvider`, which maps error codes 1, 2 and 3 to those
 *   kinds, so every kind is reachable and the real adapter is covered too.
 * - The system theme, reduced motion, forced colours and contrast, which use
 *   Playwright's media emulation. The inline pre-paint theme script reads
 *   `matchMedia` and `localStorage` directly, so a seamed theme source would
 *   disagree with it.
 */

/** A search result as the `SearchProvider` port returns it. */
export interface ScriptedSearchResult {
  readonly id: string;
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly centre: { readonly lat: number; readonly lng: number };
  readonly bounds?: {
    readonly south: number;
    readonly west: number;
    readonly north: number;
    readonly east: number;
  };
}

/** How the scripted search provider answers. Every field can be changed at run time. */
export interface SearchScript {
  /** Returned for every query not listed in `noMatch` or `byQuery`. */
  results: ScriptedSearchResult[];
  /** Answers for particular queries (keys lower case, trimmed). */
  byQuery: Record<string, ScriptedSearchResult[]>;
  /** Queries (compared case-insensitively, trimmed) that find nothing. */
  noMatch: string[];
  /** How long each search takes before it answers. */
  delayMs: number;
  /** When true, every search rejects. */
  fail: boolean;
  /** The answer to a reverse lookup, or null for "no address here". */
  reverse: ScriptedSearchResult | null;
  /** Every query searched, in order (written by the fake). */
  queries: string[];
}

/** Three places, enough to exercise wrapping arrow keys. */
export const SAMPLE_RESULTS: ScriptedSearchResult[] = [
  {
    id: "cape-town",
    label: "Cape Town",
    secondaryLabel: "Western Cape, South Africa",
    centre: { lat: -33.9249, lng: 18.4241 },
  },
  {
    id: "cape-coast",
    label: "Cape Coast",
    secondaryLabel: "Central Region, Ghana",
    centre: { lat: 5.1053, lng: -1.2466 },
  },
  {
    id: "cape-cod",
    label: "Cape Cod",
    secondaryLabel: "Massachusetts, United States",
    centre: { lat: 41.6688, lng: -70.2962 },
    bounds: { south: 41.5, west: -70.7, north: 42.1, east: -69.9 },
  },
];

declare global {
  interface Window {
    __MAPCAIRN_TEST_SERVICES__?: unknown;
    __mapcairnSearch?: SearchScript;
    __mapcairnClipboard?: { ok: boolean; written: string[] };
    __mapcairnGeolocation?: GeolocationScript;
  }
}

/**
 * Replaces the search provider with a scripted one. Results, failures and
 * delays can be changed later through {@link updateSearchScript}.
 */
export async function scriptSearch(
  page: Page,
  script: Partial<Omit<SearchScript, "queries">> = {},
): Promise<void> {
  const initial: SearchScript = {
    results: SAMPLE_RESULTS,
    byQuery: {},
    noMatch: [],
    delayMs: 0,
    fail: false,
    reverse: null,
    queries: [],
    ...script,
  };
  await page.addInitScript((config: SearchScript) => {
    window.__mapcairnSearch = config;
    const wait = (ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            const error = new Error("The operation was cancelled.");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });
    const search = {
      async search(query: string, options?: { signal?: AbortSignal }) {
        const current = window.__mapcairnSearch as SearchScript;
        current.queries.push(query);
        await wait(current.delayMs, options?.signal);
        if (current.fail) {
          throw new Error("Scripted search failure.");
        }
        const normalised = query.trim().toLowerCase();
        const none = current.noMatch.some(
          (entry) => entry.trim().toLowerCase() === normalised,
        );
        if (none) {
          return [];
        }
        return current.byQuery[normalised] ?? current.results;
      },
      async reverse(_position: unknown, options?: { signal?: AbortSignal }) {
        const current = window.__mapcairnSearch as SearchScript;
        await wait(current.delayMs, options?.signal);
        return current.reverse;
      },
    };
    window.__MAPCAIRN_TEST_SERVICES__ = Object.assign(
      (window.__MAPCAIRN_TEST_SERVICES__ as object | undefined) ?? {},
      { search },
    );
  }, initial);
}

/** Changes the scripted search provider while the page runs. */
export async function updateSearchScript(
  page: Page,
  patch: Partial<Omit<SearchScript, "queries">>,
): Promise<void> {
  await page.evaluate((next) => {
    Object.assign(window.__mapcairnSearch as SearchScript, next);
  }, patch);
}

/** The queries the scripted search provider has received, in order. */
export async function searchedQueries(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.__mapcairnSearch?.queries ?? [])]);
}

/**
 * Replaces the layer registry with these definitions, which are plain data,
 * so a test can offer layers of any kind. Their URLs must still be on an
 * origin the production policy allows, and the test answers them with
 * `page.route`.
 */
export async function scriptLayers(
  page: Page,
  definitions: readonly object[],
): Promise<void> {
  await page.addInitScript((layers: readonly object[]) => {
    window.__MAPCAIRN_TEST_SERVICES__ = Object.assign(
      (window.__MAPCAIRN_TEST_SERVICES__ as object | undefined) ?? {},
      { layers: { list: () => layers } },
    );
  }, definitions);
}

/**
 * Makes the app offer these basemaps instead of the site's six, with the
 * first the default. The SDK's list holds three the site does not offer
 * (Liberty, Colorful and Fiord), so a spec that needs one passes the SDK's
 * `BASEMAPS`, which is plain data.
 *
 * @remarks The catalogue is rebuilt inside the page from the definitions,
 *   because its `get` and `resolve` are functions and cannot cross from the
 *   test to the page. It follows the rules of `createBasemapCatalogue`: an id
 *   it does not hold resolves to the default. The SDK's definitions name no
 *   preview, so passing them requests none. A spec that adds preview paths of
 *   its own for basemaps the site does not offer has them answered with a
 *   blank image, as the picker would otherwise show a broken one and the
 *   preview server would log a missing route for each.
 */
export async function scriptBasemaps(
  page: Page,
  basemaps: readonly BasemapDefinition[],
): Promise<void> {
  await page.route(/\/basemaps\/(?:liberty|colorful|fiord)\.jpg$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_PNG,
    }),
  );
  await page.addInitScript((definitions: readonly { id: string }[]) => {
    const byId = new Map(definitions.map((basemap) => [basemap.id, basemap]));
    const fallback = definitions[0];
    const basemaps = {
      basemaps: definitions,
      defaultId: fallback?.id,
      get: (id: string) => byId.get(id),
      resolve: (id: string) => byId.get(id) ?? fallback,
    };
    window.__MAPCAIRN_TEST_SERVICES__ = Object.assign(
      (window.__MAPCAIRN_TEST_SERVICES__ as object | undefined) ?? {},
      { basemaps },
    );
  }, basemaps);
}

/**
 * Replaces the clipboard with a recording fake. It succeeds unless `ok` is
 * false, in which case it reports the copy as denied.
 */
export async function scriptClipboard(page: Page, ok = true): Promise<void> {
  await page.addInitScript((succeed: boolean) => {
    window.__mapcairnClipboard = { ok: succeed, written: [] };
    const clipboard = {
      async writeText(text: string) {
        const state = window.__mapcairnClipboard as {
          ok: boolean;
          written: string[];
        };
        if (!state.ok) {
          return { ok: false, reason: "denied" };
        }
        state.written.push(text);
        return { ok: true };
      },
    };
    window.__MAPCAIRN_TEST_SERVICES__ = Object.assign(
      (window.__MAPCAIRN_TEST_SERVICES__ as object | undefined) ?? {},
      { clipboard },
    );
  }, ok);
}

/** Everything the recording clipboard was asked to copy. */
export async function copiedText(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.__mapcairnClipboard?.written ?? [])]);
}

/** Stored settings, as the `SettingsStore` port describes them. */
export interface ScriptedSettings {
  readonly theme: "system" | "light" | "dark";
  readonly units: "metric" | "imperial";
  readonly zoomButtons: boolean | null;
  readonly basemapId: string;
  readonly lastView: {
    readonly center: { readonly lat: number; readonly lng: number };
    readonly zoom: number;
    readonly bearing: number;
  } | null;
}

/**
 * Replaces the settings store with an in-memory one that reports
 * `persistent: false`, as the real store does when storage is blocked.
 *
 * @remarks `get()` returns the same frozen object until `set()` changes it,
 *   as the port requires, so `useSyncExternalStore` never loops.
 */
export async function scriptMemorySettings(
  page: Page,
  initial: Partial<ScriptedSettings> = {},
): Promise<void> {
  await page.addInitScript((seed: Partial<ScriptedSettings>) => {
    let current = Object.freeze({
      theme: "system",
      units: "metric",
      zoomButtons: null,
      basemapId: "bright",
      lastView: null,
      ...seed,
    });
    const listeners = new Set<(settings: typeof current) => void>();
    const settings = {
      persistent: false,
      get: () => current,
      set(patch: Partial<typeof current>) {
        current = Object.freeze({ ...current, ...patch });
        for (const listener of listeners) {
          listener(current);
        }
      },
      subscribe(listener: (settings: typeof current) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    window.__MAPCAIRN_TEST_SERVICES__ = Object.assign(
      (window.__MAPCAIRN_TEST_SERVICES__ as object | undefined) ?? {},
      { settings },
    );
  }, initial);
}

/**
 * Writes settings to `localStorage` before the app boots, in the format the
 * real `LocalStorageSettingsStore` reads: the theme as a plain string under
 * `mapcairn:theme`, everything else as JSON under `mapcairn:<name>`.
 */
export async function seedStoredSettings(
  page: Page,
  settings: Partial<ScriptedSettings>,
): Promise<void> {
  await page.addInitScript((seed: Partial<ScriptedSettings>) => {
    // Only on the first document of the test, so a reload keeps what the
    // app stored since.
    if (sessionStorage.getItem("mapcairn-e2e:seeded") === "true") {
      return;
    }
    sessionStorage.setItem("mapcairn-e2e:seeded", "true");
    for (const [name, value] of Object.entries(seed)) {
      localStorage.setItem(
        name === "theme" ? "mapcairn:theme" : `mapcairn:${name}`,
        name === "theme" ? String(value) : JSON.stringify(value),
      );
    }
  }, settings);
}

/** How the stubbed `navigator.geolocation` answers. */
export type GeolocationScript =
  | {
      readonly outcome: "fix";
      readonly lat: number;
      readonly lng: number;
      readonly accuracyMetres: number;
      readonly delayMs?: number;
    }
  | {
      readonly outcome: "denied" | "unavailable" | "timeout";
      readonly delayMs?: number;
    }
  | { readonly outcome: "absent" };

/**
 * Replaces `navigator.geolocation` before the app boots (see the note at the
 * top of this file for why this is not a seamed service). Errors use the
 * W3C codes: 1 denied, 2 unavailable, 3 timeout. `absent` removes
 * geolocation entirely, as on a browser without it.
 */
export async function scriptGeolocation(
  page: Page,
  script: GeolocationScript,
): Promise<void> {
  await page.addInitScript((config: GeolocationScript) => {
    window.__mapcairnGeolocation = config;
    const codes = { denied: 1, unavailable: 2, timeout: 3 } as const;
    const geolocation = {
      getCurrentPosition(
        success: (position: unknown) => void,
        failure: (error: unknown) => void,
      ) {
        const current = window.__mapcairnGeolocation as GeolocationScript;
        if (current.outcome === "absent") {
          return;
        }
        setTimeout(() => {
          if (current.outcome === "fix") {
            success({
              coords: {
                latitude: current.lat,
                longitude: current.lng,
                accuracy: current.accuracyMetres,
              },
              timestamp: Date.now(),
            });
            return;
          }
          failure({
            code: codes[current.outcome],
            message: `Scripted ${current.outcome}.`,
          });
        }, current.delayMs ?? 0);
      },
      watchPosition() {
        return 1;
      },
      clearWatch() {},
    };
    Object.defineProperty(Navigator.prototype, "geolocation", {
      configurable: true,
      get: () => (config.outcome === "absent" ? undefined : geolocation),
    });
  }, script);
}

/** Changes the stubbed geolocation while the page runs, for example to recover after an error. */
export async function updateGeolocationScript(
  page: Page,
  script: GeolocationScript,
): Promise<void> {
  await page.evaluate((next) => {
    window.__mapcairnGeolocation = next;
  }, script);
}
