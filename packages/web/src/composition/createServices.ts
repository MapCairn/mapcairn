import { emptyLayerRegistry, type Services } from "@karta/core";
// The engine style file has no exports. Importing it here, in the one module
// every page that builds services loads, puts its rules in the page before
// the engine mounts, and keeps it out of the ui, which may not import adapters.
import "../adapters/mapEngine.css";
import { BrowserClipboard } from "../adapters/clipboard/BrowserClipboard";
import { BrowserLocationProvider } from "../adapters/location/BrowserLocationProvider";
import { createMapLibreMapAdapter } from "../adapters/maplibre/MapLibreMapAdapter";
import { BrowserDevicePreferences } from "../adapters/preferences/BrowserDevicePreferences";
import { NominatimSearchProvider } from "../adapters/search/NominatimSearchProvider";
import { LocalStorageSettingsStore } from "../adapters/settings/LocalStorageSettingsStore";
import { BrowserThemeSource } from "../adapters/theme/BrowserThemeSource";
import { BrowserUrlState } from "../adapters/url/BrowserUrlState";
import { readTestOverrides } from "./testSeam";

/** Options for {@link createServices}. */
export interface CreateServicesOptions {
  /**
   * Services to use instead of the real ones. Entries that are `undefined`
   * are ignored. These win over everything, including the browser test seam.
   */
  readonly overrides?: Partial<Services>;
}

function definedEntries(
  overrides: Partial<Services> | undefined,
): Partial<Services> {
  return Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<Services>;
}

/**
 * The one composition root. Builds every real adapter and returns them as a
 * {@link Services}; nothing else in the app constructs an adapter.
 *
 * @remarks Returns a fresh object on every call and keeps no module-level
 *   state, so tests and server renders never share services. Safe to call
 *   while rendering on the server: adapters touch no browser API until they
 *   are used, and tolerate its absence.
 *
 *   In builds whose Vite mode is not `production` (development, tests, the
 *   `e2e` mode), the result is merged with the services a browser test puts
 *   on the window (see `testSeam.ts`; the property name is kept out of this
 *   file because the server bundle keeps comments and the seam check searches
 *   for it), so a Playwright `addInitScript` can script geolocation, search, the
 *   clipboard, storage and the system theme. In a production build the mode
 *   is a constant, the branch is removed, and so is `testSeam.ts`;
 *   `scripts/verifyNoTestSeam.mjs` proves it from the build output.
 *   Precedence, lowest first: real adapters, the test seam, `options.overrides`.
 */
export function createServices(options: CreateServicesOptions = {}): Services {
  const real: Services = {
    // The adapter loads MapLibre lazily, so building one costs nothing
    // until it mounts.
    createMapAdapter: createMapLibreMapAdapter,
    search: new NominatimSearchProvider(),
    location: new BrowserLocationProvider(),
    settings: new LocalStorageSettingsStore(),
    clipboard: new BrowserClipboard(),
    url: new BrowserUrlState(),
    theme: new BrowserThemeSource(),
    preferences: new BrowserDevicePreferences(),
    layers: emptyLayerRegistry,
  };
  const seam =
    import.meta.env.MODE !== "production" ? readTestOverrides() : undefined;
  return { ...real, ...seam, ...definedEntries(options.overrides) };
}
