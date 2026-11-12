// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Parameters as FastCheckParameters } from "fast-check";

/**
 * How many generated cases each property checks. Enough to find an edge case
 * without slowing `npm test`; fast-check prints the seed of a failing run, so
 * it can be replayed with `fc.assert(property, { seed })`.
 */
export const PROPERTY_RUNS = 150;

/** The parameters every property passes to `fc.assert`. */
export const PROPERTY_PARAMETERS: FastCheckParameters = {
  numRuns: PROPERTY_RUNS,
};
