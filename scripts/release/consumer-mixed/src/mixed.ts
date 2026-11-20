// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Services } from "@mapcairn/sdk";
import { MERGED_SERVICE } from "./merging.js";

// `merging.ts` merges a service into `@mapcairn/core`. `Services` here comes
// from the umbrella, so the key type holds the merged name only when the two
// name one declaration, as they do when the app lists `core` at the umbrella's
// version.
export const MERGED_SERVICE_THROUGH_THE_UMBRELLA: keyof Services =
  MERGED_SERVICE;
