// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { runLayerCatalogueContract } from "../contracts/layerCatalogue.contract";
import { emptyLayerCatalogue } from "./emptyLayerCatalogue";

runLayerCatalogueContract("emptyLayerCatalogue", () => ({
  registry: emptyLayerCatalogue,
  controls: { layers: [] },
}));

describe("emptyLayerCatalogue", () => {
  it("lists no layers", () => {
    expect(emptyLayerCatalogue.list()).toEqual([]);
  });

  it("returns a frozen list, so a caller cannot add a layer to it", () => {
    expect(Object.isFrozen(emptyLayerCatalogue.list())).toBe(true);
  });
});
