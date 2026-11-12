// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { runLayerCatalogueContract } from "../contracts/layerCatalogue.contract";
import { emptyLayerCatalogue } from "./emptyLayerCatalogue";

runLayerCatalogueContract("emptyLayerCatalogue", () => ({
  catalogue: emptyLayerCatalogue,
  controls: { layers: [], settle: () => Promise.resolve() },
}));

describe("emptyLayerCatalogue", () => {
  it("is ready with no layers, so the Layers section stays hidden", () => {
    expect(emptyLayerCatalogue.getState()).toEqual({
      status: "ready",
      layers: [],
      skipped: [],
      refresh: "idle",
    });
  });

  it("is frozen, so a caller cannot add a layer to it", () => {
    const state = emptyLayerCatalogue.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(state.status === "ready" && Object.isFrozen(state.layers)).toBe(
      true,
    );
  });
});
