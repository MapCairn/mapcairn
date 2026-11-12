// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@mapcairn/core",
    environment: "node",
  },
});
