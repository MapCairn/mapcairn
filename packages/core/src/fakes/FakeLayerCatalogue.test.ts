// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  type LayerCatalogueSubject,
  runLayerCatalogueContract,
} from "../contracts/layerCatalogue.contract";
import type { LayerDefinition } from "../layers/definition";
import { FakeLayerCatalogue } from "./FakeLayerCatalogue";
import { SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER } from "./layerFixtures";

function subjectFor(
  layers?: readonly LayerDefinition[],
): () => LayerCatalogueSubject {
  return () => ({
    registry: new FakeLayerCatalogue(layers),
    controls: { layers: layers ?? [] },
  });
}

runLayerCatalogueContract("FakeLayerCatalogue (empty)", subjectFor());
runLayerCatalogueContract(
  "FakeLayerCatalogue (layers)",
  subjectFor([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]),
);

describe("FakeLayerCatalogue", () => {
  it("is empty by default", () => {
    expect(new FakeLayerCatalogue().list()).toEqual([]);
  });

  it("copies the list it is given, so later changes to the input do not leak in", () => {
    const input: LayerDefinition[] = [SAMPLE_FEED_LAYER];
    const registry = new FakeLayerCatalogue(input);
    input.push(SAMPLE_TILE_LAYER);
    expect(registry.list()).toEqual([SAMPLE_FEED_LAYER]);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });
});
