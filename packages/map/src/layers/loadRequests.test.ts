// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  type LayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  isTooFarOut,
  type LoadInputs,
  planLoads,
  type QueryView,
  rememberWindows,
  type WantedLoad,
  wantedLoads,
} from "./loadRequests";

const NOW = Date.UTC(2026, 10, 9, 12);
const AREA: Bounds = { west: 2.2, south: 48.8, east: 2.5, north: 48.95 };
const NEAR: QueryView = { area: AREA, zoom: 12 };
const FAR: QueryView = { area: AREA, zoom: 3 };
const definitions = new Map<string, LayerDefinition>(
  SAMPLE_LAYERS.map((definition) => [definition.id, definition]),
);
definitions.set(SAMPLE_QUERY_LAYER.id, SAMPLE_QUERY_LAYER);

function inputs(overrides: Partial<LoadInputs>): LoadInputs {
  return {
    enabled: [],
    definitions,
    controls: {},
    retries: {},
    view: null,
    windows: new Map(),
    now: NOW,
    ...overrides,
  };
}

function load(id: string, key: string): WantedLoad {
  return {
    id,
    key,
    definition: SAMPLE_FEED_LAYER,
    controls: {},
  };
}

describe("isTooFarOut", () => {
  it("is true for a query layer below its own zoom, once the view is known", () => {
    expect(isTooFarOut(SAMPLE_QUERY_LAYER, FAR)).toBe(true);
    expect(isTooFarOut(SAMPLE_QUERY_LAYER, NEAR)).toBe(false);
    expect(isTooFarOut(SAMPLE_QUERY_LAYER, null)).toBe(false);
  });

  it("is false for a layer that is not a query layer", () => {
    expect(isTooFarOut(SAMPLE_FEED_LAYER, FAR)).toBe(false);
    expect(isTooFarOut(SAMPLE_TILE_LAYER, FAR)).toBe(false);
  });
});

describe("wantedLoads", () => {
  it("wants a feed layer's request, keyed by its URL and retries", () => {
    const [wanted] = wantedLoads(
      inputs({
        enabled: ["sample-points"],
        controls: { "sample-points": { window: "hour", small: "false" } },
        retries: { "sample-points": 2 },
      }),
    );
    expect(wanted?.key).toBe("https://sample.test/feed/all_hour.json#2");
    expect(wanted?.controls).toEqual({ window: "hour", small: "false" });
    expect(wanted).not.toHaveProperty("area");
  });

  it("wants nothing for a layer that is off, unknown or loads no features", () => {
    expect(
      wantedLoads(inputs({ enabled: ["nothing-here", "sample-imagery"] })),
    ).toEqual([]);
  });

  it("wants nothing of a query layer until the view is known, or while it is too far out", () => {
    const enabled = [SAMPLE_QUERY_LAYER.id];
    expect(wantedLoads(inputs({ enabled, view: null }))).toEqual([]);
    expect(wantedLoads(inputs({ enabled, view: FAR }))).toEqual([]);
  });

  it("wants a window around the view for a query layer", () => {
    const [wanted] = wantedLoads(
      inputs({ enabled: [SAMPLE_QUERY_LAYER.id], view: NEAR }),
    );
    expect(wanted?.area?.west).toBeLessThanOrEqual(AREA.west);
    expect(wanted?.key).toMatch(/^https:\/\/query\.test\/items\?bbox=.+#0$/);
  });

  it("keeps the window it had while the view stays inside it", () => {
    const window = { west: 2, south: 48.5, east: 2.8, north: 49.2 };
    const [wanted] = wantedLoads(
      inputs({
        enabled: [SAMPLE_QUERY_LAYER.id],
        view: NEAR,
        windows: new Map([[SAMPLE_QUERY_LAYER.id, window]]),
      }),
    );
    expect(wanted?.area).toBe(window);
  });

  it("does not remember the window it chose: it changes nothing it was given", () => {
    const windows = new Map<string, Bounds>();
    wantedLoads(
      inputs({ enabled: [SAMPLE_QUERY_LAYER.id], view: NEAR, windows }),
    );
    expect(windows.size).toBe(0);
  });
});

describe("rememberWindows", () => {
  it("keeps the window of each load that asks for one, and forgets the rest", () => {
    const windows = new Map<string, Bounds>([
      ["gone", AREA],
      ["replaced", AREA],
    ]);
    const replacement = { ...AREA, west: 1 };
    rememberWindows(windows, [
      load("a-feed", "key"),
      { ...load("replaced", "key"), area: replacement },
    ]);
    expect([...windows]).toEqual([["replaced", replacement]]);
  });
});

describe("planLoads", () => {
  it("starts a load for a layer with nothing in flight or settled", () => {
    const wanted = load("a", "a#0");
    expect(planLoads([wanted], new Map(), new Map())).toEqual({
      cancel: [],
      forget: [],
      start: [wanted],
    });
  });

  it("leaves a request alone that is in flight for the key that is wanted", () => {
    expect(
      planLoads(
        [load("a", "a#0")],
        new Map([["a", { key: "a#0" }]]),
        new Map(),
      ),
    ).toEqual({ cancel: [], forget: [], start: [] });
  });

  it("does not load a layer again that has settled for the key that is wanted", () => {
    expect(
      planLoads([load("a", "a#0")], new Map(), new Map([["a", "a#0"]])),
    ).toEqual({ cancel: [], forget: [], start: [] });
  });

  it("cancels a request for a key that has changed, and starts the new one", () => {
    const wanted = load("a", "a#1");
    expect(
      planLoads([wanted], new Map([["a", { key: "a#0" }]]), new Map()),
    ).toEqual({ cancel: ["a"], forget: [], start: [wanted] });
  });

  it("forgets a settled key that has changed, and starts the new one", () => {
    const wanted = load("a", "a#1");
    expect(planLoads([wanted], new Map(), new Map([["a", "a#0"]]))).toEqual({
      cancel: [],
      forget: ["a"],
      start: [wanted],
    });
  });

  it("cancels and forgets a layer that is no longer wanted at all", () => {
    expect(
      planLoads([], new Map([["a", { key: "a#0" }]]), new Map([["b", "b#0"]])),
    ).toEqual({ cancel: ["a"], forget: ["b"], start: [] });
  });
});
