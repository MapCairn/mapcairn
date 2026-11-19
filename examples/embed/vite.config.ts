// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// An outside app's whole build setup for the SDK: React, and nothing for the
// styles. The packages resolve to their built `dist` (no source condition), and
// `main.tsx` imports the two compiled stylesheets, so no style plugin is
// needed.
export default defineConfig({
  plugins: [react()],
  test: {
    name: "@mapcairn/example-embed",
    environment: "happy-dom",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
