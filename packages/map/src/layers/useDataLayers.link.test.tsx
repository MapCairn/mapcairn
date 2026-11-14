// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  createStaticLayerCatalogue,
  defaultControlValues,
  FakeLayerCatalogue,
  type FakeServices,
  type LayerCatalogue,
  type LayerDefinition,
  type LayersUrlState,
  parseUrlHash,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Fragment, type ReactNode, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { useDataLayers } from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 9, 12);
const POINTS = SAMPLE_FEED_LAYER.id;
const ALERTS = SAMPLE_ALERT_LAYER.id;
const IMAGERY = SAMPLE_TILE_LAYER.id;
const LAYERS = [SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER, SAMPLE_TILE_LAYER];
const LINK: LayersUrlState = {
  enabled: [POINTS, IMAGERY],
  controls: { [POINTS]: { window: "hour", small: "maybe" } },
};

/** The address while `LINK` waits: its layers, with its values as written and none for a layer that gave none. */
const WAITING_URL: LayersUrlState = {
  enabled: LINK.enabled,
  controls: { ...LINK.controls, [IMAGERY]: {} },
};

/** What has been said aloud, in order. */
const said = () => announce.mock.calls.map(([message]) => message);

beforeEach(() => {
  announce.mockClear();
});

function render(
  catalogue: LayerCatalogue,
  initial?: LayersUrlState,
  Shell: typeof StrictMode | typeof Fragment = Fragment,
) {
  const services: FakeServices = createFakeServices({ layers: catalogue });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Shell>
      <ServicesProvider services={services}>{children}</ServicesProvider>
    </Shell>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW, initial }), {
    wrapper,
  });
  return { ...view, services, source: services.fakes.layerSource };
}

/** A fake catalogue that is still loading, so nothing is listed until the test lists it. */
function loadingCatalogue() {
  const catalogue = new FakeLayerCatalogue();
  catalogue.setState({ status: "loading" });
  return catalogue;
}

const idsOn = (result: { current: ReturnType<typeof useDataLayers> }) =>
  result.current.layers
    .filter((layer) => layer.enabled)
    .map((layer) => layer.definition.id);

function layer(
  result: { current: ReturnType<typeof useDataLayers> },
  id: string,
) {
  const found = result.current.layers.find((item) => item.definition.id === id);
  if (!found) {
    throw new Error(`No layer ${id}`);
  }
  return found;
}

describe("a layer the link names while the catalogue loads", () => {
  it("waits, and is on once the catalogue is ready, with its control values resolved", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, LINK);
    expect(result.current.layers).toEqual([]);
    act(() => catalogue.setLayers(LAYERS));
    expect(idsOn(result)).toEqual([POINTS, IMAGERY]);
    expect(layer(result, POINTS).controls).toEqual({
      window: "hour",
      small: "false",
    });
  });

  it("keeps the layers it waits for in the address, with the link's own values", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, LINK);
    expect(result.current.urlValue).toEqual(WAITING_URL);
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    expect(result.current.urlValue).toEqual(WAITING_URL);
  });

  it("keeps the same address object while it waits, so the address is not written again", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, LINK);
    const before = result.current.urlValue;
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    expect(result.current.urlValue).toBe(before);
  });

  it("resolves the waiting layers when a refresh from a failed catalogue succeeds", async () => {
    const load = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(LAYERS);
    const catalogue = createRuntimeLayerCatalogue({
      load,
      options: {
        decoders: createDecoderRegistry(),
        formatters: createFormatterRegistry(),
      },
    });
    const { result } = render(catalogue, LINK);
    await waitFor(() => expect(catalogue.getState().status).toBe("failed"));
    expect(result.current.layers).toEqual([]);
    expect(result.current.urlValue).toEqual(WAITING_URL);
    await act(async () => catalogue.refresh());
    expect(idsOn(result)).toEqual([POINTS, IMAGERY]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("starts the waiting feed layer's load once it is listed", async () => {
    const catalogue = loadingCatalogue();
    const { result, source } = render(catalogue, LINK);
    source.setFeatures(POINTS, [samplePoint("a")]);
    act(() => catalogue.setLayers(LAYERS));
    await waitFor(() => expect(layer(result, POINTS).features).toHaveLength(1));
  });

  it("keeps the link's 20 layers waiting, which is as many as a link carries, and turns none on while there are no layers", () => {
    const ids = Array.from({ length: 25 }, (_, index) => `layer-${index}`);
    const initial = parseUrlHash(`#layers=${ids.join(",")}`).layers;
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, initial);
    expect(result.current.urlValue.enabled).toHaveLength(20);
    act(() => result.current.setEnabled(ids[24] as string, true));
    act(() => result.current.setEnabled(POINTS, true));
    expect(result.current.urlValue.enabled).toEqual(ids.slice(0, 20));
  });

  it("does nothing when the hook unmounts while the catalogue is still pending", () => {
    const catalogue = loadingCatalogue();
    const { unmount } = render(catalogue, LINK);
    announce.mockClear();
    unmount();
    expect(() => act(() => catalogue.setLayers(LAYERS))).not.toThrow();
    expect(said()).toEqual([]);
  });
});

