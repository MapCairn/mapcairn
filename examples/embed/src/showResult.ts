// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapAdapter, SearchResult } from "@mapcairn/core";

/** The zoom a result without an extent is shown at. */
export const RESULT_ZOOM = 14;
/** The closest a fit to a result's extent zooms in. */
export const RESULT_MAX_ZOOM = 16;

/**
 * Moves the map to a result the person picked: fits the result's extent when
 * it has one (a glen, a lake), and otherwise centres on its point at
 * {@link RESULT_ZOOM}. The search pill reports the pick and leaves moving the
 * map to the host.
 */
export function showResult(
  adapter: Pick<MapAdapter, "setView" | "fitBounds">,
  result: SearchResult,
): void {
  if (result.bounds) {
    adapter.fitBounds(result.bounds, { maxZoom: RESULT_MAX_ZOOM });
    return;
  }
  adapter.setView({ center: result.centre, zoom: RESULT_ZOOM });
}
