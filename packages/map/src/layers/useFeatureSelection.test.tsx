// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createFormatterRegistry,
  FakeLayerCatalogue,
  type FeatureRef,
  type FormatterRegistry,
  type LayerDefinition,
  MemoryFeatureSelection,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { useDataLayers } from "./useDataLayers";
import { useFeatureSelection } from "./useFeatureSelection";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 12, 12);
const FEED = SAMPLE_FEED_LAYER.id;
const ALERTS = SAMPLE_ALERT_LAYER.id;
const IMAGERY = SAMPLE_TILE_LAYER.id;

const ref = (layerId: string, featureId: string): FeatureRef => ({
  layerId,
  featureId,
});

/** What has been said aloud, in order, with its priority. */
const said = () =>
  announce.mock.calls.map(([message, options]) => [
    message,
    options?.priority ?? "polite",
  ]);
const saidMessages = () => announce.mock.calls.map(([message]) => message);

interface SetupOptions {
  readonly store?: MemoryFeatureSelection | null;
  readonly definitions?: readonly LayerDefinition[];
  readonly formatters?: FormatterRegistry;
}

function setup({
  store = new MemoryFeatureSelection(),
  definitions = SAMPLE_LAYERS,
  formatters,
}: SetupOptions = {}) {
  const catalogue = new FakeLayerCatalogue(definitions);
  const services = createFakeServices({
    layers: catalogue,
    selection: store ?? undefined,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const view = renderHook(
    () => {
      const layers = useDataLayers({ now: () => NOW });
      return { layers, selection: useFeatureSelection(layers, { formatters }) };
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
  const statusOf = (id: string) =>
    view.result.current.layers.layers.find((item) => item.definition.id === id)
      ?.status.kind;
  /**
   * Turns a layer on with these features and waits for it to load, then
   * forgets what the layer said about it, so a test hears only the selection.
   */
  const load = async (id: string, ...ids: string[]) => {
    services.fakes.layerSource.setFeatures(
      id,
      ids.map((featureId) => samplePoint(featureId)),
    );
    act(() => view.result.current.layers.setEnabled(id, true));
    await waitFor(() => expect(statusOf(id)).toBe("ready"));
    announce.mockClear();
  };
  return { ...view, store, catalogue, services, selection, load, statusOf };
}

beforeEach(() => {
  announce.mockClear();
});

describe("useFeatureSelection without a store", () => {
  it("returns null when the host supplies none", () => {
    const view = setup({ store: null });
    expect(view.result.current.selection).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it("stays null, and quiet, while the layers change and the hook renders again", async () => {
    const view = setup({ store: null });

    await view.load("sample-points", "a");
    view.rerender();

    expect(view.result.current.selection).toBeNull();
    expect(saidMessages()).toEqual([]);
  });
});

describe("useFeatureSelection state", () => {
  it("starts empty with the store's limit, outside select mode", () => {
    const view = setup({ store: new MemoryFeatureSelection({ limit: 7 }) });
    expect(view.selection().entries).toEqual([]);
    expect(view.selection().limit).toBe(7);
    expect(view.selection().selecting).toBe(false);
  });

  it("holds the select-mode flag", () => {
    const view = setup();
    act(() => view.selection().setSelecting(true));
    expect(view.selection().selecting).toBe(true);
    act(() => view.selection().setSelecting(false));
    expect(view.selection().selecting).toBe(false);
  });

  it("resolves a selected reference to the feature its layer has loaded", async () => {
    const view = setup();
    await view.load(FEED, "a", "b");
    act(() => view.selection().toggle(ref(FEED, "b")));
    const [entry] = view.selection().entries;
    expect(entry?.status).toBe("shown");
    if (entry?.status === "shown") {
      expect(entry.feature.id).toBe("b");
      expect(entry.definition.id).toBe(FEED);
    }
  });

  it("follows a change made outside, such as hydration, without a message", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.store?.replaceExternally([ref(FEED, "a")]));
    expect(view.selection().entries.map((entry) => entry.status)).toEqual([
      "shown",
    ]);
    expect(announce).not.toHaveBeenCalled();
  });

  it("keeps a reference whose layer is off as not shown, and shows it once the layer loads", async () => {
    const store = new MemoryFeatureSelection();
    store.add([ref(FEED, "a")]);
    const view = setup({ store });
    expect(view.selection().entries).toEqual([
      { status: "not-shown", ref: ref(FEED, "a") },
    ]);
    await view.load(FEED, "a");
    expect(view.selection().entries[0]?.status).toBe("shown");
  });

  it("keeps showing a feature its layer stops listing, from the snapshot taken while it was listed", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    view.services.fakes.layerSource.setFeatures(FEED, [samplePoint("z")]);
    act(() => view.result.current.layers.setControl(FEED, "window", "hour"));
    await waitFor(() => expect(view.statusOf(FEED)).toBe("ready"));
    const [entry] = view.selection().entries;
    expect(entry?.status === "shown" && entry.feature.id).toBe("a");
    expect(
      view.result.current.layers.layers
        .find((item) => item.definition.id === FEED)
        ?.features.map((feature) => feature.id),
    ).toEqual(["z"]);
  });

  it("refers to a feature the layer lists again by what the layer now holds", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    view.services.fakes.layerSource.setFeatures(FEED, [
      samplePoint("a", { title: "Renamed" }),
    ]);
    act(() => view.result.current.layers.setControl(FEED, "window", "hour"));
    await waitFor(() => {
      const [entry] = view.selection().entries;
      expect(entry?.status === "shown" && entry.feature.fields.title).toBe(
        "Renamed",
      );
    });
  });
});

describe("useFeatureSelection when the map moves", () => {
  const area = (offset: number) => ({
    south: offset,
    west: offset,
    north: offset + 1,
    east: offset + 1,
  });

  it("keeps the same entries and state when a move changes nothing the selection depends on", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    const before = view.selection();
    const layersBefore = view.result.current.layers.layers;
    act(() => view.result.current.layers.setView(area(0), 5));
    act(() => view.result.current.layers.setView(area(10), 6));
    expect(view.result.current.layers.layers).not.toBe(layersBefore);
    expect(view.selection().entries).toBe(before.entries);
    expect(view.selection()).toBe(before);
  });

  it("makes new entries when a layer's features change", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    const before = view.selection().entries;
    view.services.fakes.layerSource.setFeatures(FEED, [
      samplePoint("a", { title: "Renamed" }),
    ]);
    act(() => view.result.current.layers.setControl(FEED, "window", "hour"));
    await waitFor(() => expect(view.selection().entries).not.toBe(before));
  });
});

