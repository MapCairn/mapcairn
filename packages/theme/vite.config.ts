import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { defineConfig } from "vite";

/**
 * `vanillaExtractPlugin()` is required even for this package's own vitest
 * run: `createGlobalTheme` (in `tokens.css.ts`) only runs correctly inside
 * vanilla-extract's compiler context, which this plugin provides. `@mapcairn/theme` ships source with no build step, so every
 * consumer's own Vite/Vitest pipeline needs this plugin registered too (see
 * `packages/map/vite.config.ts`, `packages/web/vite.config.ts`).
 */
export default defineConfig({
  plugins: [vanillaExtractPlugin()],
  test: {
    name: "@mapcairn/theme",
    environment: "node",
  },
});
