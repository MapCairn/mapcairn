// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
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
    catalogue: new FakeLayerCatalogue(layers),
    controls: { layers: layers ?? [], settle: () => Promise.resolve() },
  });
}

runLayerCatalogueContract("FakeLayerCatalogue (empty)", subjectFor());
runLayerCatalogueContract(
  "FakeLayerCatalogue (layers)",
  subjectFor([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]),
);

describe("FakeLayerCatalogue", () => {
  it("is ready with no layers by default", () => {
    expect(new FakeLayerCatalogue().getState()).toEqual({
      status: "ready",
      layers: [],
      skipped: [],
      refresh: "idle",
    });
  });

  it("copies the list it is given, so later changes to the input do not leak in", () => {
    const input: LayerDefinition[] = [SAMPLE_FEED_LAYER];
    const catalogue = new FakeLayerCatalogue(input);
    input.push(SAMPLE_TILE_LAYER);
    const state = catalogue.getState();
    expect(state.status === "ready" && state.layers).toEqual([
      SAMPLE_FEED_LAYER,
    ]);
  });

  it("can be read and subscribed to through detached references, as React does", () => {
    const catalogue = new FakeLayerCatalogue();
    const { getState, subscribe } = catalogue;
    const listener = vi.fn();
    subscribe(listener);
    catalogue.setLayers([SAMPLE_FEED_LAYER]);
    expect(getState()).toBe(catalogue.getState());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("replaces the layers and tells each subscriber once", () => {
    const catalogue = new FakeLayerCatalogue([SAMPLE_FEED_LAYER]);
    const listener = vi.fn();
    catalogue.subscribe(listener);
    catalogue.setLayers([SAMPLE_TILE_LAYER]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(catalogue.getState()).toEqual({
      status: "ready",
      layers: [SAMPLE_TILE_LAYER],
      skipped: [],
      refresh: "idle",
    });
  });

  it("is scripted into any state", () => {
    const catalogue = new FakeLayerCatalogue();
    const failed = { status: "failed", reason: "network" } as const;
    catalogue.setState(failed);
    expect(catalogue.getState()).toBe(failed);
    catalogue.setState({ status: "loading" });
    expect(catalogue.getState()).toEqual({ status: "loading" });
  });

  it("records each refresh it is asked for and changes nothing", async () => {
    const catalogue = new FakeLayerCatalogue([SAMPLE_FEED_LAYER]);
    const before = catalogue.getState();
    await catalogue.refresh();
    await catalogue.refresh();
    expect(catalogue.refreshes).toBe(2);
    expect(catalogue.getState()).toBe(before);
  });
});