describe("a link layer the catalogue does not have", () => {
  const unknown: LayersUrlState = {
    enabled: [POINTS, "retired", "other"],
    controls: { retired: { window: "day" } },
  };

  it("is dropped once the catalogue is ready, from the address too, and named once", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, unknown);
    expect(said()).toEqual(["Loading layers"]);
    expect(announce).toHaveBeenCalledWith("Loading layers", {
      priority: "polite",
      keep: false,
    });
    act(() => catalogue.setLayers(LAYERS));
    expect(idsOn(result)).toEqual([POINTS]);
    expect(result.current.urlValue.enabled).toEqual([POINTS]);
    expect(result.current.urlValue.controls).not.toHaveProperty("retired");
    expect(said()).toEqual([
      "Loading layers",
      "2 layers in the link are not available.",
    ]);
    expect(announce).toHaveBeenCalledWith(expect.any(String), {
      priority: "polite",
      keep: true,
    });
  });

  it("is said once under StrictMode, which renders twice", () => {
    const catalogue = loadingCatalogue();
    render(catalogue, unknown, StrictMode);
    announce.mockClear();
    act(() => catalogue.setLayers(LAYERS));
    expect(said()).toEqual(["2 layers in the link are not available."]);
  });

  it("says a single one in the singular", () => {
    const catalogue = loadingCatalogue();
    render(catalogue, { enabled: ["retired"], controls: {} });
    announce.mockClear();
    act(() => catalogue.setLayers(LAYERS));
    expect(said()).toEqual(["1 layer in the link is not available."]);
  });

  it("stays dropped when a later refresh lists it", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, {
      enabled: ["retired"],
      controls: {},
    });
    act(() => catalogue.setLayers(LAYERS));
    act(() =>
      catalogue.setLayers([
        ...LAYERS,
        { ...SAMPLE_ALERT_LAYER, id: "retired" },
      ]),
    );
    expect(idsOn(result)).toEqual([]);
    expect(result.current.urlValue.enabled).toEqual([]);
    expect(said()).toEqual([
      "Loading layers",
      "1 layer in the link is not available.",
      "Layers updated: 1 added.",
    ]);
  });

  it("is dropped without a word from a catalogue that was ready from the start", () => {
    const { result } = render(new FakeLayerCatalogue(LAYERS), unknown);
    expect(idsOn(result)).toEqual([POINTS]);
    expect(result.current.urlValue.enabled).toEqual([POINTS]);
    expect(said()).toEqual([]);
  });

  it("is dropped without a word from a static catalogue", () => {
    const catalogue = createStaticLayerCatalogue(LAYERS, {
      decoders: createDecoderRegistry(),
      formatters: createFormatterRegistry(),
    });
    const { result } = render(catalogue, unknown);
    expect(idsOn(result)).toEqual([POINTS]);
    expect(said()).toEqual([]);
  });
});

