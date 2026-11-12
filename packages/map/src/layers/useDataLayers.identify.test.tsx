// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type IdentifiableLayerDefinition,
  type IdentifyTarget,
  type LayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import {
  IDENTIFY_TIMEOUT_MS,
  type IdentifyResult,
  MAX_IDENTIFY_LAYERS,
  useDataLayers,
} from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 9, 12);
const FEED = SAMPLE_FEED_LAYER.id;
const TAP: IdentifyTarget = { latlng: { lat: -33.9, lng: 18.4 }, zoom: 10 };
const ELSEWHERE: IdentifyTarget = {
  latlng: { lat: 51.5, lng: -0.1 },
  zoom: 10,
};

/** What has been said aloud, in order. */
const said = () => announce.mock.calls.map(([message]) => message);

/** An identifiable layer like the sample one, under another id and name. */
function identifiable(
  id: string,
  name: string,
  more: Partial<IdentifiableLayerDefinition> = {},
): IdentifiableLayerDefinition {
  return { ...SAMPLE_IDENTIFY_LAYER, id, name, ...more };
}

const RAIN = identifiable("rain", "Rainfall");
const WIND = identifiable("wind", "Wind");

function setup(definitions: readonly LayerDefinition[]) {
  const catalogue = new FakeLayerCatalogue(definitions);
  const services = createFakeServices({ layers: catalogue });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW }), {
    wrapper,
  });
  return { ...view, source: services.fakes.layerSource };
}

type Handle = ReturnType<typeof setup>;

/** Turns layers on, then forgets what that said. */
function turnOn(view: Handle, ...ids: string[]) {
  act(() => {
    for (const id of ids) {
      view.result.current.setEnabled(id, true);
    }
  });
  announce.mockClear();
}

/** Starts a tap and lets the hook make its requests, without waiting for the answer. */
function tap(
  view: Handle,
  target: IdentifyTarget = TAP,
  options?: { readonly focus?: boolean },
) {
  let pending!: Promise<IdentifyResult | null>;
  act(() => {
    pending = view.result.current.identifyAt(target, options);
  });
  return pending;
}

/** Runs `ask` and waits for what it returns, letting the state it changes settle. */
async function inAct<T>(ask: () => Promise<T>): Promise<T> {
  let value!: T;
  await act(async () => {
    value = await ask();
  });
  return value;
}

/** Taps and waits for the answer. */
function tapAndWait(
  view: Handle,
  target: IdentifyTarget = TAP,
  options?: { readonly focus?: boolean },
) {
  return inAct(() => view.result.current.identifyAt(target, options));
}

/** Waits for a tap's answer, letting the state it changes settle. */
function settled<T>(pending: Promise<T>): Promise<T> {
  return inAct(() => pending);
}

const selectedId = (view: Handle) => view.result.current.selected?.feature.id;

beforeEach(() => {
  announce.mockClear();
});

