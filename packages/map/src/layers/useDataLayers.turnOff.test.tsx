// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  type FakeServices,
  type LayerDefinition,
  type LayerRegistry,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { UNDO_TIMEOUT_MS, useDataLayers } from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 9, 12);
const FEED = SAMPLE_FEED_LAYER.id;
const ALERTS = SAMPLE_ALERT_LAYER.id;
const IMAGERY = SAMPLE_TILE_LAYER.id;

/** What has been said aloud, in order. */
const said = () => announce.mock.calls.map(([message]) => message);

/** A catalogue a test can change between renders, as a host that loads layers later would. */
function changeableRegistry(definitions: readonly LayerDefinition[]) {
  let current = definitions;
  const registry: LayerRegistry = { list: () => current };
  return {
    registry,
    replace: (next: readonly LayerDefinition[]) => {
      current = next;
    },
  };
}

function setup(definitions: readonly LayerDefinition[] = SAMPLE_LAYERS) {
  const catalogue = changeableRegistry(definitions);
  const services: FakeServices = createFakeServices({
    layers: catalogue.registry,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const renders: ReturnType<typeof useDataLayers>[] = [];
  const view = renderHook(
    () => {
      const layers = useDataLayers({ now: () => NOW });
      renders.push(layers);
      return layers;
    },
    { wrapper },
  );
  return { ...view, renders, catalogue, source: services.fakes.layerSource };
}

type Handle = ReturnType<typeof setup>;

const enabledIds = (view: Handle) =>
  view.result.current.layers
    .filter((item) => item.enabled)
    .map((item) => item.definition.id);

/** Turns on the three sample layers, then forgets what that said. */
async function withAllOn(view: Handle) {
  view.source.setFeatures(FEED, [samplePoint("a")]);
  view.source.setFeatures(ALERTS, [samplePoint("b")]);
  act(() => {
    for (const id of [FEED, ALERTS, IMAGERY]) {
      view.result.current.setEnabled(id, true);
    }
  });
  await waitFor(() =>
    expect(
      view.result.current.layers.find((item) => item.definition.id === FEED)
        ?.status.kind,
    ).toBe("ready"),
  );
  await waitFor(() =>
    expect(
      view.result.current.layers.find((item) => item.definition.id === ALERTS)
        ?.status.kind,
    ).toBe("ready"),
  );
  announce.mockClear();
}

beforeEach(() => {
  announce.mockClear();
});

describe("useDataLayers turnOff", () => {
  it("turns every given layer off in one state change", async () => {
    const view = setup();
    await withAllOn(view);
    const before = view.renders.length;
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    expect(enabledIds(view)).toEqual([]);
    expect(view.renders.length - before).toBe(1);
  });

  it("changes the address value once, from all three layers to none", async () => {
    const view = setup();
    await withAllOn(view);
    const before = view.renders.length;
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    const values = new Set(
      view.renders.slice(before).map((layers) => layers.urlValue),
    );
    expect([...values]).toEqual([{ enabled: [], controls: {} }]);
  });

  it("announces once, with the count of layers that were on", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    expect(said()).toEqual(["3 layers turned off"]);
    expect(announce).toHaveBeenCalledWith("3 layers turned off", {
      priority: "polite",
    });
  });

  it("uses the singular for one layer", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([ALERTS]));
    expect(said()).toEqual(["1 layer turned off"]);
  });

  it("leaves the layers that were not asked for on", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS]));
    expect(enabledIds(view)).toEqual([IMAGERY]);
  });

  it("counts and acts on only the layers that are on, and ignores unknown ids", async () => {
    const view = setup();
    act(() => view.result.current.setEnabled(IMAGERY, true));
    announce.mockClear();
    act(() => view.result.current.turnOff([FEED, IMAGERY, "no-such-layer"]));
    expect(enabledIds(view)).toEqual([]);
    expect(said()).toEqual(["1 layer turned off"]);
    expect(view.result.current.turnedOff).toEqual({ count: 1, group: null });
  });

  it("does nothing, and offers no Undo, when none of the layers is on", () => {
    const view = setup();
    const before = view.renders.length;
    act(() => view.result.current.turnOff([FEED, ALERTS]));
    expect(view.renders.length).toBe(before);
    expect(view.result.current.turnedOff).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it("closes the open card, the list of choices and the affected area of the layers it turns off", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.select(FEED, "a"));
    expect(view.result.current.selected?.layer.definition.id).toBe(FEED);
    act(() =>
      view.result.current.choose([
        { layerId: FEED, featureId: "a" },
        { layerId: ALERTS, featureId: "b" },
      ]),
    );
    expect(view.result.current.choices).toHaveLength(2);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    expect(view.result.current.selected).toBeNull();
    expect(view.result.current.choices).toBeNull();
    expect(view.result.current.detail).toBeNull();
  });

  it("keeps the card of a layer it leaves on", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.select(ALERTS, "b"));
    act(() => view.result.current.turnOff([FEED, IMAGERY]));
    expect(view.result.current.selected?.layer.definition.id).toBe(ALERTS);
  });

  it("removes the credit of every layer it turns off", async () => {
    const view = setup();
    await withAllOn(view);
    expect(view.result.current.credits.length).toBeGreaterThan(0);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    expect(view.result.current.credits).toEqual([]);
  });

  it("records which group the action came from", async () => {
    const view = setup();
    await withAllOn(view);
    act(() =>
      view.result.current.turnOff([FEED, ALERTS], { group: "Samples" }),
    );
    expect(view.result.current.turnedOff).toEqual({
      count: 2,
      group: "Samples",
    });
  });
});

