import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMapUiStore } from "../stores/useMapUiStore";
import {
  buildMapPermalinkSearch,
  parseMapPermalink,
  useMapPermalink,
} from "./useMapPermalink";

describe("map permalinks", () => {
  beforeEach(() => {
    useMapUiStore.getState().reset();
    window.history.replaceState(null, "", "/");
  });

  it("validates configured layers and basemaps only", () => {
    expect(
      parseMapPermalink(
        "?layers=one,missing&basemap=topo&panel=removed&feature=removed",
        ["one"],
      ),
    ).toEqual({ visibleLayerIds: ["one"], basemap: "topo" });
    expect(parseMapPermalink("?basemap=missing", [])).toEqual({});
    expect(parseMapPermalink("?layers=missing", [])).toEqual({
      visibleLayerIds: [],
    });
  });

  it("serialises non-default layers in catalogue order", () => {
    const defaults = { visibleLayerIds: [], basemap: "positron" };
    expect(
      buildMapPermalinkSearch(
        { visibleLayerIds: ["two", "one"], basemap: "topo" },
        defaults,
        ["one", "two"],
      ),
    ).toBe("layers=one%2Ctwo&basemap=topo");
    expect(buildMapPermalinkSearch(defaults, defaults, [])).toBe("");
  });

  it("restores a basemap and drops obsolete parameters without a dataset load", () => {
    window.history.replaceState(
      null,
      "",
      "/?basemap=topo&panel=removed&feature=removed#map",
    );
    renderHook(() => useMapPermalink());
    expect(useMapUiStore.getState().basemap).toBe("topo");
    expect(window.location.search).toBe("?basemap=topo");
    expect(window.location.hash).toBe("#map");
    act(() => useMapUiStore.getState().setBasemap("positron"));
    expect(window.location.search).toBe("");
  });
});
