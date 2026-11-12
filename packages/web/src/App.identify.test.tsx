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

  it("is cancelled by Escape, which does not then close anything else, and opens nothing", async () => {
    const { release, aborted } = await waiting();
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(aborted()).toBe(true);
    release();
    await settle();
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(polite()).toBe("");
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