describe("useDataLayers undoTurnOff", () => {
  it("turns the same layers back on, with the control values they had", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.setControl(FEED, "window", "hour"));
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    announce.mockClear();
    act(() => view.result.current.undoTurnOff());
    expect(enabledIds(view).sort()).toEqual([ALERTS, FEED, IMAGERY].sort());
    expect(
      view.result.current.layers.find((item) => item.definition.id === FEED)
        ?.controls,
    ).toMatchObject({ window: "hour" });
    expect(view.result.current.urlValue.controls[FEED]).toMatchObject({
      window: "hour",
    });
  });

  it("says once how many it turned back on, and offers no second Undo", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    announce.mockClear();
    act(() => view.result.current.undoTurnOff());
    expect(said()).toEqual(["3 layers turned back on"]);
    expect(view.result.current.turnedOff).toBeNull();
    act(() => view.result.current.undoTurnOff());
    expect(said()).toEqual(["3 layers turned back on"]);
  });

  it("loads the feed layers again when they come back", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    act(() => view.result.current.undoTurnOff());
    await waitFor(() =>
      expect(
        view.result.current.layers.find((item) => item.definition.id === FEED)
          ?.status.kind,
      ).toBe("ready"),
    );
  });

  it("does not touch a layer the person turned on again meanwhile, and counts only the rest", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    act(() => view.result.current.setEnabled(IMAGERY, true));
    act(() => view.result.current.setControl(IMAGERY, "date", "2026-11-01"));
    announce.mockClear();
    act(() => view.result.current.undoTurnOff());
    expect(enabledIds(view).sort()).toEqual([ALERTS, FEED, IMAGERY].sort());
    expect(
      view.result.current.layers.find((item) => item.definition.id === IMAGERY)
        ?.controls,
    ).toMatchObject({ date: "2026-11-01" });
    expect(said()).toEqual(["2 layers turned back on"]);
  });

  it("stays offered after the person switches another layer, and restores only its own layers", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS]));
    act(() => view.result.current.setEnabled(IMAGERY, false));
    expect(view.result.current.turnedOff).toEqual({ count: 2, group: null });
    act(() => view.result.current.undoTurnOff());
    expect(enabledIds(view).sort()).toEqual([ALERTS, FEED].sort());
  });

  it("says nothing, and clears the offer, when every layer is already back on", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([ALERTS]));
    act(() => view.result.current.setEnabled(ALERTS, true));
    announce.mockClear();
    act(() => view.result.current.undoTurnOff());
    expect(announce).not.toHaveBeenCalled();
    expect(view.result.current.turnedOff).toBeNull();
  });

  it("skips a layer that is no longer in the catalogue", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED, ALERTS, IMAGERY]));
    view.catalogue.replace([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]);
    view.rerender();
    announce.mockClear();
    act(() => view.result.current.undoTurnOff());
    expect(enabledIds(view).sort()).toEqual([FEED, IMAGERY].sort());
    expect(view.result.current.urlValue.enabled).not.toContain(ALERTS);
    expect(said()).toEqual(["2 layers turned back on"]);
  });

  it("does nothing when there is nothing to undo", () => {
    const view = setup();
    const before = view.renders.length;
    act(() => view.result.current.undoTurnOff());
    expect(view.renders.length).toBe(before);
    expect(announce).not.toHaveBeenCalled();
  });

  it("is replaced by the next batch: Undo then restores only the newest", async () => {
    const view = setup();
    await withAllOn(view);
    act(() => view.result.current.turnOff([FEED]));
    act(() => view.result.current.turnOff([ALERTS, IMAGERY]));
    expect(view.result.current.turnedOff).toEqual({ count: 2, group: null });
    act(() => view.result.current.undoTurnOff());
    expect(enabledIds(view).sort()).toEqual([ALERTS, IMAGERY].sort());
  });
});

describe("useDataLayers Undo timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Two tile layers that need no request, so the clock is the only async thing. */
  function withTileLayers() {
    const view = setup([SAMPLE_TILE_LAYER]);
    act(() => view.result.current.setEnabled(IMAGERY, true));
    act(() => view.result.current.turnOff([IMAGERY]));
    return view;
  }

  it("offers the Undo for a few seconds, then lets it go", () => {
    const view = withTileLayers();
    expect(UNDO_TIMEOUT_MS).toBeGreaterThanOrEqual(6000);
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS - 1);
    });
    expect(view.result.current.turnedOff).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.result.current.turnedOff).toBeNull();
  });

  it("does nothing when Undo is used after it expired", () => {
    const view = withTileLayers();
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    announce.mockClear();
    act(() => view.result.current.undoTurnOff());
    expect(enabledIds(view)).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it("waits while the offer is held, and starts again in full when it is released", () => {
    const view = withTileLayers();
    act(() => view.result.current.holdUndo());
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS * 3);
    });
    expect(view.result.current.turnedOff).not.toBeNull();
    act(() => view.result.current.releaseUndo());
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS - 1);
    });
    expect(view.result.current.turnedOff).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.result.current.turnedOff).toBeNull();
  });

  it("gives a replacing batch its own full time", () => {
    const view = setup([SAMPLE_TILE_LAYER, SAMPLE_ALERT_LAYER]);
    act(() => view.result.current.setEnabled(IMAGERY, true));
    act(() => view.result.current.turnOff([IMAGERY]));
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS - 1000);
    });
    act(() => view.result.current.setEnabled(IMAGERY, true));
    act(() => view.result.current.turnOff([IMAGERY]));
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS - 1000);
    });
    expect(view.result.current.turnedOff).not.toBeNull();
  });
});
