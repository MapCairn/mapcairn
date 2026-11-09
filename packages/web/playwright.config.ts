import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Claude Code's remote/web sessions preinstall a fixed Chromium revision under
// /opt/pw-browsers rather than the revision this project's @playwright/test
// version expects, and block `playwright install` from re-fetching it. Point
// at that preinstalled binary only when it's present so local/CI runs (which
// install the matching revision via `playwright:install`) are unaffected.
const remoteSessionChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(remoteSessionChromium)
  ? remoteSessionChromium
  : undefined;

// Specs that WebKit (iPhone) runs as well: MapLibre's worker startup, the
// keyboard model and the bottom sheet are where iOS has behaved differently.
// The layout and accessibility matrices stay on Chromium: they share CSS with
// WebKit and would more than double the run time.
const WEBKIT_SPECS = /(basemap|keyboard|sheet|app-shell)\.spec\.ts$/;

/**
 * End-to-end and accessibility suites for the web host.
 *
 * - Tests run against a production build made with `--mode e2e`
 *   (`npm run build:e2e`), the only build that keeps the browser test seam
 *   (`window.__KARTA_TEST_SERVICES__`, see `src/composition/testSeam.ts`).
 *   The build script proves the seam is there; `npm run build` proves a
 *   plain build has none.
 * - `npm run e2e` runs everything except titles tagged `@a11y`;
 *   `npm run a11y` runs only those.
 * - Basemap tiles, styles and Nominatim are mocked in `e2e/fixtures.ts`, so
 *   no test depends on a third-party service.
 * - Locators use `data-testid` (every interactive component renders one),
 *   but role and accessible-name locators come first wherever they exist.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The `wrangler dev` preview server backing `webServer` below is a single
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
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-testid",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
    {
      name: "mobile-chromium",
      // Desktop-sized viewports in the layout and accessibility matrices run
      // on the desktop project only (DESKTOP_VIEWPORT_TAG in e2e/support/states.ts).
      grepInvert: /@desktop-viewport/,
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
    },
    {
      name: "webkit",
      testMatch: WEBKIT_SPECS,
      use: { ...devices["iPhone 15"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    // The e2e build runs before the server starts.
    timeout: 240_000,
  },
});
