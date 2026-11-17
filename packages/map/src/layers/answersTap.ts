// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isIdentifiable } from "@mapcairn/core";
import type { DataLayerState } from "./useDataLayers";

/**
 * Whether a layer is one a tap can ask, as far as the Layers section can tell
 * without a place: it is on, has an `identify` block and shows imagery (the map
 * has not reported that none of its tiles loaded), the same tests `identifyAt`
 * makes before it looks at `bounds`. The section's identify lines read this, so
 * they claim only what a tap does. A layer whose `bounds` miss the tapped place
 * is still counted, since that depends on where the person taps.
 */
export function answersTap(layer: DataLayerState): boolean {
  return (
    layer.enabled &&
    isIdentifiable(layer.definition) &&
    layer.status.kind !== "tiles-unavailable"
  );
}