describe("layers a link carries past the limit of 20", () => {
  const ids = Array.from({ length: 25 }, (_, index) => `layer-${index}`);
  const link = () => parseUrlHash(`#layers=${ids.join(",")}`).layers;
  const listed = (count: number): LayerDefinition[] =>
    ids.slice(0, count).map((id) => ({ ...SAMPLE_ALERT_LAYER, id }));

  it("are said once with the layers the list does not have, once the catalogue is ready", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, link());
    announce.mockClear();
    act(() => catalogue.setLayers(listed(18)));
    expect(idsOn(result)).toEqual(ids.slice(0, 18));
    expect(said()).toEqual(["7 layers in the link are not available."]);
  });

  it("are said on their own when every layer that was kept is listed", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, link());
    announce.mockClear();
    act(() => catalogue.setLayers(listed(20)));
    expect(idsOn(result)).toEqual(ids.slice(0, 20));
    expect(said()).toEqual(["5 layers in the link are not available."]);
    expect(announce).toHaveBeenCalledWith(expect.any(String), {
      priority: "polite",
      keep: true,
    });
  });

  it("are not said again by a later list, and never reach the address", () => {
    const catalogue = loadingCatalogue();
    const { result } = render(catalogue, link());
    act(() => catalogue.setLayers(listed(20)));
    announce.mockClear();
    act(() => catalogue.setLayers(listed(25)));
    expect(said()).toEqual(["Layers updated: 5 added."]);
    expect(result.current.urlValue.enabled).toEqual(ids.slice(0, 20));
    expect(result.current.urlValue).not.toHaveProperty("dropped");
  });

  it("are said once under StrictMode, which renders twice", () => {
    const catalogue = loadingCatalogue();
    render(catalogue, link(), StrictMode);
    announce.mockClear();
    act(() => catalogue.setLayers(listed(20)));
    expect(said()).toEqual(["5 layers in the link are not available."]);
  });

  it("are dropped without a word from a catalogue that was ready from the start", () => {
    const { result } = render(new FakeLayerCatalogue(listed(25)), link());
    expect(idsOn(result)).toEqual(ids.slice(0, 20));
    expect(said()).toEqual([]);
  });
});

describe("a layer that arrives after the hook mounted", () => {
  it("has its controls' defaults, and a feed request built from them has no variable left unfilled", async () => {
    const catalogue = new FakeLayerCatalogue([SAMPLE_ALERT_LAYER]);
    const { result, source } = render(catalogue);
    act(() => catalogue.setLayers(LAYERS));
    expect(layer(result, POINTS).controls).toEqual(
      defaultControlValues(SAMPLE_FEED_LAYER, NOW),
    );
    expect(layer(result, IMAGERY).controls).toEqual(
      defaultControlValues(SAMPLE_TILE_LAYER, NOW),
    );
    source.setFeatures(POINTS, [samplePoint("a")]);
    act(() => result.current.setEnabled(POINTS, true));
    await waitFor(() => expect(source.requests).toHaveLength(1));
    const request = source.requests[0];
    expect(request?.controls).toEqual(
      defaultControlValues(SAMPLE_FEED_LAYER, NOW),
    );
    expect(request?.url).toBe("https://sample.test/feed/big_day.json");
  });

  it("puts its controls into the address when it is turned on", () => {
    const catalogue = new FakeLayerCatalogue([]);
    const { result } = render(catalogue);
    act(() => catalogue.setLayers(LAYERS));
    act(() => result.current.setEnabled(IMAGERY, true));
    expect(result.current.urlValue.controls[IMAGERY]).toEqual(
      defaultControlValues(SAMPLE_TILE_LAYER, NOW),
    );
  });
});

