// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@mapcairn/example-headless",
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
