// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  FakeLayerCatalogue,
  type LayerCatalogue,
  type LayersUrlState,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { DEDUPE_MS, THROTTLE_MS } from "../ui/LiveRegion/announcer";
import { useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const ALERTS = SAMPLE_ALERT_LAYER.id;
const IMAGERY = SAMPLE_TILE_LAYER.id;
const LAYERS = [SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER, SAMPLE_TILE_LAYER];
// A tile layer: a feed layer that is turned on also loads, and says so.
const LINK: LayersUrlState = { enabled: [IMAGERY, "ghost"], controls: {} };
const BAD = { problems: ["id: wrong"] };

beforeEach(() => {
  // The announcer's clock is Date.now, so its throttle follows these timers.
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The hook inside the real live regions, with a record of every text each
 * region took, so a test asserts what a screen reader would be given and when.
 */
function setup(catalogue: LayerCatalogue, initial?: LayersUrlState) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={createFakeServices({ layers: catalogue })}>
      <LiveRegionProvider>{children}</LiveRegionProvider>
    </ServicesProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW, initial }), {
    wrapper,
  });
  const spoken = { polite: [] as string[], assertive: [] as string[] };
  for (const priority of ["polite", "assertive"] as const) {
    const region = screen.getByTestId(`live-region-${priority}`);
    const record = () => {
      if (region.textContent) {
        spoken[priority].push(region.textContent);
      }
    };
    // Whatever the mount said is there already, and an observer sees only later changes.
    record();
    new MutationObserver(record).observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  return { ...view, spoken };
}

/**
 * Lets the announcer's throttle window end, so a message held for it is
 * spoken. A test that expects the same words twice waits out `DEDUPE_MS`
 * between them, as the announcer drops a repeat sooner than that.
 */
const settle = (ms: number = THROTTLE_MS) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function loadingCatalogue() {
  const catalogue = new FakeLayerCatalogue();
  catalogue.setState({ status: "loading" });
  return catalogue;
}

describe("what the hook says about the catalogue", () => {
  it("reports a loading catalogue, and a retry that does nothing while it loads", async () => {
    const catalogue = loadingCatalogue();
    const { result } = setup(catalogue);
    expect(result.current.catalogue).toEqual({
      status: "loading",
      skipped: 0,
      refresh: "idle",
      failed: false,
      awaited: true,
    });
    act(() => result.current.retryCatalogue());
    expect(catalogue.refreshes).toBe(0);
  });

  it("reports a ready catalogue with its skipped count, and not as awaited when it was ready at mount", () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result } = setup(catalogue);
    expect(result.current.catalogue).toEqual({
      status: "ready",
      skipped: 0,
      refresh: "idle",
      failed: false,
      awaited: false,
    });
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [BAD, BAD],
        refresh: "idle",
      }),
    );
    expect(result.current.catalogue.skipped).toBe(2);
  });

  it("asks the catalogue to load again from a failed load and from a failed refresh, and from nothing else", () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result } = setup(catalogue);
    act(() => result.current.retryCatalogue());
    expect(catalogue.refreshes).toBe(0);

    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "failed",
      }),
    );
    act(() => result.current.retryCatalogue());
    expect(catalogue.refreshes).toBe(1);

    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    act(() => result.current.retryCatalogue());
    expect(catalogue.refreshes).toBe(2);
  });
});

