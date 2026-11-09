import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../layers/registry", () => ({
  getLayerGroupStructure: () => [
    { id: "exclusive", layerIds: ["one", "two"], selectionMode: "exclusive" },
    { id: "independent", layerIds: ["other"], selectionMode: "independent" },
  ],
}));

import { resolveSheetDetent, useMapUiStore } from "./useMapUiStore";

describe("map UI store", () => {
  beforeEach(() => useMapUiStore.getState().reset());

  it("starts without overlays or dataset selection state", () => {
    expect(useMapUiStore.getState()).toMatchObject({
      visibleLayerIds: [],
      basemap: "positron",
      activeSurface: null,
      sheetDetent: "half",
    });
    expect(useMapUiStore.getState()).not.toHaveProperty("panelView");
    expect(useMapUiStore.getState()).not.toHaveProperty("selectedFeatureId");
  });

  it("retains config-driven exclusive and independent groups", () => {
    const state = useMapUiStore.getState();
    state.toggleLayer("one");
    state.toggleLayer("other");
    state.toggleLayer("two");
    expect(useMapUiStore.getState().visibleLayerIds).toEqual(["other", "two"]);
    state.toggleLayer("two");
    expect(useMapUiStore.getState().visibleLayerIds).toEqual(["other"]);
  });

  it("stores clamped layer opacity and map controls", () => {
    const state = useMapUiStore.getState();
    state.setLayerOpacity("one", -1);
    state.setLayerOpacity("two", 2);
    state.setBasemap("satellite");
    state.setSheetDetent("full");
    state.setPanelOpen(true);
    expect(useMapUiStore.getState()).toMatchObject({
      opacityByLayer: { one: 0, two: 1 },
      basemap: "satellite",
      sheetDetent: "full",
      activeSurface: "explore",
    });
    state.setActiveSurface("measure");
    expect(useMapUiStore.getState().activeSurface).toBe("measure");
    state.setPanelOpen(false);
    expect(useMapUiStore.getState().activeSurface).toBeNull();
  });

  it.each([
    ["peek", -80, "half"],
    ["half", -80, "full"],
    ["full", -80, "full"],
    ["full", 80, "half"],
    ["half", 80, "peek"],
    ["peek", 80, null],
    ["half", 0, "half"],
  ] as const)("snaps %s after %s pixels to %s", (current, delta, expected) => {
    expect(resolveSheetDetent(current, delta)).toBe(expected);
  });
});
