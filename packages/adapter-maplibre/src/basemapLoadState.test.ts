// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { BasemapLoadState } from "./basemapLoadState";
import { ENGINE_ID_PREFIX } from "./dataLayerPlan";

function mapWith(sources: Record<string, boolean>): MapLibreMap {
  return {
    getStyle: () => ({ sources }),
    getSource: (id: string) => (id in sources ? {} : undefined),
    isSourceLoaded: (id: string) => sources[id],
  } as unknown as MapLibreMap;
}

describe("BasemapLoadState", () => {
  it("is not in before a style has loaded, or without a map", () => {
    const state = new BasemapLoadState();
    expect(state.isIn(mapWith({}))).toBe(false);
    state.styleLoaded(mapWith({ planet: true }));
    expect(state.isIn(undefined)).toBe(false);
  });

  it("is in once every source of the basemap's own says so", () => {
    const state = new BasemapLoadState();
    state.startStyleLoad();
    const loading = mapWith({ a: true, b: false });
    state.styleLoaded(loading);
    expect(state.isIn(loading)).toBe(false);
    expect(state.isIn(mapWith({ a: true, b: true }))).toBe(true);
  });

  it("ignores a data layer's source, which may never answer", () => {
    const state = new BasemapLoadState();
    const map = mapWith({ planet: true, [`${ENGINE_ID_PREFIX}x`]: false });
    state.styleLoaded(map);
    expect(state.isIn(map)).toBe(true);
  });

  it("is in only after the engine goes idle when the style has no source", () => {
    const state = new BasemapLoadState();
    const map = mapWith({});
    state.startStyleLoad();
    state.styleLoaded(map);
    expect(state.isIn(map)).toBe(false);
    state.idle(map);
    expect(state.isIn(map)).toBe(true);
  });

  it("is not in while a new style is arriving", () => {
    const state = new BasemapLoadState();
    const map = mapWith({ planet: true });
    state.styleLoaded(map);
    state.startStyleLoad();
    expect(state.isIn(map)).toBe(false);
    state.idle(map);
    expect(state.isIn(map)).toBe(true);
  });

  it("publishes the busy state only when it changes", () => {
    const state = new BasemapLoadState();
    expect(state.loading).toBe(false);
    expect(state.publish(false)).toBe(false);
    expect(state.publish(true)).toBe(true);
    expect(state.loading).toBe(true);
    expect(state.publish(true)).toBe(false);
  });
});
