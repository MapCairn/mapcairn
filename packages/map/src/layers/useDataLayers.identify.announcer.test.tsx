// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type IdentifiableLayerDefinition,
  SAMPLE_IDENTIFY_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { THROTTLE_MS } from "../ui/LiveRegion/announcer";
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

async function setup(...definitions: IdentifiableLayerDefinition[]) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LiveRegionProvider>
      <ServicesProvider services={services}>{children}</ServicesProvider>
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
  await advance(THROTTLE_MS * 4);
  return {
    ...view,
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
