import { describe, expect, it } from "vitest";
import { runLayerRegistryContract } from "../contracts/layerRegistry.contract";
import { emptyLayerRegistry } from "./emptyLayerRegistry";

runLayerRegistryContract("emptyLayerRegistry", () => ({
  registry: emptyLayerRegistry,
  controls: { layers: [] },
}));

describe("emptyLayerRegistry", () => {
  it("lists no layers", () => {
    expect(emptyLayerRegistry.list()).toEqual([]);
  });

  it("returns a frozen list, so a caller cannot add a layer to it", () => {
    expect(Object.isFrozen(emptyLayerRegistry.list())).toBe(true);
  });
});
