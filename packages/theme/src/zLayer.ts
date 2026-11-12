// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "./tokens.css";
import type { ZLayerName } from "./tokenValues";

/**
 * The z-index variable for a named layer, bottom to top: map, mapOverlay,
 * chrome, chromeRaised, sheet, toolbar, popover, toast. Components name a
 * layer and never write a number; `tokens.css.ts` and the engine style file
 * are the only places raw z-index values may appear.
 * @remarks Lives outside `tokens.css.ts` because a `.css.ts` module may only
 *   export serialisable values, not functions.
 */
export function zLayer(name: ZLayerName): string {
  return tokens.z[name];
}
