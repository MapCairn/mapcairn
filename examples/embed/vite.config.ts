// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// vanillaExtractPlugin() is the one build step the SDK asks of a host: its
// components and tokens are `.css.ts` files shipped as source.
export default defineConfig({
  plugins: [vanillaExtractPlugin(), react()],
  test: {
    name: "@mapcairn/example-embed",
    environment: "happy-dom",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
