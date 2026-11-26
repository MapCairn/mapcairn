// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapAdapter, SearchResult } from "@mapcairn/core";

/** The zoom a result with no extent is shown at. */
const RESULT_ZOOM = 14;
/** The closest zoom a result with an extent is fitted to. */
const RESULT_MAX_ZOOM = 16;

/** Moves the map to a search result: its extent when it has one, otherwise its centre. */
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