describe("useDataLayers identifyAt", () => {
  it("opens the card of the one feature a layer finds, and says nothing", async () => {
    const view = setup([RAIN]);
    view.source.setIdentified("rain", [samplePoint("a", { title: "Gauge 4" })]);
    turnOn(view, "rain");
    const result = await tapAndWait(view);
    expect(result).toEqual({ asked: 1, found: 1 });
    expect(selectedId(view)).toBe("a");
    expect(view.result.current.selected?.layer.definition.id).toBe("rain");
    expect(view.result.current.choices).toBeNull();
    expect(said()).toEqual([]);
  });

  it("asks the layer about the tapped place and zoom, with its controls", async () => {
    const view = setup([RAIN]);
    turnOn(view, "rain");
    act(() => view.result.current.setControl("rain", "period", "100"));
    await tapAndWait(view);
    const [request] = view.source.identifyRequests;
    expect(request?.at).toEqual(TAP);
    expect(request?.controls).toEqual({ period: "100" });
    expect(request?.url).toContain("api.test/identify/100?");
  });

  it("asks for focus only when told to", async () => {
    const view = setup([RAIN]);
    view.source.setIdentified("rain", [samplePoint("a")]);
    turnOn(view, "rain");
    await tapAndWait(view, TAP, { focus: true });
    expect(view.result.current.focusRequest).toBe(1);
    await tapAndWait(view, TAP);
    expect(view.result.current.focusRequest).toBe(1);
  });

  it("opens a list of the features found together across layers, then a card, then back", async () => {
    const view = setup([RAIN, WIND]);
    view.source.setIdentified("rain", [samplePoint("a")]);
    view.source.setIdentified("wind", [samplePoint("b"), samplePoint("c")]);
    turnOn(view, "rain", "wind");
    const result = await tapAndWait(view);
    expect(result).toEqual({ asked: 2, found: 3 });
    expect(view.result.current.selected).toBeNull();
    expect(
      view.result.current.choices?.map(({ layer, feature }) => [
        layer.definition.id,
        feature.id,
      ]),
    ).toEqual([
      ["rain", "a"],
      ["wind", "b"],
      ["wind", "c"],
    ]);
    expect(said()).toEqual(["3 features here. Choose one from the list."]);
    act(() => view.result.current.select("wind", "c", { keepChoices: true }));
    expect(selectedId(view)).toBe("c");
    expect(view.result.current.choices).toHaveLength(3);
    act(() => view.result.current.backToChoices());
    expect(view.result.current.selected).toBeNull();
    expect(view.result.current.choices).toHaveLength(3);
  });

  it("says nothing was found once, and leaves an open card alone", async () => {
    const view = setup([SAMPLE_FEED_LAYER, RAIN]);
    view.source.setFeatures(FEED, [samplePoint("f")]);
    turnOn(view, FEED, "rain");
    await waitFor(() =>
      expect(view.result.current.layers[0]?.status.kind).toBe("ready"),
    );
    act(() => view.result.current.select(FEED, "f", { focus: true }));
    announce.mockClear();
    const result = await tapAndWait(view);
    expect(result).toEqual({ asked: 1, found: 0 });
    expect(said()).toEqual(["Nothing found here."]);
    expect(announce).toHaveBeenCalledWith("Nothing found here.", {
      priority: "polite",
    });
    expect(selectedId(view)).toBe("f");
  });

  it("asks no layer that is off, has no identify block, shows no imagery or does not cover the place", async () => {
    const covering = identifiable("covers", "Covers", {
      source: { ...SAMPLE_IDENTIFY_LAYER.source, bounds: [-10, 40, 10, 60] },
    });
    const view = setup([
      identifiable("off", "Off"),
      SAMPLE_TILE_LAYER,
      identifiable("unavailable", "Unavailable"),
      covering,
      RAIN,
    ]);
    turnOn(view, SAMPLE_TILE_LAYER.id, "unavailable", "covers", "rain");
    act(() =>
      view.result.current.reportTilesUnavailable(
        "unavailable",
        "https://tiles.test/flood/20/{z}/{y}/{x}.png",
      ),
    );
    announce.mockClear();
    const result = await tapAndWait(view, TAP);
    expect(result).toEqual({ asked: 1, found: 0 });
    expect(view.source.identifyRequests.map((r) => r.definition.id)).toEqual([
      "rain",
    ]);
    const near = await tapAndWait(view, ELSEWHERE);
    expect(near?.asked).toBe(2);
    expect(
      view.source.identifyRequests.slice(1).map((r) => r.definition.id),
    ).toEqual(["covers", "rain"]);
  });

  it("changes nothing and says nothing when no layer can be asked", async () => {
    const view = setup([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER, RAIN]);
    view.source.setFeatures(FEED, [samplePoint("f")]);
    turnOn(view, FEED, SAMPLE_TILE_LAYER.id);
    await waitFor(() =>
      expect(view.result.current.layers[0]?.status.kind).toBe("ready"),
    );
    announce.mockClear();
    const result = await tapAndWait(view);
    expect(result).toEqual({ asked: 0, found: 0 });
    expect(view.source.identifyRequests).toEqual([]);
    expect(view.result.current.identifying).toBe(false);
    expect(said()).toEqual([]);
  });

  it("asks at most four layers, in catalogue order, and says how many it asked", async () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) =>
      identifiable(id, `Layer ${id}`),
    );
    const view = setup(six);
    turnOn(view, ...six.map((layer) => layer.id));
    const result = await tapAndWait(view);
    expect(MAX_IDENTIFY_LAYERS).toBe(4);
    expect(result).toEqual({ asked: 4, found: 0 });
    expect(view.source.identifyRequests.map((r) => r.definition.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(said()).toEqual(["Nothing found here. Asked 4 of 6 layers."]);
  });

  it("starts every request before any answers", async () => {
    const view = setup([RAIN, WIND]);
    const releaseRain = view.source.holdIdentify("rain");
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    expect(view.source.identifyRequests).toHaveLength(2);
    expect(view.result.current.identifying).toBe(true);
    await act(async () => releaseRain());
    await act(async () => {
      await pending;
    });
    expect(view.result.current.identifying).toBe(false);
  });

  it("opens nothing until every layer has answered", async () => {
    const view = setup([RAIN, WIND]);
    view.source.setIdentified("wind", [samplePoint("w")]);
    const releaseRain = view.source.holdIdentify("rain");
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    expect(view.result.current.selected).toBeNull();
    await act(async () => releaseRain());
    await act(async () => {
      await pending;
    });
    expect(selectedId(view)).toBe("w");
  });

  it("opens the answer and names the layer that failed, in one polite message", async () => {
    const view = setup([RAIN, WIND]);
    view.source.failIdentify("rain", "network");
    view.source.setIdentified("wind", [samplePoint("w")]);
    turnOn(view, "rain", "wind");
    const result = await tapAndWait(view);
    expect(result).toEqual({ asked: 2, found: 1 });
    expect(selectedId(view)).toBe("w");
    expect(announce.mock.calls).toEqual([
      ["Rainfall did not answer.", { priority: "polite" }],
    ]);
  });

  it("is assertive and opens nothing when every layer fails", async () => {
    const view = setup([RAIN, WIND]);
    view.source.failIdentify("rain", "network");
    view.source.failIdentify("wind", "invalid");
    turnOn(view, "rain", "wind");
    await tapAndWait(view);
    expect(view.result.current.selected).toBeNull();
    expect(announce.mock.calls).toEqual([
      ["Rainfall and Wind did not answer.", { priority: "assertive" }],
    ]);
  });
});