describe("useFeatureSelection when layers turn off", () => {
  it("drops nothing: the references stay in the store and become not shown", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    const held = view.store?.getState();
    act(() => view.result.current.layers.setEnabled(FEED, false));
    expect(view.store?.getState()).toBe(held);
    expect(view.selection().entries).toEqual([
      { status: "not-shown", ref: ref(FEED, "a") },
    ]);
  });

  it("drops nothing and says nothing of its own when several layers are turned off together", async () => {
    const view = setup();
    await view.load(FEED, "a");
    await view.load(ALERTS, "b");
    act(() => {
      view.selection().add([ref(FEED, "a"), ref(ALERTS, "b")]);
    });
    announce.mockClear();
    const held = view.store?.getState();
    act(() => view.result.current.layers.turnOff([FEED, ALERTS, IMAGERY]));
    expect(view.store?.getState()).toBe(held);
    expect(saidMessages()).toEqual(["2 layers turned off. Undo available"]);
    expect(view.selection().entries.map((entry) => entry.status)).toEqual([
      "not-shown",
      "not-shown",
    ]);
  });

  it("shows the reference from its snapshot when Undo turns the layer back on, before it reloads", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    act(() => view.result.current.layers.turnOff([FEED]));
    expect(view.selection().entries[0]?.status).toBe("not-shown");
    act(() => view.result.current.layers.undoTurnOff());
    expect(view.selection().entries[0]?.status).toBe("shown");
    await waitFor(() => expect(view.statusOf(FEED)).toBe("ready"));
    expect(view.selection().entries[0]?.status).toBe("shown");
  });

  it("keeps a reference as not shown when its layer leaves the catalogue", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    act(() =>
      view.catalogue.setLayers(
        SAMPLE_LAYERS.filter((layer) => layer.id !== FEED),
      ),
    );
    expect(view.store?.getState()).toEqual([ref(FEED, "a")]);
    expect(view.selection().entries).toEqual([
      { status: "not-shown", ref: ref(FEED, "a") },
    ]);
  });
});

