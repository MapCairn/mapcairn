// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineProject } from "vitest/config";

export default defineProject({
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
    name: "@mapcairn/core",
    environment: "node",
  },
});
