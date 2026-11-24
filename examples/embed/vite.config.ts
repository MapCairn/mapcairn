// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { createExampleThemeStylesheet } from "./src/exampleThemes.ts";
import { themeStylesheetPlugin } from "./src/themeStylesheetPlugin.ts";

// An outside app's whole build setup for the SDK: React, and nothing for the
// styles. The packages resolve to their built `dist` (no source condition), and
// `main.tsx` imports the two compiled stylesheets, so no style-compiling plugin
// is needed. The one extra step is the theme stylesheet, which
// `createThemeStylesheet` generates for both maps and the plugin serves as a file.
export default defineConfig({
  plugins: [react(), themeStylesheetPlugin(createExampleThemeStylesheet)],
  test: {
    name: "@mapcairn/example-embed",
    environment: "happy-dom",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