describe("what is said aloud about the catalogue, through the real announcer", () => {
  it("says 'Loading layers' politely only while a layer named by the link is waiting", async () => {
    const withLink = setup(loadingCatalogue(), LINK);
    await settle();
    expect(withLink.spoken.polite).toEqual(["Loading layers"]);
    withLink.unmount();

    const withoutLink = setup(loadingCatalogue());
    await settle();
    expect(withoutLink.spoken.polite).toEqual([]);
  });

  it("says a failed load assertively, as its own message, once", async () => {
    const catalogue = loadingCatalogue();
    const { spoken } = setup(catalogue, LINK);
    await settle();
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    await settle();
    expect(spoken.assertive).toEqual(["Layers could not be loaded."]);
    expect(spoken.polite).toEqual(["Loading layers"]);
  });

  it("says each try again once: loading while the link waits, then the next failure", async () => {
    const catalogue = loadingCatalogue();
    const { result, spoken } = setup(catalogue, LINK);
    await settle(DEDUPE_MS);
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    await settle(DEDUPE_MS);
    act(() => catalogue.setState({ status: "loading" }));
    await settle(DEDUPE_MS);
    act(() => catalogue.setState({ status: "failed", reason: "invalid" }));
    await settle(DEDUPE_MS);
    expect(result.current.catalogue.status).toBe("failed");
    expect(spoken.polite).toEqual(["Loading layers", "Loading layers"]);
    expect(spoken.assertive).toEqual([
      "Layers could not be loaded.",
      "Layers could not be loaded.",
    ]);
  });

  it("composes the link note and the skipped count of the first list into one message", async () => {
    const catalogue = loadingCatalogue();
    const { spoken } = setup(catalogue, LINK);
    await settle();
    spoken.polite.length = 0;
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [BAD],
        refresh: "idle",
      }),
    );
    await settle();
    expect(spoken.polite).toEqual([
      "1 layer in the link is not available. 1 layer could not be shown.",
    ]);
  });

  it("says one composed message, in a fixed order, when a refresh removes a layer that is on, adds one and skips two", async () => {
    const catalogue = loadingCatalogue();
    const { result, spoken } = setup(catalogue, {
      enabled: [IMAGERY],
      controls: {},
    });
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
        skipped: [],
        refresh: "idle",
      }),
    );
    await settle();
    expect(result.current.urlValue.enabled).toEqual([IMAGERY]);
    spoken.polite.length = 0;

    act(() =>
      catalogue.setState({
        status: "ready",
        layers: [SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER],
        skipped: [BAD, BAD],
        refresh: "idle",
      }),
    );
    await settle();

    expect(spoken.polite).toEqual([
      "Sample imagery is no longer available and was turned off. 2 layers could not be shown. Layers updated: 1 added, 1 removed.",
    ]);
  });

  it("does not say 'Layers updated' for the first list, or when a refresh changes nothing", async () => {
    const catalogue = loadingCatalogue();
    const { spoken } = setup(catalogue);
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "idle",
      }),
    );
    await settle();
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "loading",
      }),
    );
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "idle",
      }),
    );
    await settle();
    expect(spoken.polite).toEqual([]);
  });

  it("says that the first list is empty, once, for a catalogue that was awaited", async () => {
    const catalogue = loadingCatalogue();
    const { spoken } = setup(catalogue);
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: [],
        skipped: [],
        refresh: "idle",
      }),
    );
    await settle();
    expect(spoken.polite).toEqual(["No layers are available."]);
  });

  it("says nothing for a catalogue that was ready and empty at mount", async () => {
    const { spoken } = setup(new FakeLayerCatalogue());
    await settle();
    expect(spoken).toEqual({ polite: [], assertive: [] });
  });

  it("says a failed refresh assertively, keeps the list, and says nothing more when it recovers with no change", async () => {
    const catalogue = new FakeLayerCatalogue(LAYERS);
    const { result, spoken } = setup(catalogue);
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "failed",
      }),
    );
    await settle();
    expect(spoken.assertive).toEqual([
      "Layers could not be updated. Showing the last list.",
    ]);
    expect(result.current.layers).toHaveLength(3);
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "idle",
      }),
    );
    await settle();
    expect(spoken.polite).toEqual([]);
  });

  it("speaks the link note and then the load result of a link layer that follows it inside the window, so neither replaces the other", async () => {
    const catalogue = loadingCatalogue();
    const { spoken } = setup(catalogue, {
      enabled: [SAMPLE_FEED_LAYER.id, "ghost"],
      controls: {},
    });
    // The list arrives while "Loading layers" still holds the announcer's window.
    await settle(100);
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: LAYERS,
        skipped: [],
        refresh: "idle",
      }),
    );
    // One window at a time, so each message reaches the region before the next.
    await settle();
    await settle();
    await settle();
    expect(spoken.polite).toHaveLength(3);
    expect(spoken.polite[0]).toBe("Loading layers");
    expect(spoken.polite[1]).toBe("1 layer in the link is not available.");
    expect(spoken.polite[2]).toContain(SAMPLE_FEED_LAYER.name);
  });

  it("carries a real runtime catalogue from a failed load through Try again to its list", async () => {
    const load = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]);
    const catalogue = createRuntimeLayerCatalogue({
      load,
      options: {
        decoders: createDecoderRegistry(),
        formatters: createFormatterRegistry(),
      },
    });
    const { result, spoken } = setup(catalogue, {
      enabled: [IMAGERY, ALERTS],
      controls: {},
    });
    await settle();
    expect(result.current.catalogue.status).toBe("failed");
    expect(spoken.assertive).toEqual(["Layers could not be loaded."]);

    act(() => result.current.retryCatalogue());
    await settle();

    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.catalogue.status).toBe("ready");
    expect(result.current.urlValue.enabled).toEqual([IMAGERY]);
    expect(spoken.polite.at(-1)).toBe("1 layer in the link is not available.");
  });
});
