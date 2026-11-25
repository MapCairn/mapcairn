// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "packages/core/vitest.config.ts" },
  mutate: [
    "packages/core/src/urlHash/urlHash.ts",
    "packages/core/src/spatial/measurement.ts",
    "packages/core/src/units/measurement.ts",
  ],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
};