describe("useFeatureSelection messages", () => {
  it("names a feature it toggles on and off, with the total, once each", async () => {
    const view = setup();
    await view.load(FEED, "a", "b");
    act(() => view.selection().toggle(ref(FEED, "a")));
    act(() => view.selection().toggle(ref(FEED, "b")));
    act(() => view.selection().toggle(ref(FEED, "a")));
    expect(said()).toEqual([
      ["Added Point a. 1 selected.", "polite"],
      ["Added Point b. 2 selected.", "polite"],
      ["Removed Point a. 1 selected.", "polite"],
    ]);
  });

  it("names the feature with the host's formatters", async () => {
    const titled: LayerDefinition = {
      ...SAMPLE_FEED_LAYER,
      card: { ...SAMPLE_FEED_LAYER.card, title: "{title|upper}" },
    };
    const view = setup({
      definitions: [titled],
      formatters: createFormatterRegistry({
        upper: (value) => String(value).toUpperCase(),
      }),
    });
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    expect(saidMessages()).toEqual(["Added POINT A. 1 selected."]);
  });

  it("counts several features added together in one message", async () => {
    const view = setup();
    await view.load(FEED, "a", "b", "c");
    act(() =>
      view.selection().add([ref(FEED, "a"), ref(FEED, "b"), ref(FEED, "c")]),
    );
    expect(said()).toEqual([["3 features added. 3 selected.", "polite"]]);
  });

  it("counts only the features that were new", async () => {
    const view = setup();
    await view.load(FEED, "a", "b");
    act(() => view.selection().toggle(ref(FEED, "a")));
    announce.mockClear();
    act(() => view.selection().add([ref(FEED, "a"), ref(FEED, "b")]));
    expect(saidMessages()).toEqual(["Added Point b. 2 selected."]);
  });

  it("says nothing when every feature was already selected", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().toggle(ref(FEED, "a")));
    announce.mockClear();
    act(() => view.selection().add([ref(FEED, "a"), ref(FEED, "a")]));
    act(() => view.selection().add([]));
    expect(announce).not.toHaveBeenCalled();
  });

  it("counts a feature it cannot name, in the singular", async () => {
    const store = new MemoryFeatureSelection();
    const view = setup({ store });
    act(() => view.selection().add([ref(FEED, "never-loaded")]));
    expect(saidMessages()).toEqual(["1 feature added. 1 selected."]);
    announce.mockClear();
    act(() => view.selection().remove([ref(FEED, "never-loaded")]));
    expect(saidMessages()).toEqual(["1 feature removed. 0 selected."]);
  });

  it("counts several features removed together in one message", async () => {
    const view = setup();
    await view.load(FEED, "a", "b", "c");
    act(() =>
      view.selection().add([ref(FEED, "a"), ref(FEED, "b"), ref(FEED, "c")]),
    );
    announce.mockClear();
    act(() => view.selection().remove([ref(FEED, "a"), ref(FEED, "b")]));
    expect(said()).toEqual([["2 features removed. 1 selected.", "polite"]]);
  });

  it("says nothing when it removes what was not selected", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().remove([ref(FEED, "a")]));
    expect(announce).not.toHaveBeenCalled();
  });

  it("says when the selection was cleared, and nothing when it was already empty", async () => {
    const view = setup();
    await view.load(FEED, "a");
    act(() => view.selection().clear());
    expect(announce).not.toHaveBeenCalled();
    act(() => view.selection().toggle(ref(FEED, "a")));
    announce.mockClear();
    act(() => view.selection().clear());
    expect(said()).toEqual([["Selection cleared.", "polite"]]);
    expect(view.selection().entries).toEqual([]);
  });

  it("refuses a batch that passes the limit, changes nothing and says so assertively", async () => {
    const store = new MemoryFeatureSelection({ limit: 2 });
    const view = setup({ store });
    await view.load(FEED, "a", "b", "c");
    act(() => view.selection().toggle(ref(FEED, "a")));
    announce.mockClear();
    const held = store.getState();
    act(() => view.selection().add([ref(FEED, "b"), ref(FEED, "c")]));
    expect(store.getState()).toBe(held);
    expect(said()).toEqual([
      ["The selection holds 2 at most. Nothing was added.", "assertive"],
    ]);
  });

  it("refuses a toggle at the limit, and still lets a feature be removed", async () => {
    const store = new MemoryFeatureSelection({ limit: 1 });
    const view = setup({ store });
    await view.load(FEED, "a", "b");
    act(() => view.selection().toggle(ref(FEED, "a")));
    announce.mockClear();
    act(() => view.selection().toggle(ref(FEED, "b")));
    expect(store.getState()).toEqual([ref(FEED, "a")]);
    expect(saidMessages()).toEqual([
      "The selection holds 1 at most. Nothing was added.",
    ]);
    announce.mockClear();
    act(() => view.selection().toggle(ref(FEED, "a")));
    expect(saidMessages()).toEqual(["Removed Point a. 0 selected."]);
  });

  it("reports the total of a store that hydrated past its limit", async () => {
    const store = new MemoryFeatureSelection({ limit: 1 });
    const view = setup({ store });
    await view.load(FEED, "a", "b", "c");
    act(() => store.replaceExternally([ref(FEED, "a"), ref(FEED, "b")]));
    announce.mockClear();
    act(() => view.selection().toggle(ref(FEED, "c")));
    expect(saidMessages()).toEqual([
      "The selection holds 1 at most. Nothing was added.",
    ]);
    act(() => view.selection().toggle(ref(FEED, "a")));
    expect(saidMessages().at(-1)).toBe("Removed Point a. 1 selected.");
  });

  it("selects nothing in a layer that is not a feed layer, and says nothing", async () => {
    const view = setup();
    act(() => view.selection().toggle(ref(IMAGERY, "a")));
    act(() => view.selection().add([ref("gone", "a")]));
    expect(view.store?.getState()).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });
});