describe("useDataLayers identifyAt over time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives a layer eight seconds, then settles without it and names it", async () => {
    const view = setup([RAIN, WIND]);
    view.source.holdIdentify("rain");
    view.source.setIdentified("wind", [samplePoint("w")]);
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTIFY_TIMEOUT_MS - 1);
    });
    expect(view.result.current.selected).toBeNull();
    expect(view.result.current.identifying).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(await settled(pending)).toEqual({ asked: 2, found: 1 });
    expect(IDENTIFY_TIMEOUT_MS).toBe(8000);
    expect(selectedId(view)).toBe("w");
    expect(view.source.identifyRequests[0]?.signal?.aborted).toBe(true);
    expect(announce.mock.calls).toEqual([
      ["Rainfall did not answer.", { priority: "polite" }],
    ]);
  });

  it("starts each layer's eight seconds with its own request", async () => {
    const view = setup([RAIN, WIND]);
    view.source.holdIdentify("rain");
    view.source.holdIdentify("wind");
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDENTIFY_TIMEOUT_MS);
    });
    await settled(pending);
    expect(announce.mock.calls).toEqual([
      ["Rainfall and Wind did not answer.", { priority: "assertive" }],
    ]);
  });

  it("stops the timer once the answer has come", async () => {
    const view = setup([RAIN]);
    view.source.setIdentified("rain", [samplePoint("a")]);
    turnOn(view, "rain");
    const pending = tap(view);
    expect(vi.getTimerCount()).toBe(1);
    await settled(pending);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useDataLayers cancelling an identify", () => {
  it("lets a new tap replace the one in flight, which opens nothing", async () => {
    const view = setup([RAIN]);
    const release = view.source.holdIdentify("rain");
    view.source.setIdentified("rain", [samplePoint("old")]);
    turnOn(view, "rain");
    const first = tap(view);
    release();
    view.source.setIdentified("rain", [samplePoint("new")]);
    const second = await tapAndWait(view, ELSEWHERE);
    expect(await settled(first)).toBeNull();
    expect(view.source.identifyRequests[0]?.signal?.aborted).toBe(true);
    expect(second).toEqual({ asked: 1, found: 1 });
    expect(selectedId(view)).toBe("new");
    expect(said()).toEqual([]);
  });

  it("cancelIdentify aborts the requests, opens nothing, says nothing and reports it did", async () => {
    const view = setup([RAIN, WIND]);
    view.source.holdIdentify("rain");
    view.source.setIdentified("wind", [samplePoint("w")]);
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    let cancelled = false;
    act(() => {
      cancelled = view.result.current.cancelIdentify();
    });
    expect(cancelled).toBe(true);
    expect(await settled(pending)).toBeNull();
    expect(view.source.identifyRequests.every((r) => r.signal?.aborted)).toBe(
      true,
    );
    expect(view.result.current.identifying).toBe(false);
    expect(view.result.current.selected).toBeNull();
    expect(said()).toEqual([]);
  });

  it("cancelIdentify does nothing, and says so, when nothing is pending", () => {
    const view = setup([RAIN]);
    let cancelled = true;
    act(() => {
      cancelled = view.result.current.cancelIdentify();
    });
    expect(cancelled).toBe(false);
  });

  it("aborts a request in flight on unmount", async () => {
    const view = setup([RAIN]);
    view.source.holdIdentify("rain");
    turnOn(view, "rain");
    const pending = tap(view);
    view.unmount();
    expect(await pending).toBeNull();
    expect(view.source.identifyRequests[0]?.signal?.aborted).toBe(true);
  });

  it("aborts the request of a layer that is turned off, and the others still answer", async () => {
    const view = setup([RAIN, WIND]);
    view.source.holdIdentify("rain");
    view.source.setIdentified("wind", [samplePoint("w")]);
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    act(() => view.result.current.setEnabled("rain", false));
    expect(await settled(pending)).toEqual({ asked: 2, found: 1 });
    expect(view.source.identifyRequests[0]?.signal?.aborted).toBe(true);
    expect(selectedId(view)).toBe("w");
    expect(said()).toEqual([]);
  });

  it("opens nothing when every layer asked was turned off", async () => {
    const view = setup([RAIN, WIND]);
    view.source.holdIdentify("rain");
    view.source.holdIdentify("wind");
    turnOn(view, "rain", "wind");
    const pending = tap(view);
    act(() => view.result.current.turnOff(["rain", "wind"]));
    announce.mockClear();
    expect(await settled(pending)).toBeNull();
    expect(view.result.current.identifying).toBe(false);
    expect(said()).toEqual([]);
  });

  it("aborts the request of a layer whose tiles change", async () => {
    const view = setup([RAIN]);
    view.source.holdIdentify("rain");
    turnOn(view, "rain");
    const pending = tap(view);
    act(() => view.result.current.setControl("rain", "period", "100"));
    expect(await settled(pending)).toBeNull();
    expect(view.source.identifyRequests[0]?.signal?.aborted).toBe(true);
  });
});

