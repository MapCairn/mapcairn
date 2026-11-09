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
        "**/main.tsx",
        "**/vite-env.d.ts",
        "packages/web/src/entry.client.tsx",
        "packages/web/src/entry.server.tsx",
        "packages/web/src/routes/**",
        "packages/web/src/paraglide/**",
      ],
      thresholds: {
        "packages/{core,map,react,theme}/**": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        // The host's layout and touch-gesture code is covered by Playwright, not jsdom.
        "packages/web/**": {
          statements: 70,
          branches: 50,
          functions: 65,
          lines: 70,
        },
      },
    },
  },
});
