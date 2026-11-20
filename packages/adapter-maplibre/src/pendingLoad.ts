// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapEngineError } from "@mapcairn/core";

/** A mount or a basemap swap that waits for the engine to load a style. */
export interface PendingLoad {
  readonly settleOn: "load" | "style.load";
  readonly resolve: () => void;
  readonly reject: (error: MapEngineError) => void;
  /**
   * True once the style document of this load has been parsed
   * (`style.load`). MapLibre fetches the sprite and glyphs only after that,
   * so a source-less error from then on is not the style document's.
   */
  styleLoaded: boolean;
}
