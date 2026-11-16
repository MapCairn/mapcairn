// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { CountryIndex } from "../types.js";
import {
  type CountryArtefact,
  type CountryRecord,
  createCountryIndex,
} from "./countryIndex.js";

export { type CountryArtefact, type CountryRecord, createCountryIndex };

/**
 * A loader that reads the artefact on its first call and keeps the index for the
 * rest of the process. A load that fails is not kept: the next call reads again,
 * so a read that failed once (a file briefly unavailable) does not make every
 * later call fail with the same error.
 */
export function createCountryLoader(
  read: () => Promise<CountryArtefact>,
): () => Promise<CountryIndex> {
  let loading: Promise<CountryIndex> | undefined;
  return () => {
    loading ??= read()
      .then(createCountryIndex)
      .catch((error: unknown) => {
        loading = undefined;
        throw error;
      });
    return loading;
  };
}

/**
 * Loads the bundled country outlines (Natural Earth, 1:110m with the small
 * countries it lacks added at 1:50m) and builds the lookup. The file is imported
 * only on the first call, so a run that never needs a region never reads it, and
 * the result is kept for the rest of the process.
 */
export const loadCountries: () => Promise<CountryIndex> = createCountryLoader(
  async () =>
    (await import("./countries.json", { with: { type: "json" } }))
      .default as CountryArtefact,
);
