// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type FakeMapAdapter,
  type FakeServices,
  type IdentifiableLayerDefinition,
  type LatLng,
  type LayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  samplePoint,
} from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { TOUR_VERSION } from "./app/tourVersion";

// Each test mounts the whole app; under coverage instrumentation a cold one
// can pass the default 5 s.
vi.setConfig({ testTimeout: 20_000 });

const FLOOD = SAMPLE_IDENTIFY_LAYER.id;
const RAIN: IdentifiableLayerDefinition = {
  ...SAMPLE_IDENTIFY_LAYER,
  id: "sample-rain",
  name: "Sample rain",
};
const PLACE: LatLng = { lat: -33.9, lng: 18.4 };
/**
 * Fake time stepped past the announcer's window, which the SDK does not export:
 * long enough for every queued message to go out, and free because the clock is
 * faked.
 */
const ANNOUNCER_SETTLE_MS = 5_000;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Mounts the app with these layers on, as a returning visitor, in the stub the Reload action needs. */
async function renderApp(
  definitions: readonly LayerDefinition[],
  script: (source: FakeServices["fakes"]["layerSource"]) => void = () => {},
) {
  const services: FakeServices = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  script(services.fakes.layerSource);
  services.settings.set({ tourSeen: TOUR_VERSION });
  services.fakes.url.write({
    layers: { enabled: definitions.map(({ id }) => id), controls: {} },
  });
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <ServicesProvider services={services}>
          <LiveRegionProvider>
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </LiveRegionProvider>
        </ServicesProvider>
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  await settle();
  return services;
}

const region = () => screen.getByRole("region", { name: "Map" });
const sheet = () => screen.getByTestId("map-options-sheet");
const polite = () => screen.getByTestId("live-region-polite").textContent;
const adapter = (services: FakeServices): FakeMapAdapter => {
  const latest = services.fakes.maps.at(-1);
  if (!latest) {
    throw new Error("no map adapter");
  }
  return latest;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App identify at a tap", () => {
  it("opens the card of what a raster layer finds at a tap on empty ground, asking at the tapped place and zoom", async () => {
    const services = await renderApp([
      SAMPLE_FEED_LAYER,
      SAMPLE_IDENTIFY_LAYER,
    ]);
    services.fakes.layerSource.setIdentified(FLOOD, [
      samplePoint("a", { title: "Gauge 4" }),
    ]);
    act(() => adapter(services).simulateClick(PLACE));
    await vi.waitFor(() =>
      expect(
        within(sheet()).getByRole("heading", { name: "Gauge 4" }),
      ).toBeInTheDocument(),
    );
    expect(sheet()).toHaveAttribute("data-state", "open");
    const [request] = services.fakes.layerSource.identifyRequests;
    expect(request?.at.latlng).toEqual(PLACE);
    expect(request?.at.zoom).toBe(adapter(services).getView().zoom);
  });

  it("opens a list when several layers find something, and says so once", async () => {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER, RAIN]);
    services.fakes.layerSource.setIdentified(FLOOD, [samplePoint("a")]);
    services.fakes.layerSource.setIdentified("sample-rain", [samplePoint("b")]);
    act(() => adapter(services).simulateClick(PLACE));
    await vi.waitFor(() =>
      expect(
        within(sheet()).getByTestId("feature-choices-heading"),
      ).toHaveTextContent("2 features here"),
    );
    await vi.waitFor(() =>
      expect(polite()).toBe("2 features here. Choose one from the list."),
    );
  });

  it("says nothing was found and leaves the sheet closed", async () => {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
    act(() => adapter(services).simulateClick(PLACE));
    await vi.waitFor(() => expect(polite()).toBe("Nothing found here."));
    expect(sheet()).toHaveAttribute("data-state", "closed");
  });

  it("says nothing on a tap when no layer answers a tap", async () => {
    const services = await renderApp([SAMPLE_FEED_LAYER]);
    const before = polite();
    act(() => adapter(services).simulateClick(PLACE));
    await settle();
    expect(services.fakes.layerSource.identifyRequests).toEqual([]);
    expect(polite()).toBe(before);
  });

  it("asks nothing when the tap lands on a drawn feature, which opens its own card", async () => {
    const services = await renderApp(
      [SAMPLE_FEED_LAYER, SAMPLE_IDENTIFY_LAYER],
      (source) => {
        source.setFeatures("sample-points", [
          samplePoint("a", { title: "Alpha" }),
        ]);
        source.setIdentified(FLOOD, [samplePoint("flood")]);
      },
    );
    act(() => adapter(services).simulateFeatureTap("sample-points", "a"));
    await settle();
    expect(services.fakes.layerSource.identifyRequests).toEqual([]);
    expect(
      within(sheet()).getByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["measuring", "Measure distance and area"],
    ["directions", "Directions"],
  ])(
    "asks nothing while %s, when a tap means something else",
    async (_, name) => {
      const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
      fireEvent.click(screen.getByRole("button", { name }));
      act(() => adapter(services).simulateClick(PLACE));
      await settle();
      expect(services.fakes.layerSource.identifyRequests).toEqual([]);
    },
  );

  it("asks nothing while drawing", async () => {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
    fireEvent.click(screen.getByRole("button", { name: "Draw shapes" }));
    act(() => adapter(services).simulateClick(PLACE));
    await settle();
    expect(services.fakes.layerSource.identifyRequests).toEqual([]);
  });
});

