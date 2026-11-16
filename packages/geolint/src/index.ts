// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

/**
 * The geolint lint engine: pure, with no Node built-in, so it runs in a browser
 * or a Worker as well as Node. The command and the file helpers are in
 * `@mapcairn/geolint/node`.
 */
export {
  FIX_ORDER,
  FixError,
  type FixStats,
  fixBytes,
  fixFeature,
  MAX_FIX_PASSES,
} from "./engine/fix.js";
export {
  activeRules,
  buildContext,
  type CountryLoader,
  compareFindings,
  comparePaths,
  type LintOptions,
  type LintReport,
  LintUsageError,
  lintBytes,
  lintFeature,
  lintText,
} from "./engine/lint.js";
export { geoJsonReader } from "./engine/reader/geojson.js";
export {
  type CountryArtefact,
  createCountryIndex,
  loadCountries,
} from "./engine/regions/index.js";
export {
  EXIT,
  exitCodeFor,
  type FileReport,
  formatJson,
  formatText,
  type Summary,
  summarise,
} from "./engine/report.js";
export { rules } from "./engine/rules/index.js";
export { formatSarif } from "./engine/sarif.js";
export type {
  Confidence,
  CountryIndex,
  DocumentInfo,
  Finding,
  InputError,
  Reader,
  ReadResult,
  Rule,
  RuleContext,
  Severity,
  SourceFeature,
} from "./engine/types.js";
export { VERSION } from "./engine/version.js";
