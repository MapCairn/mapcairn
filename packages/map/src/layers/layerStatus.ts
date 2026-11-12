// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LayerError } from "@mapcairn/core";

/**
 * Where a layer is: off, on (tiles), loading, loaded, empty, failed, or (a
 * query layer) too far out to ask for features. A tile layer is `on` until
 * the map reports that none of its tiles loaded, which is
 * `tiles-unavailable`. That lasts until its tiles change, it is turned off, or
 * the map reports that a tile loaded later, when it is `on` again.
 */
export type LayerStatus =
  | { readonly kind: "off" }
  | { readonly kind: "on" }
  | { readonly kind: "tiles-unavailable" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      /** How many are drawn. */
      readonly count: number;
      readonly updatedAt: number;
      /** True when the query had more than its cap, so only the first are drawn. */
      readonly capped?: boolean;
    }
  | { readonly kind: "zoom-in" }
  | { readonly kind: "empty"; readonly updatedAt: number }
  | { readonly kind: "error"; readonly error: "network" | "invalid" };

/**
 * The kind of a failed load or detail request, with anything that is not a
 * `LayerError` counted as `invalid`. `aborted` and `empty` are not failures
 * the layer shows as an error.
 */
export function errorKind(
  error: unknown,
): "network" | "invalid" | "aborted" | "empty" {
  return error instanceof LayerError ? error.kind : "invalid";
}
