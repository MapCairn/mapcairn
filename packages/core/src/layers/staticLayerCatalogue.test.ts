// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { runLayerCatalogueContract } from "../contracts/layerCatalogue.contract";
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
} from "../fakes/layerFixtures";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { createStaticLayerCatalogue } from "./staticLayerCatalogue";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

runLayerCatalogueContract("createStaticLayerCatalogue", () => ({
  registry: createStaticLayerCatalogue(SAMPLE_LAYERS, options),
  controls: { layers: SAMPLE_LAYERS },
}));

describe("createStaticLayerCatalogue", () => {
  it("lists a frozen copy of the definitions it was given", () => {
    const input = [SAMPLE_FEED_LAYER];
    const registry = createStaticLayerCatalogue(input, options);
    input.push(SAMPLE_TILE_LAYER);
    expect(registry.list()).toEqual([SAMPLE_FEED_LAYER]);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });

  it("refuses an invalid definition when it is built, not when it is used", () => {
    expect(() =>
      createStaticLayerCatalogue(
        [{ ...SAMPLE_FEED_LAYER, dataCost: "" }],
        options,
      ),
    ).toThrow(/sample-points: dataCost/);
  });
});
