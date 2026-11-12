// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  LayerError,
  SAMPLE_FEED_LAYER,
  SAMPLE_QUERY_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  errorKind,
  loadOutcome,
  outcomeOfFailure,
  outcomeOfFeatures,
} from "./loadOutcome";
import type { WantedLoad } from "./loadRequests";

const NOW = 1_000;
const points = (count: number) =>
  Array.from({ length: count }, (_, index) => samplePoint(`p${index}`));

describe("errorKind", () => {
  it("is the kind of a layer error, and invalid for anything else", () => {
    expect(errorKind(new LayerError("network"))).toBe("network");
    expect(errorKind(new Error("boom"))).toBe("invalid");
    expect(errorKind("boom")).toBe("invalid");
  });
});

describe("outcomeOfFeatures", () => {
  it("shows every feature of a feed, stamped, and says how many", () => {
    expect(outcomeOfFeatures(SAMPLE_FEED_LAYER, points(5), NOW)).toEqual({
      result: {
        status: { kind: "ready", count: 5, updatedAt: NOW },
        features: points(5),
      },
      spoken: {
        state: "ready",
        message: "Sample points: 5 shown on the map.",
        priority: "polite",
      },
    });
  });

  it("shows a query layer's features in full up to its cap", () => {
    const { result, spoken } = outcomeOfFeatures(
      SAMPLE_QUERY_LAYER,
      points(3),
      NOW,
    );
    expect(result.status).toEqual({ kind: "ready", count: 3, updatedAt: NOW });
    expect(spoken.state).toBe("ready");
  });

  it("draws only the first features of a query layer over its cap, and says so", () => {
    const { result, spoken } = outcomeOfFeatures(
      SAMPLE_QUERY_LAYER,
      points(4),
      NOW,
    );
    expect(result.status).toEqual({
      kind: "ready",
      count: 3,
      updatedAt: NOW,
      capped: true,
    });
    expect(result.features).toEqual(points(3));
    expect(spoken).toEqual({
      state: "capped",
      message: "Sample query: showing the first 3. Zoom in to see more.",
      priority: "polite",
    });
  });
});

describe("outcomeOfFailure", () => {
  it("is nothing for an aborted load", () => {
    expect(
      outcomeOfFailure(SAMPLE_FEED_LAYER, new LayerError("aborted"), NOW),
    ).toBeNull();
  });

  it("is an empty layer, in its own words, for an empty feed", () => {
    expect(
      outcomeOfFailure(SAMPLE_FEED_LAYER, new LayerError("empty"), NOW),
    ).toEqual({
      result: { status: { kind: "empty", updatedAt: NOW }, features: [] },
      spoken: {
        state: "empty",
        message: "Sample points: No sample points right now.",
        priority: "polite",
      },
    });
  });

  it("is an error, said assertively, for a failure", () => {
    expect(
      outcomeOfFailure(SAMPLE_FEED_LAYER, new LayerError("network"), NOW),
    ).toEqual({
      result: { status: { kind: "error", error: "network" }, features: [] },
      spoken: {
        state: "error",
        message:
          "Sample points could not load. Check your connection and try again.",
        priority: "assertive",
      },
    });
  });

  it("counts anything unexpected as an invalid response", () => {
    expect(
      outcomeOfFailure(SAMPLE_FEED_LAYER, new Error("boom"), NOW)?.result
        .status,
    ).toEqual({ kind: "error", error: "invalid" });
  });
});

describe("loadOutcome", () => {
  const wanted: WantedLoad = {
    id: SAMPLE_FEED_LAYER.id,
    definition: SAMPLE_FEED_LAYER,
    key: "key",
    controls: { window: "day" },
  };

  it("asks the source for the layer, its controls and the clock, and shows what comes back", async () => {
    const { fakes } = createFakeServices();
    fakes.layerSource.setFeatures(SAMPLE_FEED_LAYER.id, points(2));
    const signal = new AbortController().signal;
    const outcome = await loadOutcome(
      fakes.layerSource,
      wanted,
      () => NOW,
      signal,
    );
    expect(outcome?.result.status).toEqual({
      kind: "ready",
      count: 2,
      updatedAt: NOW,
    });
    expect(fakes.layerSource.requests[0]).toMatchObject({
      definition: SAMPLE_FEED_LAYER,
      controls: { window: "day" },
      now: NOW,
      signal,
    });
    expect("area" in (fakes.layerSource.requests[0] ?? {})).toBe(false);
  });

  it("passes on the window of a query layer", async () => {
    const { fakes } = createFakeServices();
    fakes.layerSource.setFeatures(SAMPLE_QUERY_LAYER.id, points(1));
    const area = { west: 1, south: 2, east: 3, north: 4 };
    await loadOutcome(
      fakes.layerSource,
      { ...wanted, definition: SAMPLE_QUERY_LAYER, area },
      () => NOW,
      new AbortController().signal,
    );
    expect(fakes.layerSource.requests[0]?.area).toEqual(area);
  });

  it("describes a failure, and says nothing for a load whose signal was aborted", async () => {
    const { fakes } = createFakeServices();
    fakes.layerSource.fail(SAMPLE_FEED_LAYER.id, "network");
    const failed = await loadOutcome(
      fakes.layerSource,
      wanted,
      () => NOW,
      new AbortController().signal,
    );
    expect(failed?.result.status).toEqual({ kind: "error", error: "network" });

    const controller = new AbortController();
    const hold = fakes.layerSource.hold();
    const aborted = loadOutcome(
      fakes.layerSource,
      wanted,
      () => NOW,
      controller.signal,
    );
    controller.abort();
    hold();
    expect(await aborted).toBeNull();
  });
});
