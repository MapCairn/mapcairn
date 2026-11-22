// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The remote-session Chromium override is explained in packages/web/playwright.config.ts.
const remoteSessionChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(remoteSessionChromium)
  ? remoteSessionChromium
  : undefined;

// Set MAPCAIRN_DOCS_E2E_PORT to run beside another server.
const port = process.env.MAPCAIRN_DOCS_E2E_PORT || "4441";
// The server listens on the loopback IPv4 address only, so the tests name it
// rather than `localhost`, which can resolve to ::1.
const origin = `http://127.0.0.1:${port}`;

/**
 * Browser checks for the documentation site: an axe audit, the search
 * keyboard path and the header layout, run against the built site in
 * `build/` (`npm run build -w @mapcairn/docs`) served under `/docs/` by
 * `scripts/serve.ts`, which answers the way the Worker does.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: origin,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `node --import tsx scripts/serve.ts ${port}`,
    url: `${origin}/docs/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
