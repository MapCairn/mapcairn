// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  describeChosenTime,
  type LayerDefinition,
  type LegendEntry,
  legendFor,
} from "@mapcairn/core";
import type { DataLayerState } from "./useDataLayers";

/** What the map key shows for one layer that is on. */
export interface MapKeyBlock {
  readonly id: string;
  readonly name: string;
  readonly definition: LayerDefinition;
  /** The key's rows, in the order the layer's style lists them. Never empty. */
  readonly entries: readonly [LegendEntry, ...LegendEntry[]];
  /**
   * The day or time the layer is set to, in words such as `13:00 UTC on 11
   * November 2026`, or null when it has no date or time control.
   */
  readonly chosenTime: string | null;
}

/**
 * The blocks of the map key: one for each layer that is on and has a key, in
 * catalogue order. Pure, so the image export can draw the same key the map
 * shows. An empty result means there is no key to show at all.
 */
export function mapKeyBlocks(
  layers: readonly DataLayerState[],
): readonly MapKeyBlock[] {
  return layers.flatMap(({ definition, enabled, controls }) => {
    const [first, ...rest] = legendFor(definition).entries;
    if (!enabled || first === undefined) {
      return [];
    }
    return [
      {
        id: definition.id,
        name: definition.name,
        definition,
        entries: [first, ...rest],
        chosenTime: describeChosenTime(definition, controls),
      },
    ];
  });
}
