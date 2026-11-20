// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";

export default defineConfig({
  // The umbrella re-exports `@mapcairn/map`, whose source holds `.css.ts` files.
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
    name: "@mapcairn/sdk",
    environment: "happy-dom",
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
