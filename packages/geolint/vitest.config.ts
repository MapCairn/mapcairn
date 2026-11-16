// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@mapcairn/geolint",
    environment: "node",
  },
});