describe("an enabled layer that a refreshed catalogue no longer has", () => {
  async function withPointsOn() {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const view = render(catalogue, {
      enabled: [POINTS, ALERTS],
      controls: { [POINTS]: { window: "hour" } },
    });
    view.source.setFeatures(POINTS, [samplePoint("a")]);
    await waitFor(() =>
      expect(layer(view.result, POINTS).features).toHaveLength(1),
    );
    announce.mockClear();
    return { ...view, catalogue };
  }

  it("is turned off, cleared and left out of the address, and said once by name", async () => {
    const { result, catalogue } = await withPointsOn();
    act(() => result.current.select(POINTS, "a"));
    expect(result.current.selected).not.toBeNull();
    act(() => catalogue.setLayers([SAMPLE_ALERT_LAYER, SAMPLE_TILE_LAYER]));
    expect(result.current.layers.map((item) => item.definition.id)).toEqual([
      ALERTS,
      IMAGERY,
    ]);
    expect(idsOn(result)).toEqual([ALERTS]);
    expect(result.current.selected).toBeNull();
    expect(result.current.urlValue.enabled).toEqual([ALERTS]);
    expect(said()).toEqual([
      "Sample points is no longer available and was turned off. Layers updated: 1 removed.",
    ]);
  });

  it("aborts the layer's request in flight", async () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result, source } = render(catalogue);
    source.hold();
    act(() => result.current.setEnabled(POINTS, true));
    const signal = source.requests[0]?.signal;
    expect(signal?.aborted).toBe(false);
    act(() => catalogue.setLayers([SAMPLE_ALERT_LAYER]));
    expect(signal?.aborted).toBe(true);
  });

  it("closes the open request for its affected area", async () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result, source } = render(catalogue);
    source.setFeatures(ALERTS, [
      samplePoint("a", { area: "https://alerts.test/shape/a" }),
    ]);
    source.setDetail(ALERTS, [samplePoint("shape")]);
    act(() => result.current.setEnabled(ALERTS, true));
    await waitFor(() => expect(layer(result, ALERTS).features).toHaveLength(1));
    const release = source.hold();
    act(() => result.current.showDetail(ALERTS, "a"));
    expect(result.current.detail?.status).toBe("loading");
    announce.mockClear();
    act(() => catalogue.setLayers([SAMPLE_FEED_LAYER]));
    expect(result.current.detail).toBeNull();
    await act(async () => release());
    expect(said()).toEqual([
      "Sample alerts is no longer available and was turned off. Layers updated: 2 removed.",
    ]);
  });

  it("is said once for several layers that go in one refresh", async () => {
    const { catalogue } = await withPointsOn();
    act(() => catalogue.setLayers([SAMPLE_TILE_LAYER]));
    expect(said()).toEqual([
      "2 layers are no longer available and were turned off. Layers updated: 2 removed.",
    ]);
  });

  it("does not say a layer was turned off when it was off, only that the list was updated", async () => {
    const { catalogue } = await withPointsOn();
    act(() => catalogue.setLayers([SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER]));
    expect(said()).toEqual(["Layers updated: 1 removed."]);
  });

  it("says nothing when a refresh only changes what the catalogue says about itself", async () => {
    const { catalogue } = await withPointsOn();
    act(() => catalogue.setLayers(LAYERS));
    expect(said()).toEqual([]);
  });

  it("stays off when a later refresh lists it again", async () => {
    const { result, catalogue } = await withPointsOn();
    act(() => catalogue.setLayers([SAMPLE_ALERT_LAYER]));
    act(() => catalogue.setLayers(LAYERS));
    expect(idsOn(result)).toEqual([ALERTS]);
  });

  it("is said once under StrictMode, which renders twice", () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    render(catalogue, { enabled: [POINTS], controls: {} }, StrictMode);
    announce.mockClear();
    act(() => catalogue.setLayers([SAMPLE_ALERT_LAYER]));
    expect(said()).toEqual([
      "Sample points is no longer available and was turned off. Layers updated: 2 removed.",
    ]);
  });
});

