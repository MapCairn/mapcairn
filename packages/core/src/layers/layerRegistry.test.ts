import { describe, expect, it } from "vitest";
import { runLayerRegistryContract } from "../contracts/layerRegistry.contract";
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
} from "../fakes/layerFixtures";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { createLayerRegistry } from "./layerRegistry";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

runLayerRegistryContract("createLayerRegistry", () => ({
  registry: createLayerRegistry(SAMPLE_LAYERS, options),
  controls: { layers: SAMPLE_LAYERS },
}));

describe("createLayerRegistry", () => {
  it("lists a frozen copy of the definitions it was given", () => {
    const input = [SAMPLE_FEED_LAYER];
    const registry = createLayerRegistry(input, options);
    input.push(SAMPLE_TILE_LAYER);
    expect(registry.list()).toEqual([SAMPLE_FEED_LAYER]);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });

  it("refuses an invalid definition when it is built, not when it is used", () => {
    expect(() =>
      createLayerRegistry([{ ...SAMPLE_FEED_LAYER, dataCost: "" }], options),
    ).toThrow(/sample-points: dataCost/);
  });
});
