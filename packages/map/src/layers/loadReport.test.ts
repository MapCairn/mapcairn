// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import type { Spoken } from "./loadOutcome";
import {
  type AnnouncedStates,
  reportLoad,
  reportZoomLimits,
} from "./loadReport";

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

describe("reportZoomLimits", () => {
  const zoomIn = {
    definition: SAMPLE_QUERY_LAYER,
    limit: { kind: "zoom-in", level: 4 },
  } as const;
  const zoomOut = {
    definition: SAMPLE_VECTOR_LAYER,
    limit: { kind: "zoom-out", level: 18 },
  } as const;

  it("tells a layer which level to zoom to, once, until it says something else", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    reportZoomLimits([zoomIn, zoomOut], announced, announce);
    reportZoomLimits([zoomIn, zoomOut], announced, announce);
    expect(announce.mock.calls).toEqual([
      [
        "Sample query: zoom in to level 4 or closer to load this layer.",
        { priority: "polite" },
      ],
      [
        "Sample districts: zoom out below level 18 to see this layer.",
        { priority: "polite" },
      ],
    ]);
    reportLoad(SAMPLE_QUERY_LAYER, ready, announced, announce);
    reportZoomLimits([zoomIn], announced, announce);
    expect(announce).toHaveBeenCalledTimes(4);
  });

  it("says a layer that crosses its whole window from one limit to the other", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    const layer = SAMPLE_VECTOR_LAYER;
    reportZoomLimits(
      [{ definition: layer, limit: { kind: "zoom-in", level: 2 } }],
      announced,
      announce,
    );
    reportZoomLimits(
      [{ definition: layer, limit: { kind: "zoom-out", level: 18 } }],
      announced,
      announce,
    );
    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      "Sample districts: zoom in to level 2 or closer to load this layer.",
      "Sample districts: zoom out below level 18 to see this layer.",
    ]);
  });

  it("says a limit again once the layer has been back inside its window", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    reportZoomLimits([zoomOut], announced, announce);
    reportZoomLimits([], announced, announce);
    expect(announced.has(SAMPLE_VECTOR_LAYER.id)).toBe(false);
    reportZoomLimits([zoomOut], announced, announce);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("leaves what a layer said about a load alone when no limit holds", () => {
    const announce = vi.fn();
    const announced: AnnouncedStates = new Map();
    reportLoad(SAMPLE_QUERY_LAYER, ready, announced, announce);
    reportZoomLimits([], announced, announce);
    expect(announced.get(SAMPLE_QUERY_LAYER.id)).toBe("ready");
  });
});
