import { describe, expect, it } from "vitest";
import {
  type LayerRegistrySubject,
  runLayerRegistryContract,
} from "../contracts/layerRegistry.contract";
import type { LayerSummary } from "../ports/layers";
import { StaticLayerRegistry } from "./StaticLayerRegistry";

function subjectFor(
  layers?: readonly LayerSummary[],
): () => LayerRegistrySubject {
  return () => ({
    registry: new StaticLayerRegistry(layers),
    controls: { layers: layers ?? [] },
  });
}

runLayerRegistryContract("StaticLayerRegistry (empty)", subjectFor());
runLayerRegistryContract(
  "StaticLayerRegistry (layers)",
  subjectFor([
    { id: "parks", name: "Parks" },
    { id: "rivers", name: "Rivers" },
  ]),
);

describe("StaticLayerRegistry", () => {
  it("is empty by default", () => {
    expect(new StaticLayerRegistry().list()).toEqual([]);
  });

  it("copies the list it is given, so later changes to the input do not leak in", () => {
    const input: LayerSummary[] = [{ id: "a", name: "A" }];
    const registry = new StaticLayerRegistry(input);
    input.push({ id: "b", name: "B" });
    expect(registry.list()).toEqual([{ id: "a", name: "A" }]);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });
});
