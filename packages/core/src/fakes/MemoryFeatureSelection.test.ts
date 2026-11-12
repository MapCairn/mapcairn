// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { runFeatureSelectionContract } from "../contracts/featureSelection.contract";
import { DEFAULT_SELECTION_LIMIT } from "../ports/selection";
import { MemoryFeatureSelection } from "./MemoryFeatureSelection";

runFeatureSelectionContract("MemoryFeatureSelection", ({ limit }) => {
  const selection = new MemoryFeatureSelection({ limit });
  return {
    selection,
    controls: {
      replaceExternally: (refs) => selection.replaceExternally(refs),
    },
  };
});

describe("MemoryFeatureSelection", () => {
  it("holds 200 references unless told otherwise", () => {
    expect(DEFAULT_SELECTION_LIMIT).toBe(200);
    expect(new MemoryFeatureSelection().limit).toBe(DEFAULT_SELECTION_LIMIT);
    expect(new MemoryFeatureSelection({ limit: 5 }).limit).toBe(5);
  });

  it("holds nothing when its limit is zero, and still hydrates", () => {
    const selection = new MemoryFeatureSelection({ limit: 0 });
    selection.add([{ layerId: "a", featureId: "1" }]);
    expect(selection.getState()).toEqual([]);
    selection.replaceExternally([{ layerId: "a", featureId: "1" }]);
    expect(selection.getState()).toHaveLength(1);
  });

  it("refuses a limit that is not a whole number of at least zero", () => {
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new MemoryFeatureSelection({ limit })).toThrow(RangeError);
    }
  });

  it("keeps only the two ids of a reference it is given", () => {
    const selection = new MemoryFeatureSelection();
    const tap = {
      layerId: "a",
      featureId: "1",
      hits: [{ layerId: "a", featureId: "1" }],
    };
    selection.add([tap]);
    expect(selection.getState()).toStrictEqual([
      { layerId: "a", featureId: "1" },
    ]);
  });

  describe("replaceExternally", () => {
    it("replaces the set beyond the limit, without duplicates, and tells subscribers once", () => {
      const selection = new MemoryFeatureSelection({ limit: 1 });
      const listener = vi.fn();
      selection.subscribe(listener);
      selection.replaceExternally([
        { layerId: "a", featureId: "1" },
        { layerId: "a", featureId: "2" },
        { layerId: "a", featureId: "1" },
      ]);
      expect(selection.getState()).toEqual([
        { layerId: "a", featureId: "1" },
        { layerId: "a", featureId: "2" },
      ]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("tells nobody when the set is already that", () => {
      const selection = new MemoryFeatureSelection();
      selection.add([{ layerId: "a", featureId: "1" }]);
      const held = selection.getState();
      const listener = vi.fn();
      selection.subscribe(listener);
      selection.replaceExternally([{ layerId: "a", featureId: "1" }]);
      expect(selection.getState()).toBe(held);
      expect(listener).not.toHaveBeenCalled();
    });

    it("can empty the set, as a host does when a save fails and it restores an empty copy", () => {
      const selection = new MemoryFeatureSelection();
      selection.add([{ layerId: "a", featureId: "1" }]);
      selection.replaceExternally([]);
      expect(selection.getState()).toEqual([]);
    });
  });
});
