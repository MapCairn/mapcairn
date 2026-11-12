// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  type LayerRegistrySubject,
  runLayerRegistryContract,
} from "../contracts/layerRegistry.contract";
import type { LayerDefinition } from "../layers/definition";
import { SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER } from "./layerFixtures";
import { StaticLayerRegistry } from "./StaticLayerRegistry";

function subjectFor(
  layers?: readonly LayerDefinition[],
): () => LayerRegistrySubject {
  return () => ({
    registry: new StaticLayerRegistry(layers),
    controls: { layers: layers ?? [] },
  });
}

runLayerRegistryContract("StaticLayerRegistry (empty)", subjectFor());
runLayerRegistryContract(
  "StaticLayerRegistry (layers)",
  subjectFor([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]),
);

describe("StaticLayerRegistry", () => {
  it("is empty by default", () => {
    expect(new StaticLayerRegistry().list()).toEqual([]);
  });

  it("copies the list it is given, so later changes to the input do not leak in", () => {
    const input: LayerDefinition[] = [SAMPLE_FEED_LAYER];
    const registry = new StaticLayerRegistry(input);
    input.push(SAMPLE_TILE_LAYER);
    expect(registry.list()).toEqual([SAMPLE_FEED_LAYER]);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });
});
