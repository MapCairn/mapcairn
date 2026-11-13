// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type IdentifiableLayerDefinition,
  type LayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider, useAnnounce } from "../ui/LiveRegion";
import { type Announce, THROTTLE_MS } from "../ui/LiveRegion/announcer";
import { IDENTIFY_TIMEOUT_MS, useDataLayers } from "./useDataLayers";

/*
 * These tests use the real announcer, through `LiveRegionProvider`, on fake
 * timers, so its clock is the fake one. They read what a screen reader would
 * be given for one tap, region by region: the announcer coalesces messages
 * that arrive within `THROTTLE_MS` to the latest, so a tap that said one thing
 * for each layer would be heard as the last of them only.
 */

const TAP = { latlng: { lat: -33.9, lng: 18.4 }, zoom: 10 };

function layer(id: string, name: string): IdentifiableLayerDefinition {
  return { ...SAMPLE_IDENTIFY_LAYER, id, name };
}

/** Lets promises settle and moves the fake clock on. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/**
 * Lets every waiting message go out, one window at a time. Each window is its
 * own `act`, because React batches the text a region takes within one, so a
 * single long advance would show only the last of several messages.
 */
async function drain() {
  for (let window = 0; window < 4; window += 1) {
    await advance(THROTTLE_MS);
  }
}

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

async function setup(...definitions: LayerDefinition[]) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const speaker: { announce: Announce } = { announce: () => {} };
  function Capture() {
    speaker.announce = useAnnounce();
    return null;
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LiveRegionProvider>
      <ServicesProvider services={services}>
        <Capture />
        {children}
      </ServicesProvider>
    </LiveRegionProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => Date.now() }), {
    wrapper,
  });
  act(() => {
    for (const { id } of definitions) {
      view.result.current.setEnabled(id, true);
    }
  });
  // Let what turning the layers on said go out before listening.
  await advance(THROTTLE_MS * (definitions.length + 2));
  return {
    ...view,
    /** Says something else, as another part of the app does. */
    announce: (...args: Parameters<Announce>) => {
      act(() => speaker.announce(...args));
    },
    source: services.fakes.layerSource,
    polite: listenTo(screen.getByRole("status")),
    assertive: listenTo(screen.getByRole("alert")),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("what one tap says through the live region", () => {
  it("names the layer that ran out of time in one polite message, beside the answer that opened", async () => {
    const view = await setup(layer("rain", "Rainfall"), layer("wind", "Wind"));
    view.source.holdIdentify("rain");
    view.source.setIdentified("wind", [samplePoint("w")]);
    let pending!: ReturnType<typeof view.result.current.identifyAt>;
    act(() => {
      pending = view.result.current.identifyAt(TAP, { focus: true });
    });
    await advance(IDENTIFY_TIMEOUT_MS);
    await act(async () => {
      await pending;
    });
    await advance(THROTTLE_MS);
    expect(view.result.current.selected?.feature.id).toBe("w");
    expect(view.polite.heard).toEqual(["Rainfall did not answer."]);
    expect(view.assertive.heard).toEqual([]);
  });

  it("says that six layers were reduced to four, with what was found, in one message", async () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) =>
      layer(id, `Layer ${id}`),
    );
    const view = await setup(...six);
    view.source.setIdentified("a", [samplePoint("x"), samplePoint("y")]);
    view.source.setIdentified("e", [samplePoint("z")]);
    await act(async () => {
      await view.result.current.identifyAt(TAP);
    });
    await advance(THROTTLE_MS);
    expect(view.source.identifyRequests).toHaveLength(4);
    expect(view.polite.heard).toEqual([
      "2 features here. Choose one from the list. Asked 4 of 6 layers.",
    ]);
  });

  it("is assertive, and only assertive, when every layer failed", async () => {
    const view = await setup(layer("rain", "Rainfall"), layer("wind", "Wind"));
    view.source.failIdentify("rain", "network");
    view.source.failIdentify("wind", "network");
    await act(async () => {
      await view.result.current.identifyAt(TAP);
    });
    await advance(THROTTLE_MS);
    expect(view.assertive.heard).toEqual(["Rainfall and Wind did not answer."]);
    expect(view.polite.heard).toEqual([]);
  });

  it("keeps what a tap found when another message follows it inside the window", async () => {
    const view = await setup(layer("rain", "Rainfall"));
    view.source.setIdentified("rain", [samplePoint("a"), samplePoint("b")]);
    // A message that went out just before opens the window, so the tap's waits in it.
    view.announce("Earlier");
    await act(async () => {
      await view.result.current.identifyAt(TAP);
    });
    view.announce("Later");
    await drain();
    expect(view.polite.heard).toEqual([
      "Earlier",
      "2 features here. Choose one from the list.",
      "Later",
    ]);
  });

  it("keeps a failure that was said assertively when another assertive message follows", async () => {
    const view = await setup(layer("rain", "Rainfall"));
    view.source.failIdentify("rain", "network");
    view.announce("Earlier", { priority: "assertive" });
    await act(async () => {
      await view.result.current.identifyAt(TAP);
    });
    view.announce("Later", { priority: "assertive" });
    await drain();
    expect(view.assertive.heard).toEqual([
      "Earlier",
      "Rainfall did not answer.",
      "Later",
    ]);
  });

  it("keeps the list that choose opens for a tap on drawn features", async () => {
    const view = await setup(SAMPLE_FEED_LAYER);
    view.source.setFeatures("sample-points", [
      samplePoint("f"),
      samplePoint("g"),
    ]);
    // The layer found nothing when it was turned on, so ask it again.
    act(() => view.result.current.retry("sample-points"));
    await advance(THROTTLE_MS * 4);
    view.announce("Earlier");
    act(() =>
      view.result.current.choose([
        { layerId: "sample-points", featureId: "f" },
        { layerId: "sample-points", featureId: "g" },
      ]),
    );
    view.announce("Later");
    await drain();
    expect(view.polite.heard.slice(-3)).toEqual([
      "Earlier",
      "2 features here. Choose one from the list.",
      "Later",
    ]);
  });

  it("says nothing for a tap that found one feature and was answered by all", async () => {
    const view = await setup(layer("rain", "Rainfall"));
    view.source.setIdentified("rain", [samplePoint("a")]);
    await act(async () => {
      await view.result.current.identifyAt(TAP);
    });
    await advance(THROTTLE_MS);
    expect(view.polite.heard).toEqual([]);
    expect(view.assertive.heard).toEqual([]);
  });
});
