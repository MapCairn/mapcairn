import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
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