describe("useDataLayers identified features", () => {
  async function withCardOpen() {
    const view = setup([RAIN, WIND]);
    view.source.setIdentified("rain", [samplePoint("a")]);
    turnOn(view, "rain", "wind");
    await tapAndWait(view);
    announce.mockClear();
    return view;
  }

  it("keeps the old card while a new tap is in flight, and replaces it at settlement", async () => {
    const view = await withCardOpen();
    const release = view.source.holdIdentify("rain");
    view.source.setIdentified("rain", [samplePoint("b")]);
    const pending = tap(view, ELSEWHERE);
    expect(selectedId(view)).toBe("a");
    release();
    await settled(pending);
    expect(selectedId(view)).toBe("b");
  });

  it("drops an open card that points into an entry a later tap replaced, when that finds nothing", async () => {
    const view = await withCardOpen();
    view.source.setIdentified("rain", []);
    await tapAndWait(view, ELSEWHERE);
    expect(view.result.current.selected).toBeNull();
    expect(said()).toEqual(["Nothing found here."]);
  });

  it("keeps an open card whose layer the next tap did not ask, when that finds nothing", async () => {
    const local = identifiable("local", "Local", {
      source: { ...SAMPLE_IDENTIFY_LAYER.source, bounds: [10, -40, 30, -20] },
    });
    const view = setup([local, WIND]);
    view.source.setIdentified("local", [samplePoint("a")]);
    turnOn(view, "local", "wind");
    await tapAndWait(view);
    expect(selectedId(view)).toBe("a");
    announce.mockClear();
    await tapAndWait(view, ELSEWHERE);
    expect(selectedId(view)).toBe("a");
    expect(said()).toEqual(["Nothing found here."]);
  });

  it("closes the card of a layer that is turned off", async () => {
    const view = await withCardOpen();
    act(() => view.result.current.setEnabled("rain", false));
    expect(view.result.current.selected).toBeNull();
  });

  it("closes the card of a layer turnOff turns off", async () => {
    const view = await withCardOpen();
    act(() => view.result.current.turnOff(["rain"]));
    expect(view.result.current.selected).toBeNull();
  });

  it("closes the card of a layer whose tiles change", async () => {
    const view = await withCardOpen();
    act(() => view.result.current.setControl("rain", "period", "100"));
    expect(view.result.current.selected).toBeNull();
  });

  it("keeps the card when another layer's tiles change", async () => {
    const view = await withCardOpen();
    act(() => view.result.current.setControl("wind", "period", "100"));
    expect(selectedId(view)).toBe("a");
  });

  it("leaves the layer's own state as it was: a tile layer has no features of its own", async () => {
    const view = await withCardOpen();
    const rain = view.result.current.layers.find(
      (layer) => layer.definition.id === "rain",
    );
    expect(rain?.features).toEqual([]);
    expect(rain?.status.kind).toBe("on");
  });
});
