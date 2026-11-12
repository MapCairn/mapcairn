// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The example app runs its tests here but sits outside the coverage
    // include below: it proves the SDK can be embedded, and its own lines are
    // not part of the SDK whose floors the thresholds guard. Its test runs SDK
    // code during the coverage run, but is not meant to cover it.
    projects: ["packages/*", "examples/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/*/src/**"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/vite-env.d.ts",
        "packages/web/src/entry.client.tsx",
        "packages/web/src/entry.server.tsx",
      ],
      thresholds: {
        "packages/{core,map,react,theme}/**": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        // The host sits a little lower on branches because its layout and
        // touch-gesture code is also covered by Playwright, not only by jsdom.
        // Set below the measured figures (about 97.5, 93.8, 97.6 and 97.6) so
        // ordinary changes do not trip it, and raised when the measure rises.
        "packages/web/**": {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
      },
    },
  },
});
