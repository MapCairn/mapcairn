import { describe, expect, it } from "vitest";
import {
  getLayer,
  getLayerGroupStructure,
  getLayerGroups,
  getLayerStructure,
  getLayers,
} from "./registry";

describe("empty layer registry", () => {
  it("keeps the generic registry contract without shipping datasets", () => {
    expect(getLayers()).toEqual([]);
    expect(getLayerGroups()).toEqual([]);
    expect(getLayerStructure()).toEqual([]);
    expect(getLayerGroupStructure()).toEqual([]);
    expect(getLayer("unknown")).toBeUndefined();
  });
});
