// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";

/**
 * `vanillaExtractPlugin()` is required even for this package's own vitest
 * run: `createGlobalTheme` (in `tokens.css.ts`) only runs correctly inside
 * vanilla-extract's compiler context, which this plugin provides. A consumer
 * that resolves the `@mapcairn/source` export condition runs this package's
 * source, so its own Vite/Vitest pipeline needs this plugin registered too
 * (see `packages/map/vite.config.ts`, `packages/web/vite.config.ts`).
 */
export default defineConfig({
  plugins: [vanillaExtractPlugin()],
  // Resolve the SDK packages to their source, so tests run what is written.
  // A set list replaces Vite's defaults, so they are spread back in.
  resolve: { conditions: ["@mapcairn/source", ...defaultClientConditions] },
  environments: {
    ssr: {
      resolve: {
        conditions: ["@mapcairn/source", ...defaultServerConditions],
      },
    },
  },
  test: {
    name: "@mapcairn/theme",
    environment: "node",
  },
});
