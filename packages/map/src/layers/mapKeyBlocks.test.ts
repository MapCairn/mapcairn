// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  defaultControlValues,
  FakeMessageCatalogue,
  type LayerDefinition,
  legendFor,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_TIME_LAYER,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { inEnglish } from "../ui/LiveRegion/englishAnnounce";
import { mapKeyBlocks } from "./mapKeyBlocks";
import type { DataLayerState } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const catalogue = new FakeMessageCatalogue();

function state(definition: LayerDefinition, enabled: boolean): DataLayerState {
  return {
    definition,
    enabled,
    controls: defaultControlValues(definition, NOW),
    status: { kind: enabled ? "on" : "off" },
    features: [],
    sortId: "",
    sorted: [],
  };
}

describe("mapKeyBlocks", () => {
  it("has one block for each layer that is on and has a key, in catalogue order", () => {
    const blocks = mapKeyBlocks(
      [
        state(SAMPLE_FEED_LAYER, true),
        state(SAMPLE_ALERT_LAYER, false),
        state(SAMPLE_HEATMAP_LAYER, true),
      ],
      catalogue,
    );
    expect(blocks.map((block) => block.id)).toEqual([
      SAMPLE_FEED_LAYER.id,
      SAMPLE_HEATMAP_LAYER.id,
    ]);
    expect(blocks[0]).toMatchObject({
      name: SAMPLE_FEED_LAYER.name,
      definition: SAMPLE_FEED_LAYER,
      entries: legendFor(SAMPLE_FEED_LAYER, catalogue).entries,
    });
  });

  it("leaves out a layer that is on but has no key", () => {
    expect(mapKeyBlocks([state(SAMPLE_TILE_LAYER, true)], catalogue)).toEqual(
      [],
    );
  });

  it("is empty when no layer is on", () => {
    expect(mapKeyBlocks([state(SAMPLE_FEED_LAYER, false)], catalogue)).toEqual(
      [],
    );
    expect(mapKeyBlocks([], catalogue)).toEqual([]);
  });

  it("says in words which day or time a layer is set to, and nothing for a layer with no date", () => {
    const [timed, plain] = mapKeyBlocks(
      [
        state(
          {
            ...SAMPLE_TIME_LAYER,
            legend: [{ label: "Heavy rain", colour: "ordinal-5" }],
          },
          true,
        ),
        state(SAMPLE_FEED_LAYER, true),
      ],
      catalogue,
    );
    expect(inEnglish(timed?.chosenTime)).toMatch(/UTC on \d{1,2} \w+ \d{4}$/);
    expect(plain?.chosenTime).toBeNull();
  });
});
