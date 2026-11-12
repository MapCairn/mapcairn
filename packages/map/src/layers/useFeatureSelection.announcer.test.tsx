// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type FeatureRef,
  MemoryFeatureSelection,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { THROTTLE_MS } from "../ui/LiveRegion/announcer";
import { useDataLayers } from "./useDataLayers";
import { useFeatureSelection } from "./useFeatureSelection";

/*
 * These tests use the real announcer, through `LiveRegionProvider`, on fake
 * timers, so its clock is the fake one: a message goes out at once or waits
 * for the end of its 600 ms window, exactly as in the app. They read what a
 * screen reader would be given, region by region.
 */

const FEED = SAMPLE_FEED_LAYER.id;
const ALERTS = SAMPLE_ALERT_LAYER.id;
const IMAGERY = SAMPLE_TILE_LAYER.id;

const ref = (layerId: string, featureId: string): FeatureRef => ({
  layerId,
  featureId,
});

/** Lets promises settle and moves the fake clock on. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Records each non-empty text a live region takes, in order. */
function listenTo(region: HTMLElement) {
  const heard: string[] = [];
  const observer = new MutationObserver(() => {
    const text = region.textContent ?? "";
    if (text !== "" && heard.at(-1) !== text) {
      heard.push(text);
    }
  });
  observer.observe(region, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  return { heard, stop: () => observer.disconnect() };
}

function setup(limit?: number) {
  const store = new MemoryFeatureSelection({ limit });
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(SAMPLE_LAYERS),
    selection: store,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LiveRegionProvider>
      <ServicesProvider services={services}>{children}</ServicesProvider>
    </LiveRegionProvider>
  );
  const view = renderHook(
    () => {
      const layers = useDataLayers({ now: () => Date.now() });
      return { layers, selection: useFeatureSelection(layers) };
    },
    { wrapper },
  );
  const selection = () => {
    const { current } = view.result;
    if (!current.selection) {
      throw new Error("The hook returned null.");
    }
    return current.selection;
  };
  /** Turns layers on with their features, waits out what they say, then starts listening. */
  const load = async (features: Readonly<Record<string, string[]>>) => {
    for (const [id, ids] of Object.entries(features)) {
      services.fakes.layerSource.setFeatures(
        id,
        ids.map((featureId) => samplePoint(featureId)),
      );
      act(() => view.result.current.layers.setEnabled(id, true));
    }
    await advance(THROTTLE_MS * 4);
  };
  const polite = listenTo(screen.getByRole("status"));
  const assertive = listenTo(screen.getByRole("alert"));
  return { ...view, store, selection, load, polite, assertive };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the selection's messages through the real announcer", () => {
  it("reads one message for a change, with the running total", async () => {
    const view = setup();
    await view.load({ [FEED]: ["a", "b"] });
    view.polite.heard.length = 0;
    act(() => view.selection().toggle(ref(FEED, "a")));
    await advance(0);
    expect(view.polite.heard).toEqual(["Added Point a. 1 selected."]);
    expect(screen.getByRole("status").textContent).toBe(
      "Added Point a. 1 selected.",
    );
  });

  it("keeps only the latest of three quick toggles, which still carries the true total", async () => {
    const view = setup();
    await view.load({ [FEED]: ["a", "b", "c"] });
    view.polite.heard.length = 0;
    act(() => {
      view.selection().toggle(ref(FEED, "a"));
      view.selection().toggle(ref(FEED, "b"));
      view.selection().toggle(ref(FEED, "c"));
    });
    await advance(0);
    expect(view.polite.heard).toEqual(["Added Point a. 1 selected."]);
    await advance(THROTTLE_MS);
    expect(view.polite.heard).toEqual([
      "Added Point a. 1 selected.",
      "Added Point c. 3 selected.",
    ]);
    expect(view.store.getState()).toHaveLength(3);
  });

  it("says nothing of its own when layers are turned off, and the next change follows the turning-off message", async () => {
    const view = setup();
    await view.load({ [FEED]: ["a"], [ALERTS]: ["b"], [IMAGERY]: [] });
    act(() => view.selection().add([ref(FEED, "a"), ref(ALERTS, "b")]));
    await advance(THROTTLE_MS * 4);
    view.polite.heard.length = 0;
    const held = view.store.getState();

    act(() => view.result.current.layers.turnOff([FEED, ALERTS, IMAGERY]));
    await advance(0);
    expect(view.polite.heard).toEqual(["3 layers turned off. Undo available"]);
    expect(view.store.getState()).toBe(held);

    act(() => view.selection().clear());
    await advance(0);
    expect(view.polite.heard).toEqual(["3 layers turned off. Undo available"]);
    await advance(THROTTLE_MS);
    expect(view.polite.heard).toEqual([
      "3 layers turned off. Undo available",
      "Selection cleared.",
    ]);
  });

  it("reads a refused batch assertively, so a later polite message cannot replace it", async () => {
    const view = setup(1);
    await view.load({ [FEED]: ["a", "b"] });
    view.polite.heard.length = 0;
    act(() => view.selection().toggle(ref(FEED, "a")));
    act(() => view.selection().toggle(ref(FEED, "b")));
    act(() => view.selection().toggle(ref(FEED, "a")));
    await advance(THROTTLE_MS);
    expect(view.assertive.heard).toEqual([
      "The selection holds 1 at most. Nothing was added.",
    ]);
    expect(view.polite.heard).toEqual([
      "Added Point a. 1 selected.",
      "Removed Point a. 0 selected.",
    ]);
  });
});