describe("App identify with the I key", () => {
  it("asks at the centre of the map, wrapped to -180 up to 180, and opens the card", async () => {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
    services.fakes.layerSource.setIdentified(FLOOD, [
      samplePoint("a", { title: "Gauge 4" }),
    ]);
    act(() =>
      adapter(services).setView({ center: { lat: 10, lng: 190 }, zoom: 6 }),
    );
    fireEvent.keyDown(region(), { key: "i" });
    await vi.waitFor(() =>
      expect(
        within(sheet()).getByRole("heading", { name: "Gauge 4" }),
      ).toBeInTheDocument(),
    );
    const [request] = services.fakes.layerSource.identifyRequests;
    expect(request?.at.latlng.lat).toBeCloseTo(10);
    expect(request?.at.latlng.lng).toBeCloseTo(-170);
  });

  it("says what the layers found, not that nothing is at the centre, and says nothing before they answer", async () => {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
    const release = services.fakes.layerSource.holdIdentify(FLOOD);
    fireEvent.keyDown(region(), { key: "i" });
    await settle();
    expect(polite()).toBe("");
    release();
    await vi.waitFor(() => expect(polite()).toBe("Nothing found here."));
  });

  it.each([
    ["measuring", "Measure distance and area"],
    ["directions", "Directions"],
    ["drawing", "Draw shapes"],
  ])(
    "asks no raster layer while %s, and says nothing is at the centre as it did",
    async (_, name) => {
      const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
      fireEvent.click(screen.getByRole("button", { name }));
      fireEvent.keyDown(region(), { key: "i" });
      await vi.waitFor(() =>
        expect(polite()).toBe("No features at the centre of the map."),
      );
      expect(services.fakes.layerSource.identifyRequests).toEqual([]);
    },
  );

  it("keeps what the key says when another message follows it inside the announcer's window", async () => {
    // The announcer spaces its messages by timers and reads the clock, so both
    // are faked from before the app mounts and stepped by hand: a real wait
    // would stretch with the load on the machine.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    const services = await renderApp([SAMPLE_FEED_LAYER]);
    const heard: string[] = [];
    const region_ = screen.getByTestId("live-region-polite");
    new MutationObserver(() => {
      const text = region_.textContent ?? "";
      if (text !== "" && heard.at(-1) !== text) {
        heard.push(text);
      }
    }).observe(region_, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    // Let what mounting said go out, so the pin's message is the one that opens
    // the window.
    await advance(ANNOUNCER_SETTLE_MS);
    heard.length = 0;
    // The pin's message opens the window, the key's waits in it, and the second
    // pin's (a different place, so not a repeat) would replace it if it were not kept.
    fireEvent.keyDown(region(), { key: "p" });
    fireEvent.keyDown(region(), { key: "i" });
    act(() =>
      adapter(services).setView({ center: { lat: 10, lng: 20 }, zoom: 6 }),
    );
    fireEvent.keyDown(region(), { key: "p" });
    await advance(ANNOUNCER_SETTLE_MS);
    expect(heard).toHaveLength(3);
    expect(heard).toContain("No features at the centre of the map.");
  });

  it("still says nothing is at the centre when no layer answers a tap", async () => {
    await renderApp([SAMPLE_FEED_LAYER]);
    fireEvent.keyDown(region(), { key: "i" });
    await vi.waitFor(() =>
      expect(polite()).toBe("No features at the centre of the map."),
    );
  });
});

describe("App cancelling an identify", () => {
  async function waiting() {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
    services.fakes.layerSource.setIdentified(FLOOD, [samplePoint("a")]);
    const release = services.fakes.layerSource.holdIdentify(FLOOD);
    act(() => adapter(services).simulateClick(PLACE));
    await settle();
    const [request] = services.fakes.layerSource.identifyRequests;
    expect(request?.signal?.aborted).toBe(false);
    return { services, release, aborted: () => request?.signal?.aborted };
  }

  describe("Escape with a sheet open", () => {
    async function waitingWithSheetOpen() {
      const view = await waiting();
      fireEvent.click(screen.getByRole("button", { name: "Map options" }));
      expect(sheet()).toHaveAttribute("data-state", "open");
      // Opening a surface cancels a lookup, so start another one over the sheet.
      view.services.fakes.layerSource.holdIdentify(FLOOD);
      act(() => adapter(view.services).simulateClick(PLACE));
      await settle();
      const request = view.services.fakes.layerSource.identifyRequests.at(-1);
      expect(request?.signal?.aborted).toBe(false);
      return { ...view, aborted: () => request?.signal?.aborted };
    }

    it("on the map ends the lookup and leaves the sheet open, and a second press closes it", async () => {
      const { release, aborted } = await waitingWithSheetOpen();
      fireEvent.keyDown(region(), { key: "Escape" });
      expect(aborted()).toBe(true);
      expect(sheet()).toHaveAttribute("data-state", "open");
      release();
      await settle();
      expect(sheet()).toHaveAttribute("data-state", "open");
      expect(screen.queryByTestId("feature-card")).toBeNull();
      expect(polite()).not.toContain("Nothing found");
      fireEvent.keyDown(region(), { key: "Escape" });
      expect(sheet()).toHaveAttribute("data-state", "closed");
    });

    it("from elsewhere on the page does the same", async () => {
      const { release, aborted } = await waitingWithSheetOpen();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(aborted()).toBe(true);
      expect(sheet()).toHaveAttribute("data-state", "open");
      release();
      await settle();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(sheet()).toHaveAttribute("data-state", "closed");
    });
  });

  it("is not held up by a source that never notices the abort: the late answer is dropped", async () => {
    const { services, release, aborted } = await waiting();
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(aborted()).toBe(true);
    // The fake only rejects once released, as a source that ignores the signal would.
    release();
    await settle();
    expect(screen.queryByTestId("feature-card")).toBeNull();
    expect(services.fakes.layerSource.identifyRequests).toHaveLength(1);
  });

  it("replaces a lookup with a second tap on the same place, and only the second opens", async () => {
    const services = await renderApp([SAMPLE_IDENTIFY_LAYER]);
    services.fakes.layerSource.setIdentified(FLOOD, [
      samplePoint("a", { title: "Gauge 4" }),
    ]);
    const release = services.fakes.layerSource.holdIdentify(FLOOD);
    act(() => adapter(services).simulateClick(PLACE));
    await settle();
    act(() => adapter(services).simulateClick(PLACE));
    await settle();
    const [first, second] = services.fakes.layerSource.identifyRequests;
    expect(first?.signal?.aborted).toBe(true);
    expect(second?.signal?.aborted).toBe(false);
    release();
    await vi.waitFor(() =>
      expect(
        within(sheet()).getByRole("heading", { name: "Gauge 4" }),
      ).toBeInTheDocument(),
    );
    expect(services.fakes.layerSource.identifyRequests).toHaveLength(2);
  });

  it("is cancelled by a card that opens another way, whose focus its late answer must not take", async () => {
    const services = await renderApp(
      [SAMPLE_FEED_LAYER, SAMPLE_IDENTIFY_LAYER],
      (source) => {
        source.setFeatures("sample-points", [
          samplePoint("a", { title: "Alpha" }),
        ]);
        source.setIdentified(FLOOD, [samplePoint("late", { title: "Late" })]);
      },
    );
    const release = services.fakes.layerSource.holdIdentify(FLOOD);
    act(() => adapter(services).simulateClick(PLACE));
    await settle();
    act(() => adapter(services).simulateFeatureTap("sample-points", "a"));
    expect(
      within(sheet()).getByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    release();
    await settle();
    expect(
      within(sheet()).getByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(within(sheet()).queryByRole("heading", { name: "Late" })).toBeNull();
  });

  it("is cancelled by a long press, which drops the pin instead", async () => {
    const { release, aborted } = await waiting();
    fireEvent.contextMenu(region(), { clientX: 10, clientY: 10 });
    expect(aborted()).toBe(true);
    release();
    await settle();
    expect(
      within(sheet()).queryByTestId("feature-card"),
    ).not.toBeInTheDocument();
  });

  it("is cancelled when another surface opens", async () => {
    const { release, aborted } = await waiting();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(aborted()).toBe(true);
    release();
    await settle();
    expect(screen.queryByTestId("feature-card")).toBeNull();
  });

  it("is cancelled when measuring starts", async () => {
    const { release, aborted } = await waiting();
    fireEvent.click(
      screen.getByRole("button", { name: "Measure distance and area" }),
    );
    expect(aborted()).toBe(true);
    release();
    await settle();
    expect(screen.queryByTestId("feature-card")).toBeNull();
  });
});
