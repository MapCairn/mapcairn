// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SAMPLE_FEED_LAYER, SAMPLE_QUERY_LAYER } from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import type { Spoken } from "./loadOutcome";
import { type AnnouncedStates, reportLoad, reportZoomIn } from "./loadReport";

const ready: Spoken = { state: "ready", message: "Ready.", priority: "polite" };
const failed: Spoken = {
  state: "error",
  message: "Failed.",
  priority: "assertive",
};

describe("reportLoad", () => {
  it("says what a feed layer found each time, at the priority it asks for", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    reportLoad(SAMPLE_FEED_LAYER, ready, announced, announce);
    reportLoad(SAMPLE_FEED_LAYER, ready, announced, announce);
    reportLoad(SAMPLE_FEED_LAYER, failed, announced, announce);
    expect(announce.mock.calls).toEqual([
      ["Ready.", { priority: "polite" }],
      ["Ready.", { priority: "polite" }],
      ["Failed.", { priority: "assertive" }],
    ]);
  });

  it("says a query layer's state once, until it says another", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    reportLoad(SAMPLE_QUERY_LAYER, ready, announced, announce);
    reportLoad(SAMPLE_QUERY_LAYER, ready, announced, announce);
    expect(announce).toHaveBeenCalledTimes(1);
    reportLoad(SAMPLE_QUERY_LAYER, failed, announced, announce);
    reportLoad(SAMPLE_QUERY_LAYER, ready, announced, announce);
    expect(announce).toHaveBeenCalledTimes(3);
    expect(announced.get(SAMPLE_QUERY_LAYER.id)).toBe("ready");
  });
});

describe("reportZoomIn", () => {
  it("tells a layer to zoom in once, until it says something else", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    reportZoomIn(SAMPLE_QUERY_LAYER, announced, announce);
    reportZoomIn(SAMPLE_QUERY_LAYER, announced, announce);
    expect(announce.mock.calls).toEqual([
      ["Sample query: zoom in to load this layer.", { priority: "polite" }],
    ]);
    reportLoad(SAMPLE_QUERY_LAYER, ready, announced, announce);
    reportZoomIn(SAMPLE_QUERY_LAYER, announced, announce);
    expect(announce).toHaveBeenCalledTimes(3);
  });
});
