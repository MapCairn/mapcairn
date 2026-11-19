// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// vanillaExtractPlugin() is the one build step the SDK asks of a host: its
// components and tokens are `.css.ts` files shipped as source.
export default defineConfig({
  plugins: [vanillaExtractPlugin(), react()],
  // Resolves the SDK packages to their source until `@mapcairn/map` builds to
  // `dist` too; then this app drops the condition and uses `dist` like any
  // outside app. A set list replaces Vite's defaults, so they are spread back in.
  resolve: { conditions: ["@mapcairn/source", ...defaultClientConditions] },
  environments: {
    ssr: {
      resolve: {
        conditions: ["@mapcairn/source", ...defaultServerConditions],
      },
    },
  },
  test: {
    name: "@mapcairn/example-embed",
    environment: "happy-dom",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
