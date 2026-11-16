// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { CountryIndex } from "../types.js";
import {
  type CountryArtefact,
  type CountryRecord,
  createCountryIndex,
} from "./countryIndex.js";

export { type CountryArtefact, type CountryRecord, createCountryIndex };

let loading: Promise<CountryIndex> | undefined;

/**
 * Loads the bundled country outlines (Natural Earth, 1:110m with the small
 * countries it lacks added at 1:50m) and builds the lookup. The file is imported
 * only on the first call, so a run that never needs a region never reads it, and
 * the result is kept for the rest of the process.
 */
export function loadCountries(): Promise<CountryIndex> {
  loading ??= import("./countries.json", { with: { type: "json" } }).then(
    (module) => createCountryIndex(module.default as CountryArtefact),
  );
  return loading;
}
