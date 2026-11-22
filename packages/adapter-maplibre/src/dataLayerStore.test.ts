// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapTileOverlay } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataLayerStore, type TileLayerReport } from "./dataLayerStore";
import { DataLayerTileRequests } from "./dataLayerTileRequests";
import { FakeMapLibreMap } from "./maplibreTestEngine";

const OVERLAY: MapTileOverlay = {
  tiles: "https://t.test/{z}/{x}/{y}.png",
  tileSize: 256,
  maxzoom: 9,
  opacity: 1,
};

const SHAPES = {
  geometries: [
    {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ] as const,
    },
  ],
  colour: "#d55e00",
};

/** A store over a fake engine map and a host that records what it is told. */
function setup(ready = true) {
  const engine = new FakeMapLibreMap({
    container: document.createElement("div"),
    style: "https://tiles.example/style",
    center: [0, 0],
    zoom: 1,
    bearing: 0,
  });
  engine.fire("style.load");
  const map = engine as unknown as MapLibreMap;
  const state = { ready };
  const carried = vi.fn<(source: string, tiles: string) => TileLayerReport>(
    () => "none",
  );
  const register = vi.fn();
  const release = vi.fn();
  const changed = vi.fn();
  const tileRequests = new DataLayerTileRequests();
  const store = new DataLayerStore({
    readyMap: () => (state.ready ? map : undefined),
    changed,
    tileSources: { carriedReport: carried, register, release },
    tileRequests,
  });
  return {
    engine,
    map,
    state,
    store,
    carried,
    register,
    release,
    changed,
    tileRequests,
  };
}

beforeEach(() => {
  FakeMapLibreMap.reset();
});

describe("DataLayerStore", () => {
  it("draws nothing until the host has a ready map, then draws what it keeps on restore", () => {
    const { engine, map, state, store, changed } = setup(false);
    store.set("area", { kind: "shapes", shapes: SHAPES });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(engine.sources.size).toBe(0);
    state.ready = true;
    store.restore(map);
    expect([...engine.sources.keys()]).toEqual(["mapcairn:area"]);
  });

  it("tells the host of a tile layer being set or drawn again with new tiles, but not of an opacity change or of removing one it never held", () => {
    const { engine, store, changed } = setup();
    store.setTiles("imagery", OVERLAY);
    expect(changed).toHaveBeenCalledTimes(1);
    store.setTiles("imagery", { ...OVERLAY, opacity: 0.5 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(engine.getLayer("mapcairn:imagery:tiles")?.paint).toMatchObject({
      "raster-opacity": 0.5,
    });
    store.setTiles("imagery", {
      ...OVERLAY,
      tiles: "https://t.test/b/{z}/{x}/{y}.png",
    });
    expect(changed).toHaveBeenCalledTimes(2);
    store.remove("missing");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("registers a drawn tile source with the report it carried, and releases it on erase", () => {
    const { store, carried, register, release, changed } = setup();
    carried.mockReturnValue("slow");
    store.setTiles("imagery", OVERLAY);
    expect(carried).toHaveBeenCalledWith("mapcairn:imagery", OVERLAY.tiles);
    expect(register).toHaveBeenCalledWith(
      "mapcairn:imagery",
      "imagery",
      OVERLAY.tiles,
      "slow",
    );
    store.remove("imagery");
    expect(release).toHaveBeenCalledWith("mapcairn:imagery");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("asks for the carried report before it releases the source it draws over", () => {
    const { store, carried, release } = setup();
    store.setTiles("imagery", OVERLAY);
    release.mockClear();
    store.setTiles("imagery", { ...OVERLAY, maxzoom: 10 });
    expect(carried.mock.invocationCallOrder.at(-1)).toBeLessThan(
      release.mock.invocationCallOrder[0] as number,
    );
  });

  it("keeps the template of a drawn tile layer and drops it when the layer is removed", () => {
    const { store, tileRequests } = setup();
    const tile = "https://t.test/3/2/5.png";
    store.setTiles("imagery", OVERLAY);
    expect(tileRequests.transform(tile).referrerPolicy).toBe("no-referrer");
    store.remove("imagery");
    expect(tileRequests.transform(tile).referrerPolicy).toBeUndefined();
  });

  it("releases a layer removed during a style swap when the swap finishes", () => {
    const { engine, map, state, store, release, tileRequests } = setup();
    const tile = "https://t.test/3/2/5.png";
    store.setTiles("imagery", OVERLAY);
    state.ready = false;
    store.remove("imagery");
    release.mockClear();
    state.ready = true;
    store.restore(map);
    expect(release).toHaveBeenCalledWith("mapcairn:imagery");
    expect(engine.sources.size).toBe(0);
    expect(engine.getLayer("mapcairn:imagery:tiles")).toBeUndefined();
    expect(tileRequests.transform(tile).referrerPolicy).toBeUndefined();
  });

  it("keeps no template for a layer that holds its own data", () => {
    const { store, tileRequests } = setup();
    store.set("area", { kind: "shapes", shapes: SHAPES });
    expect(
      tileRequests.transform("https://t.test/3/2/5.png").referrerPolicy,
    ).toBeUndefined();
  });

  it("registers no source for a layer that is not tiles", () => {
    const { store, carried, register } = setup();
    store.set("area", { kind: "shapes", shapes: SHAPES });
    expect(carried).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("finds no hits, and no tap, without a ready map", () => {
    const { store, state } = setup();
    store.set("area", { kind: "shapes", shapes: SHAPES });
    state.ready = false;
    expect(store.hitsAt(1, 1)).toEqual([]);
    expect(store.tapAt(1, 1)).toBeNull();
  });
});
