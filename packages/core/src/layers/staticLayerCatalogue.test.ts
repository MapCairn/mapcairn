// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
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
  catalogue: createStaticLayerCatalogue(SAMPLE_LAYERS, options),
  controls: { layers: SAMPLE_LAYERS, settle: () => Promise.resolve() },
}));

describe("createStaticLayerCatalogue", () => {
  it("is ready on the first read, with the layers frozen and copied from the input", () => {
    const input = [SAMPLE_FEED_LAYER];
    const catalogue = createStaticLayerCatalogue(input, options);
    input.push(SAMPLE_TILE_LAYER);
    const state = catalogue.getState();
    expect(state).toEqual({
      status: "ready",
      layers: [SAMPLE_FEED_LAYER],
      skipped: [],
      refresh: "idle",
    });
    expect(state.status === "ready" && Object.isFrozen(state.layers)).toBe(
      true,
    );
  });

  it("refuses an invalid definition when it is built, not when it is used", () => {
    expect(() =>
      createStaticLayerCatalogue(
        [{ ...SAMPLE_FEED_LAYER, dataCost: "" }],
        options,
      ),
    ).toThrow(/sample-points: dataCost/);
  });

  it("refuses a duplicate id when it is built", () => {
    expect(() =>
      createStaticLayerCatalogue(
        [SAMPLE_FEED_LAYER, SAMPLE_FEED_LAYER],
        options,
      ),
    ).toThrow(/sample-points: id: duplicate/);
  });

  it("never changes, so a subscriber is never called", async () => {
    const catalogue = createStaticLayerCatalogue(SAMPLE_LAYERS, options);
    const listener = vi.fn();
    catalogue.subscribe(listener);
    await catalogue.refresh();
    expect(listener).not.toHaveBeenCalled();
  });
});
