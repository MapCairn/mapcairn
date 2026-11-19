// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";

export default defineConfig({
  plugins: [vanillaExtractPlugin(), react()],
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
    name: "@mapcairn/map",
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