describe("Undo after a refresh that removes a layer", () => {
  function withBothOff() {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const view = render(catalogue, { enabled: [POINTS, ALERTS], controls: {} });
    act(() => view.result.current.turnOff([POINTS, ALERTS]));
    return { ...view, catalogue };
  }

  it("counts only the layers that are still listed, and never turns a missing one back on", () => {
    const { result, catalogue } = withBothOff();
    expect(result.current.turnedOff?.count).toBe(2);
    act(() => catalogue.setLayers([SAMPLE_ALERT_LAYER, SAMPLE_TILE_LAYER]));
    expect(result.current.turnedOff?.count).toBe(1);
    act(() => result.current.undoTurnOff());
    expect(idsOn(result)).toEqual([ALERTS]);
  });

  it("does not turn on a layer that was turned on by hand, removed and listed again within the offer", () => {
    const { result, catalogue } = withBothOff();
    act(() => result.current.setEnabled(POINTS, true));
    act(() => catalogue.setLayers([SAMPLE_ALERT_LAYER]));
    act(() => catalogue.setLayers(LAYERS));
    expect(result.current.turnedOff?.count).toBe(1);
    act(() => result.current.undoTurnOff());
    expect(idsOn(result)).toEqual([ALERTS]);
  });

  it("offers nothing once every layer of the batch has gone", () => {
    const { result, catalogue } = withBothOff();
    act(() => catalogue.setLayers([SAMPLE_TILE_LAYER]));
    expect(result.current.turnedOff).toBeNull();
  });
});

describe("a layer whose definition changed in a refresh", () => {
  it("loads again from its new URL when a refresh changes it", async () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result, source } = render(catalogue, {
      enabled: [ALERTS],
      controls: {},
    });
    source.setFeatures(ALERTS, [samplePoint("a")]);
    await waitFor(() => expect(layer(result, ALERTS).features).toHaveLength(1));
    expect(source.requests.map((request) => request.url)).toEqual([
      "https://alerts.test/events",
    ]);
    announce.mockClear();
    const moved: LayerDefinition = {
      ...SAMPLE_ALERT_LAYER,
      source: { ...SAMPLE_ALERT_LAYER.source, url: "https://alerts.test/v2" },
    };
    act(() =>
      catalogue.setLayers([SAMPLE_FEED_LAYER, moved, SAMPLE_TILE_LAYER]),
    );
    await waitFor(() => expect(source.requests).toHaveLength(2));
    expect(source.requests[1]?.url).toBe("https://alerts.test/v2");
    await waitFor(() =>
      expect(layer(result, ALERTS).status).toMatchObject({ kind: "ready" }),
    );
    expect(layer(result, ALERTS).enabled).toBe(true);
  });

  const weekly: LayerDefinition = {
    ...SAMPLE_FEED_LAYER,
    controls: [
      {
        kind: "segmented",
        id: "window",
        label: "Period",
        options: [
          { value: "week", label: "Week" },
          { value: "day", label: "Day" },
        ],
        default: "week",
      },
    ],
    variables: [],
    source: {
      ...SAMPLE_FEED_LAYER.source,
      url: "https://sample.test/feed.json",
    },
  };

  it("stays on and keeps the control values that are still valid", () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result } = render(catalogue, {
      enabled: [POINTS],
      controls: { [POINTS]: { window: "day" } },
    });
    act(() => catalogue.setLayers([weekly, SAMPLE_ALERT_LAYER]));
    expect(layer(result, POINTS).enabled).toBe(true);
    expect(layer(result, POINTS).controls).toEqual({ window: "day" });
    expect(said()).toEqual(["Layers updated: 1 removed."]);
  });

  it("takes the default for a value that is no longer valid", () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result } = render(catalogue, {
      enabled: [POINTS],
      controls: { [POINTS]: { window: "hour" } },
    });
    act(() => catalogue.setLayers([weekly, SAMPLE_ALERT_LAYER]));
    expect(layer(result, POINTS).controls).toEqual({ window: "week" });
  });

  it("keeps the layers' controls as they are when the refresh changes nothing", () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result } = render(catalogue, {
      enabled: [POINTS],
      controls: { [POINTS]: { window: "hour" } },
    });
    const before = layer(result, POINTS).controls;
    act(() => catalogue.setLayers(LAYERS));
    expect(layer(result, POINTS).controls).toBe(before);
  });
});
