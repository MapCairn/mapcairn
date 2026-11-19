// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import type { MapCairnOptions } from "./e2e/fixtures";

// Claude Code's remote/web sessions preinstall a fixed Chromium revision under
// /opt/pw-browsers rather than the revision this project's @playwright/test
// version expects, and block `playwright install` from re-fetching it. Point
// at that preinstalled binary only when it's present so local/CI runs (which
// install the matching revision via `playwright:install`) are unaffected.
const remoteSessionChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(remoteSessionChromium)
  ? remoteSessionChromium
  : undefined;

// Set MAPCAIRN_E2E_PORT to run beside another checkout's server. The `start`
// script (scripts/startE2e.mjs) reads the same variable.
const port = process.env.MAPCAIRN_E2E_PORT || "4173";
const baseURL = `http://localhost:${port}`;

// Specs that WebKit (iPhone) runs as well: MapLibre's worker startup, the
// keyboard model and the bottom sheet are where iOS has behaved differently.
// The layout and accessibility matrices stay on Chromium: they share CSS with
// WebKit and would more than double the run time.
const WEBKIT_SPECS = /(basemap|keyboard|sheet|app-shell)\.spec\.ts$/;

// The right-to-left projects run the same subset, with `dir="rtl"` on <html>
// (see `direction` in e2e/fixtures.ts). The app ships no right-to-left
// language yet, so they prove the layout mirrors, not any translation.
const RTL_SPECS = /(basemap|keyboard|sheet|app-shell|rtl)\.spec\.ts$/;

// The Afrikaans projects run the layout collision test and the accessibility
// specs with Afrikaans chosen (see `language` in e2e/fixtures.ts), because
// translated text is often longer than English. `i18n.spec.ts` sets its own
// language, so it runs in the default projects.
const AFRIKAANS_SPECS = /(^|\/)(collision|a11y)\.spec\.ts$/;

// The sample-language projects run one spec in each of three sample languages
// that the test seam offers (see `SAMPLE_LANGUAGES` in e2e/support/language.ts):
// accented English about 40 percent longer (`en-XA`), English embedded as
// right-to-left text on a mirrored page (`en-XB`) and a small Arabic sample
// (`ar`). The spec walks every chrome state at three viewports and checks two
// placeholders, in a collision test and an axe test, so the six projects run 45 tests.
const SAMPLE_LANGUAGE_SPECS = /sample-languages\.spec\.ts$/;

/**
 * The desktop and mobile projects for one sample language, which run only the
 * sample-language spec.
 */
function sampleLanguageProjects(prefix: string, language: string) {
  return {
    desktop: {
      name: `${prefix}-chromium`,
      testMatch: SAMPLE_LANGUAGE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        language,
        launchOptions: { executablePath },
      },
    },
    mobile: {
      name: `${prefix}-mobile-chromium`,
      testMatch: SAMPLE_LANGUAGE_SPECS,
      grepInvert: /@desktop-viewport/,
      use: {
        ...devices["Pixel 7"],
        language,
        launchOptions: { executablePath },
      },
    },
  };
}

const arabic = sampleLanguageProjects("arabic", "ar");
const expanded = sampleLanguageProjects("expanded", "en-XA");
const mirrored = sampleLanguageProjects("mirrored", "en-XB");

/**
 * End-to-end and accessibility suites for the web host.
 *
 * - Tests run against a production build made with `--mode e2e`
 *   (`npm run build:e2e`), the only build that keeps the browser test seam
 *   (`window.__MAPCAIRN_TEST_SERVICES__`, see `src/composition/testSeam.ts`).
 *   The build script proves the seam is there; `npm run build` proves a
 *   plain build has none.
 * - `npm run e2e` runs everything except titles tagged `@a11y`;
 *   `npm run a11y` runs only those.
 * - Basemap tiles, styles and Nominatim are mocked in `e2e/fixtures.ts`, so
 *   no test depends on a third-party service.
 * - Locators use `data-testid` (every interactive component renders one),
 *   but role and accessible-name locators come first wherever they exist.
 */
export default defineConfig<MapCairnOptions>({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The `vite preview` server backing `webServer` below is a single
  // local process, not Cloudflare's real distributed edge; running many
  // basemap-switching tests concurrently (each spinning up its own MapLibre
  // GL instance, which fetches its own worker script) has been observed to
  // overwhelm it under CI, crashing the server mid-run ("Connection reset by
  // peer") and cascading into unrelated test failures across the whole
  // suite. CI runs serially; local runs use two workers to avoid delaying
  // map-data readiness checks under full parallelism.
  workers: process.env.CI ? 1 : 2,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-testid",
  },
  // Playwright gives each shard a contiguous run of the project list, cut at
  // equal test counts, but the tests do not cost the same: the layout and
  // accessibility matrices (the Afrikaans, right-to-left and Pixel 7 projects)
  // take about 3.6 seconds a test and the rest about 1. The order below, found
  // from per-test times of CI runs on main, puts the costly projects at the
  // ends of different shards so the four shards finish within about 10 percent
  // of each other. When projects or specs change a lot, re-measure before
  // reordering; any order runs every test exactly once.
  projects: [
    arabic.desktop,
    expanded.mobile,
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
    mirrored.mobile,
    {
      name: "af-mobile-chromium",
      testMatch: AFRIKAANS_SPECS,
      grepInvert: /@desktop-viewport/,
      use: {
        ...devices["Pixel 7"],
        language: "af",
        launchOptions: { executablePath },
      },
    },
    mirrored.desktop,
    expanded.desktop,
    {
      name: "rtl-mobile-chromium",
      testMatch: RTL_SPECS,
      grepInvert: /@desktop-viewport/,
      use: {
        ...devices["Pixel 7"],
        direction: "rtl",
        launchOptions: { executablePath },
      },
    },
    {
      name: "rtl-chromium",
      testMatch: RTL_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        direction: "rtl",
        launchOptions: { executablePath },
      },
    },
    {
      name: "mobile-chromium",
      // Desktop-sized viewports in the layout and accessibility matrices run
      // on the desktop project only (DESKTOP_VIEWPORT_TAG in e2e/support/states.ts).
      grepInvert: /@desktop-viewport/,
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
    },
    arabic.mobile,
    {
      name: "af-chromium",
      testMatch: AFRIKAANS_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        language: "af",
        launchOptions: { executablePath },
      },
    },
    {
      name: "webkit",
      testMatch: WEBKIT_SPECS,
      use: { ...devices["iPhone 15"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // The e2e build runs before the server starts.
    timeout: 240_000,
  },
});
