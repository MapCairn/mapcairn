// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";

export default defineConfig({
  // `styles.css.ts` is compiled by vanilla-extract, as in the other packages.
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
    name: "@mapcairn/adapter-maplibre",
    environment: "happy-dom",
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
