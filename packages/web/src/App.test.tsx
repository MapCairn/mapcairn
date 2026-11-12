// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BASEMAPS,
  type BasemapDefinition,
  boundsAroundPoint,
  createBasemapCatalogue,
  createFakeServices,
  FAKE_VECTOR_BASEMAP,
  FakeMapAdapter,
  type FakeServices,
  type MapMountOptions,
  MemorySettingsStore,
  SAMPLE_LAYERS,
  type SearchResult,
  StaticLayerRegistry,
  samplePoint,
} from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  WEBGL_UNAVAILABLE_ADVICE,
  WEBGL_UNAVAILABLE_TITLE,
} from "./app/MapUnavailable";
import { TOUR_VERSION } from "./app/tourVersion";
import { LOCATE_MAX_FIT_RADIUS_METRES, LOCATE_ZOOM } from "./app/useMapApp";
import { SAVE_VIEW_DELAY_MS } from "./app/useViewPersistence";
import { HOST_BASEMAP_CATALOGUE } from "./basemaps/hostBasemaps";

// Each test mounts the whole app; under coverage instrumentation a cold one
// can pass the default 5 s.
vi.setConfig({ testTimeout: 20_000 });

const CAPE_TOWN: SearchResult = {
  id: "cape-town",
  label: "Cape Town",
  centre: { lat: -33.92, lng: 18.42 },
};

/** Lets mount and basemap promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderApp(
  services: FakeServices = createFakeServices(),
  { firstVisit = false }: { readonly firstVisit?: boolean } = {},
) {
  // Every test but the tour's starts as a returning visitor, so the welcome
  // card is not in its tree, its Tab order or its announcements.
  if (!firstVisit && services.settings.get().tourSeen === null) {
    services.settings.set({ tourSeen: TOUR_VERSION });
  }
  // The app uses React Router for its Reload action, so it renders in a stub.
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
const adapter = (services: FakeServices) => {
  const latest = services.fakes.maps.at(-1);
  if (!latest) {
    throw new Error("no map adapter");
  }
  return latest;
};
function expectNear(
  actual: { lat: number; lng: number },
  expected: { lat: number; lng: number },
) {
  expect(actual.lat).toBeCloseTo(expected.lat, 6);
  expect(actual.lng).toBeCloseTo(expected.lng, 6);
}
const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "modelContext");
});

describe("App data layers", () => {
  function servicesWithLayers() {
    return createFakeServices({
      layers: new StaticLayerRegistry(SAMPLE_LAYERS),
    });
  }

  it("turns on the layers a shared link names, and keeps them in the link as the map moves", async () => {
    const services = servicesWithLayers();
    services.fakes.layerSource.setFeatures("sample-points", [samplePoint("a")]);
    services.fakes.url.write({
      view: { center: { lat: 1, lng: 2 }, zoom: 7, bearing: 0 },
      layers: {
        enabled: ["sample-imagery", "sample-points"],
        controls: { "sample-points": { window: "hour" } },
      },
    });
    await renderApp(services);
    await settle();
    expect(
      adapter(services)
        .drawnLayers()
        .map((layer) => layer.id),
    ).toEqual(["sample-imagery", "sample-points"]);
    act(() => {
      adapter(services).setView({ zoom: 5 });
    });
    expect(services.fakes.url.read().layers).toEqual({
      enabled: ["sample-imagery", "sample-points"],
      controls: {
        "sample-imagery": expect.objectContaining({ opacity: "0.8" }),
        "sample-points": { window: "hour", small: "false" },
      },
    });
  });

  it("opens the Layers section on a feature's card when its point is tapped", async () => {
    const services = servicesWithLayers();
    services.fakes.layerSource.setFeatures("sample-points", [
      samplePoint("a", { title: "Alpha" }),
    ]);
    services.fakes.url.write({
      layers: { enabled: ["sample-points"], controls: {} },
    });
    await renderApp(services);
    await settle();
    act(() => adapter(services).simulateFeatureTap("sample-points", "a"));
    expect(sheet()).toHaveAttribute("data-state", "open");
    expect(
      within(sheet()).getByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Map credits" }),
    ).toBeInTheDocument();
  });

  describe("keeping the card and the map on screen together", () => {
    async function openCardAtPeek() {
      const services = servicesWithLayers();
      services.fakes.layerSource.setFeatures("sample-points", [
        samplePoint("a", { title: "Alpha" }),
        samplePoint("b", { title: "Beta" }, [30, 40]),
      ]);
      services.fakes.url.write({
        layers: { enabled: ["sample-points"], controls: {} },
      });
      await renderApp(services);
      await settle();
      act(() => adapter(services).simulateFeatureTap("sample-points", "a"));
      expect(sheet()).toHaveAttribute("data-detent", "half");
      const resize = screen.getByRole("button", { name: "Resize panel" });
      fireEvent.click(resize);
      fireEvent.click(resize);
      expect(sheet()).toHaveAttribute("data-detent", "peek");
      return services;
    }

    it("raises a peeking sheet to half when Show on map is pressed, so the card stays in view", async () => {
      await openCardAtPeek();
      fireEvent.click(screen.getByTestId("feature-card-show"));
      expect(sheet()).toHaveAttribute("data-detent", "half");
    });

    it("lowers a full sheet to half, so the map shows", async () => {
      await openCardAtPeek();
      fireEvent.click(screen.getByRole("button", { name: "Resize panel" }));
      expect(sheet()).toHaveAttribute("data-detent", "half");
      fireEvent.click(screen.getByRole("button", { name: "Resize panel" }));
      expect(sheet()).toHaveAttribute("data-detent", "full");
      fireEvent.click(screen.getByTestId("feature-card-show"));
      expect(sheet()).toHaveAttribute("data-detent", "half");
    });

    it("raises a peeking sheet to half when another point is tapped", async () => {
      const services = await openCardAtPeek();
      act(() => adapter(services).simulateFeatureTap("sample-points", "b"));
      expect(sheet()).toHaveAttribute("data-detent", "half");
      expect(
        within(sheet()).getByRole("heading", { name: "Beta" }),
      ).toBeInTheDocument();
    });
  });

  describe("several features under one tap", () => {
    async function openWithTwo() {
      const services = servicesWithLayers();
      services.fakes.layerSource.setFeatures("sample-points", [
        samplePoint("a", { title: "Alpha" }),
        samplePoint("b", { title: "Beta" }, [30, 40]),
      ]);
      services.fakes.url.write({
        layers: { enabled: ["sample-points"], controls: {} },
      });
      await renderApp(services);
      await settle();
      return services;
    }

    it("opens a list to choose from, and each row opens its card", async () => {
      const services = await openWithTwo();
      act(() =>
        adapter(services).simulateFeatureHits([
          { layerId: "sample-points", featureId: "a" },
          { layerId: "sample-points", featureId: "b" },
        ]),
      );
      expect(sheet()).toHaveAttribute("data-state", "open");
      const list = within(sheet()).getByTestId("feature-choices");
      expect(within(list).getAllByTestId("feature-choices-row")).toHaveLength(
        2,
      );
      fireEvent.click(within(list).getByRole("button", { name: /Beta/ }));
      expect(
        within(sheet()).getByRole("heading", { name: "Beta" }),
      ).toBeInTheDocument();
      fireEvent.click(within(sheet()).getByTestId("feature-card-back"));
      expect(
        within(sheet()).getByTestId("feature-choices"),
      ).toBeInTheDocument();
    });

    it("opens the same list from the keyboard with I, and says when nothing is there", async () => {
      const services = await openWithTwo();
      fireEvent.keyDown(region(), { key: "i" });
      expect(sheet()).toHaveAttribute("data-state", "closed");
      await vi.waitFor(() =>
        expect(polite()).toBe("No features at the centre of the map."),
      );
      act(() =>
        adapter(services).simulateFeatureHits([
          { layerId: "sample-points", featureId: "a" },
          { layerId: "sample-points", featureId: "b" },
        ]),
      );
      fireEvent.keyDown(region(), { key: "Escape" });
      expect(sheet()).toHaveAttribute("data-state", "closed");
      fireEvent.keyDown(region(), { key: "i" });
      expect(sheet()).toHaveAttribute("data-state", "open");
      expect(
        within(sheet()).getByTestId("feature-choices-heading"),
      ).toHaveTextContent("2 features here");
    });
  });

  it("ignores taps on points while measuring", async () => {
    const services = servicesWithLayers();
    services.fakes.layerSource.setFeatures("sample-points", [samplePoint("a")]);
    services.fakes.url.write({
      layers: { enabled: ["sample-points"], controls: {} },
    });
    await renderApp(services);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Measure distance and area" }),
    );
    act(() => adapter(services).simulateFeatureTap("sample-points", "a"));
    expect(sheet()).toHaveAttribute("data-state", "closed");
  });
});

describe("App", () => {
  it("mounts the map region with its chrome", async () => {
    await renderApp();
    expect(region()).toHaveAttribute("id", "map");
    expect(region()).toHaveAttribute("data-map-host", "");
    expect(region()).toHaveAttribute("data-zoom", "2.00");
    expect(
      screen.getByRole("combobox", { name: "Search places" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Map options" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Map credits" }),
    ).toBeInTheDocument();
    expect(sheet()).toHaveAttribute("data-state", "closed");
  });

  it("starts from a shared link, then the saved view", async () => {
    const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
    const services = createFakeServices();
    services.fakes.url.write({
      view: { center: { lat: 1, lng: 2 }, zoom: 7, bearing: 0 },
      basemapId: "osm",
    });
    services.fakes.settings.set({ basemapId: "positron" });
    await renderApp(services);
    expect(region()).toHaveAttribute("data-zoom", "7.00");
    const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
    expect(options.basemap.id).toBe("osm");
    // The link's basemap is shown without replacing the saved choice.
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });

  it("writes settled views to the link and saves the last view", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const services = await renderApp();
    act(() => {
      adapter(services).setView({ zoom: 5 });
    });
    expect(services.fakes.url.read().view?.zoom).toBe(5);
    expect(services.fakes.url.read().basemapId).toBe("bright");
    expect(services.fakes.settings.get().lastView).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SAVE_VIEW_DELAY_MS);
    });
    expect(services.fakes.settings.get().lastView?.zoom).toBe(5);
  });
});

describe("surfaces", () => {
  it("keeps one surface open at a time", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    expect(sheet()).toHaveAttribute("data-state", "open");

    fireEvent.click(
      screen.getByRole("button", { name: "Measure distance and area" }),
    );
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(screen.getByTestId("measure-toolbar")).toBeInTheDocument();

    fireEvent.focus(screen.getByRole("combobox", { name: "Search places" }));
    expect(screen.queryByTestId("measure-toolbar")).toBeNull();
  });

  it("closes the sheet with Escape and returns focus to Map options", async () => {
    await renderApp();
    const mapOptions = screen.getByRole("button", { name: "Map options" });
    fireEvent.click(mapOptions);
    expect(sheet()).toHaveAttribute("data-state", "open");
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(mapOptions);
  });

  it("returns focus to Map options when the sheet closes at full height", async () => {
    // As in a browser, an element inside an inert subtree cannot take focus.
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (this.closest("[inert]") === null) {
        focus.call(this, options);
      }
    });
    await renderApp();
    const mapOptions = screen.getByRole("button", { name: "Map options" });
    fireEvent.click(mapOptions);
    fireEvent.click(screen.getByRole("button", { name: "Resize panel" }));
    expect(sheet()).toHaveAttribute("data-detent", "full");
    expect(sheet()).toHaveAttribute("aria-modal", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(mapOptions);
  });

  it("closes measuring with Escape from the toolbar and returns focus to Measure", async () => {
    await renderApp();
    const measure = screen.getByRole("button", {
      name: "Measure distance and area",
    });
    fireEvent.click(measure);
    fireEvent.keyDown(screen.getByTestId("measure-done"), { key: "Escape" });
    expect(screen.queryByTestId("measure-toolbar")).toBeNull();
    expect(document.activeElement).toBe(measure);
  });

  it("closes the open surface with Escape on the map", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(sheet()).toHaveAttribute("data-state", "closed");
  });

  it("does not move focus when a surface closes because another opened", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    const input = screen.getByRole("combobox", { name: "Search places" });
    input.focus();
    fireEvent.focus(input);
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(input);
  });
});

describe("Settings button", () => {
  const options = () => screen.getByRole("button", { name: "Map options" });
  const settings = () => screen.getByRole("button", { name: "Settings" });
  const title = () => within(sheet()).getByRole("heading", { level: 2 });

  it("sits last in the main control group and opens the sheet on Settings and Help", async () => {
    await renderApp();
    const labels = within(screen.getByRole("group", { name: "Map controls" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(labels.at(-1)).toBe("Settings");
    expect(settings()).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(settings());
    expect(sheet()).toHaveAttribute("data-state", "open");
    expect(title()).toHaveTextContent("Settings and help");
    expect(
      within(sheet()).getByRole("region", { name: "Settings" }),
    ).toBeInTheDocument();
    // The sheet title and the Settings section must not share a name.
    expect(
      within(sheet()).getAllByRole("heading", { name: "Settings" }),
    ).toHaveLength(1);
    expect(
      within(sheet()).getByRole("region", { name: "Help" }),
    ).toBeInTheDocument();
    expect(
      within(sheet()).queryByRole("region", { name: "Basemap" }),
    ).toBeNull();
    expect(settings()).toHaveAttribute("aria-expanded", "true");
    expect(options()).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves Settings and Help out of the Map options sheet", async () => {
    await renderApp();
    fireEvent.click(options());
    expect(title()).toHaveTextContent("Map options");
    expect(
      within(sheet()).getByRole("region", { name: "Basemap" }),
    ).toBeInTheDocument();
    expect(
      within(sheet()).queryByRole("region", { name: "Settings" }),
    ).toBeNull();
    expect(within(sheet()).queryByRole("region", { name: "Help" })).toBeNull();
    expect(options()).toHaveAttribute("aria-expanded", "true");
    expect(settings()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when pressed again, and returns focus to it", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.click(settings());
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(settings());
  });

  it("returns focus to it when Escape closes the sheet", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(settings());
  });

  it("switches between the two sheets without closing, keeping focus on the opener last used", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.click(options());
    expect(sheet()).toHaveAttribute("data-state", "open");
    expect(title()).toHaveTextContent("Map options");
    expect(options()).toHaveAttribute("aria-expanded", "true");
    expect(settings()).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(settings());
    expect(sheet()).toHaveAttribute("data-state", "open");
    expect(title()).toHaveTextContent("Settings and help");
    expect(settings()).toHaveAttribute("aria-expanded", "true");
    expect(options()).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(document.activeElement).toBe(settings());
  });

  it("returns focus to Map options when the sheet was last switched to it", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.click(options());
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(options());
  });

  it("moves to the options group when a pin is dropped from the settings sheet", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.keyDown(region(), { key: "p" });
    expect(title()).toHaveTextContent("Map options");
    expect(screen.getByTestId("pin-card")).toBeInTheDocument();
    expect(settings()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Settings over other surfaces", () => {
  const options = () => screen.getByRole("button", { name: "Map options" });
  const settings = () => screen.getByRole("button", { name: "Settings" });
  const measureButton = () =>
    screen.getByRole("button", { name: "Measure distance and area" });
  const title = (hidden = false) =>
    within(sheet()).getByRole("heading", { level: 2, hidden });

  it("closes with its Close button and returns focus to Settings", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close" }));
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(document.activeElement).toBe(settings());
  });

  it("keeps the Settings title while the sheet closes", async () => {
    await renderApp();
    fireEvent.click(settings());
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(sheet()).toHaveAttribute("data-state", "closed");
    expect(title(true)).toHaveTextContent("Settings and help");
    fireEvent.click(options());
    expect(title()).toHaveTextContent("Map options");
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(title(true)).toHaveTextContent("Map options");
  });

  describe("over measuring", () => {
    async function measureTwoPoints() {
      const services = await renderApp();
      fireEvent.click(measureButton());
      act(() => adapter(services).simulateClick({ lat: 1, lng: 1 }));
      act(() => adapter(services).simulateClick({ lat: 1, lng: 2 }));
      const readout = screen.getByTestId("measure-readout").textContent ?? "";
      expect(readout).not.toBe("0 m");
      return readout;
    }

    it("keeps the points and returns to the tool, with focus on Measure", async () => {
      const readout = await measureTwoPoints();
      fireEvent.click(settings());
      expect(title()).toHaveTextContent("Settings and help");
      expect(screen.queryByTestId("measure-toolbar")).toBeNull();
      expect(measureButton()).toHaveAttribute("aria-pressed", "false");

      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(screen.getByTestId("measure-toolbar")).toBeInTheDocument();
      expect(screen.getByTestId("measure-readout")).toHaveTextContent(readout);
      expect(measureButton()).toHaveAttribute("aria-pressed", "true");
      expect(document.activeElement).toBe(measureButton());
    });

    it("does the same after switching to Map options and closing with Close", async () => {
      const readout = await measureTwoPoints();
      fireEvent.click(settings());
      fireEvent.click(options());
      expect(title()).toHaveTextContent("Map options");
      fireEvent.click(within(sheet()).getByRole("button", { name: "Close" }));
      expect(screen.getByTestId("measure-readout")).toHaveTextContent(readout);
      expect(document.activeElement).toBe(measureButton());
    });

    it("returns to the measurement when Measure is pressed with the sheet open", async () => {
      const readout = await measureTwoPoints();
      fireEvent.click(settings());
      fireEvent.click(measureButton());
      expect(sheet()).toHaveAttribute("data-state", "closed");
      expect(screen.getByTestId("measure-readout")).toHaveTextContent(readout);
    });

    it("loses the measurement when Done was pressed first", async () => {
      await measureTwoPoints();
      fireEvent.click(screen.getByTestId("measure-done"));
      fireEvent.click(settings());
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(screen.queryByTestId("measure-toolbar")).toBeNull();
      fireEvent.click(measureButton());
      expect(screen.getByTestId("measure-readout")).toHaveTextContent("0 m");
    });
  });

  describe("over drawing", () => {
    async function drawTwoPoints() {
      const services = await renderApp();
      fireEvent.click(screen.getByRole("button", { name: "Draw shapes" }));
      act(() => adapter(services).simulateClick({ lat: 1, lng: 1 }));
      act(() => adapter(services).simulateClick({ lat: 1, lng: 2 }));
      expect(screen.getByTestId("draw-status")).toHaveTextContent(
        "Polygon 1, 2 points",
      );
    }
    const shapesButton = () =>
      screen.getByRole("button", { name: "Shapes and export" });

    it("resumes the unfinished shape with focus on Shapes", async () => {
      await drawTwoPoints();
      fireEvent.click(settings());
      expect(title()).toHaveTextContent("Settings and help");
      expect(screen.queryByTestId("draw-toolbar")).toBeNull();
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(screen.getByTestId("draw-status")).toHaveTextContent(
        "Polygon 1, 2 points",
      );
      expect(document.activeElement).toBe(shapesButton());
    });

    it("resumes it after switching to Map options too", async () => {
      await drawTwoPoints();
      fireEvent.click(settings());
      fireEvent.click(options());
      fireEvent.click(within(sheet()).getByRole("button", { name: "Close" }));
      expect(screen.getByTestId("draw-status")).toHaveTextContent(
        "Polygon 1, 2 points",
      );
      expect(document.activeElement).toBe(shapesButton());
    });

    it("opens Map options, not Settings, from Shapes and export, and resumes", async () => {
      await drawTwoPoints();
      fireEvent.click(shapesButton());
      expect(title()).toHaveTextContent("Map options");
      expect(settings()).toHaveAttribute("aria-expanded", "false");
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(document.activeElement).toBe(shapesButton());
    });
  });

  describe("over directions and search", () => {
    it("replaces the directions panel, titled Settings, and returns focus to Settings", async () => {
      await renderApp();
      fireEvent.click(screen.getByRole("button", { name: "Directions" }));
      expect(title()).toHaveTextContent("Directions");
      fireEvent.click(settings());
      expect(title()).toHaveTextContent("Settings and help");
      expect(
        within(sheet()).getByRole("region", { name: "Settings" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Directions" }),
      ).toHaveAttribute("aria-pressed", "false");
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(sheet()).toHaveAttribute("data-state", "closed");
      expect(document.activeElement).toBe(settings());
    });

    it("replaces search, titled Settings, and returns focus to Settings", async () => {
      await renderApp();
      fireEvent.focus(screen.getByRole("combobox", { name: "Search places" }));
      fireEvent.click(settings());
      expect(sheet()).toHaveAttribute("data-state", "open");
      expect(title()).toHaveTextContent("Settings and help");
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(document.activeElement).toBe(settings());
    });
  });

  describe("paths that open Map options from the Settings sheet", () => {
    it("lands a dropped pin card in the Map options group, and Escape leaves focus on the map", async () => {
      await renderApp();
      fireEvent.click(settings());
      fireEvent.keyDown(region(), { key: "p" });
      expect(title()).toHaveTextContent("Map options");
      expect(screen.getByTestId("pin-card")).toBeInTheDocument();
      expect(
        within(sheet()).queryByRole("region", { name: "Settings" }),
      ).toBeNull();
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(sheet()).toHaveAttribute("data-state", "closed");
      expect(document.activeElement).toBe(region());
    });

    it("lands a tapped feature in Map options, and Escape returns focus to Map options", async () => {
      const services = createFakeServices({
        layers: new StaticLayerRegistry(SAMPLE_LAYERS),
      });
      services.fakes.layerSource.setFeatures("sample-points", [
        samplePoint("a"),
      ]);
      services.fakes.url.write({
        layers: { enabled: ["sample-points"], controls: {} },
      });
      await renderApp(services);
      await settle();
      fireEvent.click(settings());
      act(() => adapter(services).simulateFeatureTap("sample-points", "a"));
      expect(title()).toHaveTextContent("Map options");
      expect(
        within(sheet()).getByRole("region", { name: "Layers" }),
      ).toBeInTheDocument();
      expect(
        within(sheet()).queryByRole("region", { name: "Help" }),
      ).toBeNull();
      fireEvent.keyDown(sheet(), { key: "Escape" });
      expect(document.activeElement).toBe(options());
    });
  });
});

describe("pins", () => {
  it("drops a pin at the centre with P, shows the card and focuses its heading", async () => {
    const services = await renderApp();
    fireEvent.keyDown(region(), { key: "p" });
    const centre = adapter(services).getView().center;
    expect(sheet()).toHaveAttribute("data-state", "open");
    expect(sheet()).toHaveAttribute("data-detent", "half");
    expect(screen.getByTestId("pin-card")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId("pin-card-heading"));
    expect(screen.getByTestId("pin-marker")).toBeInTheDocument();
    expect(polite()).toMatch(/^Pin dropped at /);
    expect(centre).toBeDefined();
  });

  it("drops a pin where the map is long-pressed", async () => {
    const services = await renderApp();
    fireEvent.contextMenu(region(), { clientX: 30, clientY: 40 });
    const expected = adapter(services).unproject({ x: 30, y: 40 });
    expect(screen.getByTestId("pin-card")).toBeInTheDocument();
    expect(screen.getByTestId("pin-coordinates").textContent).toBeTruthy();
    expect(polite()).toContain(expected.lat.toFixed(2).slice(0, 4));
  });

  it("drops a pin from the sheet's button and clears it", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    fireEvent.click(screen.getByTestId("drop-pin-button"));
    expect(screen.getByTestId("pin-card")).toBeInTheDocument();
    expect(screen.getByTestId("pin-note")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pin-clear"));
    expect(screen.queryByTestId("pin-marker")).toBeNull();
    expect(sheet()).toHaveAttribute("data-state", "closed");
    await vi.waitFor(() => expect(polite()).toBe("Pin removed"));
  });
});

describe("measuring", () => {
  it("adds points at the map centre and from map clicks only while measuring", async () => {
    const services = await renderApp();
    act(() => {
      adapter(services).simulateClick({ lat: 1, lng: 1 });
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Measure distance and area" }),
    );
    expect(screen.getByTestId("measure-readout")).toHaveTextContent("0 m");
    fireEvent.click(screen.getByTestId("measure-add-point"));
    act(() => {
      adapter(services).simulateClick({ lat: 0, lng: 1 });
    });
    expect(screen.getByTestId("measure-readout")).not.toHaveTextContent(
      /^0 m$/,
    );
    expect(screen.getByTestId("centre-crosshair")).toBeInTheDocument();
    expect(region()).not.toHaveClass(/grab/);

    fireEvent.click(screen.getByTestId("measure-done"));
    expect(screen.queryByTestId("measure-toolbar")).toBeNull();
  });
});

describe("locate", () => {
  it("shows a location error once, in the banner, without announcing it again", async () => {
    const services = createFakeServices();
    services.fakes.location.failWith("denied");
    await renderApp(services);
    fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
    await settle();
    const banner = screen.getByTestId("locate-error");
    expect(banner).toHaveTextContent(/Location access is blocked/);
    expect(screen.getAllByRole("alert").map((el) => el.textContent)).toContain(
      "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
    );
    expect(assertive()).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("locate-error")).toBeNull();
  });

  /** Gives every element an 800 by 600 box, so the fake map has room to fit a fix in. */
  function sizeTheMap(): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ width: 800, height: 600 }),
    );
  }

  it("flies to a fix and draws its accuracy", async () => {
    sizeTheMap();
    const services = await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
    await settle();
    expect(screen.getByTestId("accuracy-circle")).toBeInTheDocument();
    expect(adapter(services).getView().zoom).toBeGreaterThanOrEqual(15);
    expect(polite()).toMatch(/^Location found/);
  });

  describe("a coarse fix", () => {
    async function locateWithAccuracy(accuracyMetres: number) {
      sizeTheMap();
      const services = createFakeServices();
      services.fakes.location.setFix({
        position: { lat: -33.92, lng: 18.42 },
        accuracyMetres,
        timestamp: 0,
      });
      await renderApp(services);
      fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
      await settle();
      return adapter(services);
    }

    it("shows the whole accuracy circle, so it does not fill the screen", async () => {
      const map = await locateWithAccuracy(5000);
      const view = map.getView();
      expect(view.zoom).toBeLessThan(LOCATE_ZOOM);
      expect(view.center.lat).toBeCloseTo(-33.92, 6);
      expect(view.center.lng).toBeCloseTo(18.42, 6);
      const circle = boundsAroundPoint({ lat: -33.92, lng: 18.42 }, 5000);
      const southWest = map.project({ lat: circle.south, lng: circle.west });
      const northEast = map.project({ lat: circle.north, lng: circle.east });
      expect(southWest.x).toBeGreaterThanOrEqual(0);
      expect(northEast.y).toBeGreaterThanOrEqual(0);
      expect(northEast.x).toBeLessThanOrEqual(800);
      expect(southWest.y).toBeLessThanOrEqual(600);
    });

    it("zooms out no further than for a fix of LOCATE_MAX_FIT_RADIUS_METRES", async () => {
      const capped = (
        await locateWithAccuracy(LOCATE_MAX_FIT_RADIUS_METRES)
      ).getView().zoom;
      cleanup();
      const coarser = (await locateWithAccuracy(500_000)).getView().zoom;
      expect(coarser).toBeCloseTo(capped, 6);
    });
  });
});

describe("basemaps", () => {
  it("stores a basemap chosen in the sheet and swaps it on the same engine", async () => {
    const services = await renderApp();
    const setBasemap = vi.spyOn(adapter(services), "setBasemap");
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    fireEvent.click(
      screen
        .getByTestId("basemap-option-osm")
        .querySelector("input") as HTMLInputElement,
    );
    await settle();
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    expect(setBasemap).toHaveBeenCalledWith(
      expect.objectContaining({ id: "osm", name: "Streets" }),
      { saveData: false },
    );
    expect(services.fakes.maps).toHaveLength(1);
    await vi.waitFor(() =>
      expect(polite()).toMatch(/^Basemap changed to Streets/),
    );
  });

  describe("a basemap that cannot load", () => {
    async function chooseFailingStreets() {
      const services = createFakeServices();
      services.fakes.settings.set({ basemapId: "positron" });
      await renderApp(services);
      adapter(services).failNextBasemap();
      fireEvent.click(screen.getByRole("button", { name: "Map options" }));
      fireEvent.click(radio("osm"));
      await settle();
      return services;
    }

    function radio(id: string): HTMLInputElement {
      return screen
        .getByTestId(`basemap-option-${id}`)
        .querySelector("input") as HTMLInputElement;
    }

    it("says so, keeps the previous basemap and saves nothing", async () => {
      const services = await chooseFailingStreets();
      const banner = screen.getByTestId("basemap-error");
      expect(within(banner).getByRole("alert")).toHaveTextContent(
        "That basemap could not be loaded.",
      );
      expect(
        within(banner).queryByRole("button", { name: "Reload" }),
      ).toBeNull();
      expect(screen.queryByTestId("engine-error")).toBeNull();
      expect(region()).not.toHaveAttribute("data-state", "error");
      expect(services.fakes.settings.get().basemapId).toBe("positron");
      expect(services.fakes.url.read().basemapId).not.toBe("osm");
      expect(services.fakes.maps).toHaveLength(1);
    });

    it("goes back to the previous basemap in the picker, without another swap", async () => {
      const services = await chooseFailingStreets();
      const setBasemap = vi.spyOn(adapter(services), "setBasemap");
      fireEvent.click(
        screen.getByRole("button", { name: "Use previous basemap" }),
      );
      await settle();
      expect(screen.queryByTestId("basemap-error")).toBeNull();
      expect(radio("positron")).toBeChecked();
      expect(radio("osm")).not.toBeChecked();
      expect(setBasemap).not.toHaveBeenCalled();
      expect(services.fakes.settings.get().basemapId).toBe("positron");
    });

    it("goes back to the previous basemap when the message is dismissed", async () => {
      const services = await chooseFailingStreets();
      const setBasemap = vi.spyOn(adapter(services), "setBasemap");
      fireEvent.click(
        within(screen.getByTestId("basemap-error")).getByRole("button", {
          name: "Dismiss",
        }),
      );
      await settle();
      expect(screen.queryByTestId("basemap-error")).toBeNull();
      expect(radio("positron")).toBeChecked();
      expect(setBasemap).not.toHaveBeenCalled();
    });

    it("saves the basemap once a later attempt loads", async () => {
      const services = await chooseFailingStreets();
      fireEvent.click(radio("liberty"));
      await settle();
      expect(screen.queryByTestId("basemap-error")).toBeNull();
      expect(services.fakes.settings.get().basemapId).toBe("liberty");
      expect(services.fakes.url.read().basemapId).toBe("liberty");
    });
  });

  describe("a basemap whose provider is down", () => {
    function radio(id: string): HTMLInputElement {
      return screen
        .getByTestId(`basemap-option-${id}`)
        .querySelector("input") as HTMLInputElement;
    }

    it("goes back to the previous basemap and says which one is not available, without the tile error", async () => {
      const services = createFakeServices();
      services.fakes.settings.set({ basemapId: "positron" });
      await renderApp(services);
      fireEvent.click(screen.getByRole("button", { name: "Map options" }));
      fireEvent.click(radio("osm"));
      await settle();
      const setBasemap = vi.spyOn(adapter(services), "setBasemap");
      act(() => {
        adapter(services).simulateTileError();
        adapter(services).simulateBasemapUnavailable();
      });
      await settle();

      const banner = screen.getByTestId("basemap-error");
      expect(banner).toHaveTextContent("Streets is not available right now.");
      expect(
        within(banner).getByRole("button", { name: "Use previous basemap" }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("tile-error")).toBeNull();
      expect(setBasemap).toHaveBeenCalledWith(
        expect.objectContaining({ id: "positron" }),
        { saveData: false },
      );

      fireEvent.click(
        within(banner).getByRole("button", { name: "Use previous basemap" }),
      );
      await settle();
      expect(screen.queryByTestId("basemap-error")).toBeNull();
      expect(radio("positron")).toBeChecked();
      expect(services.fakes.settings.get().basemapId).toBe("positron");
    });

    it("tells a fallback from staying put by id, so a fallback that shares the failed basemap's name still offers to go back", async () => {
      // A host may offer two basemaps with one name, from different providers.
      const services = createFakeServices({
        basemaps: createBasemapCatalogue(
          BASEMAPS.map((item) =>
            item.id === "osm" ? { ...item, name: "Bright" } : item,
          ),
          "bright",
        ),
      });
      services.fakes.settings.set({ basemapId: "osm" });
      await renderApp(services);
      act(() => {
        adapter(services).simulateBasemapUnavailable();
      });
      await settle();

      const banner = screen.getByTestId("basemap-error");
      expect(banner).toHaveTextContent("Bright is not available right now.");
      expect(
        within(banner).getByRole("button", { name: "Use previous basemap" }),
      ).toBeInTheDocument();
    });

    it("stays put with no Use previous basemap when no other basemap is left, and can be dismissed", async () => {
      const services = await renderApp();
      const setBasemap = vi.spyOn(adapter(services), "setBasemap");
      act(() => {
        adapter(services).simulateBasemapUnavailable();
      });
      await settle();

      const banner = screen.getByTestId("basemap-error");
      expect(banner).toHaveTextContent("Bright is not available right now.");
      expect(
        within(banner).queryByRole("button", { name: "Use previous basemap" }),
      ).toBeNull();
      expect(setBasemap).not.toHaveBeenCalled();

      fireEvent.click(within(banner).getByRole("button", { name: "Dismiss" }));
      await settle();
      expect(screen.queryByTestId("basemap-error")).toBeNull();
    });
  });

  it("starts on Bright in a dark theme as well as a light one", async () => {
    for (const theme of ["light", "dark"] as const) {
      const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
      const services = createFakeServices();
      services.fakes.settings.set({ theme });
      await renderApp(services);
      const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
      expect(options.basemap.id, theme).toBe("bright");
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("keeps a chosen basemap whatever the theme", async () => {
    const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
    const services = createFakeServices();
    services.fakes.settings.set({ theme: "dark", basemapId: "positron" });
    await renderApp(services);
    const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
    expect(options.basemap.id).toBe("positron");
  });

  it("keeps a saved or linked Liberty on Liberty, now that Bright is the default", async () => {
    const choices = [
      { saved: "liberty", linked: undefined },
      { saved: "positron", linked: "liberty" },
    ];
    for (const { saved, linked } of choices) {
      const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
      const services = createFakeServices();
      services.fakes.settings.set({ basemapId: saved });
      if (linked !== undefined) {
        services.fakes.url.write({ basemapId: linked });
      }
      await renderApp(services);
      const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
      expect(options.basemap.id, `${saved} ${linked}`).toBe("liberty");
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("treats a saved auto, Maptoolkit Dark or retired basemap as Bright, and leaves the saved value alone", async () => {
    for (const stored of ["auto", "maptoolkit-dark", "retired-basemap"]) {
      const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
      const services = createFakeServices();
      services.fakes.settings.set({ theme: "dark", basemapId: stored });
      await renderApp(services);
      const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
      expect(options.basemap.id, stored).toBe("bright");
      fireEvent.click(screen.getByRole("button", { name: "Map options" }));
      expect(
        screen.getByTestId("basemap-option-bright").querySelector("input"),
      ).toBeChecked();
      expect(
        screen.queryByRole("switch", { name: /match the map/i }),
      ).toBeNull();
      expect(services.fakes.settings.get().basemapId).toBe(stored);
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("shows a message in place of the map when WebGL is missing, with no Retry or Reload", async () => {
    const services = createFakeServices({
      createMapAdapter: () =>
        new FakeMapAdapter({ failMount: "webgl-unavailable" }),
    });
    await renderApp(services);
    await settle();
    const message = screen.getByTestId("webgl-unavailable");
    expect(region()).toContainElement(message);
    expect(message).toHaveTextContent(WEBGL_UNAVAILABLE_TITLE);
    expect(message).toHaveTextContent(WEBGL_UNAVAILABLE_ADVICE);
    expect(WEBGL_UNAVAILABLE_TITLE).toBe(
      "MapCairn needs WebGL to draw the map.",
    );
    expect(WEBGL_UNAVAILABLE_ADVICE).toMatch(/different browser/);
    expect(WEBGL_UNAVAILABLE_ADVICE).toMatch(/hardware acceleration/);
    await vi.waitFor(() =>
      expect(assertive()).toBe(
        `${WEBGL_UNAVAILABLE_TITLE} ${WEBGL_UNAVAILABLE_ADVICE}`,
      ),
    );
    expect(screen.queryByTestId("engine-error")).toBeNull();
    expect(screen.queryByTestId("map-banners")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("shows no WebGL message when the map starts", async () => {
    await renderApp();
    expect(screen.queryByTestId("webgl-unavailable")).toBeNull();
  });

  it("offers Reload when no engine can start", async () => {
    const services = createFakeServices({
      createMapAdapter: () => new FakeMapAdapter({ failMount: "load-failed" }),
    });
    await renderApp(services);
    expect(screen.getByTestId("engine-error")).toHaveTextContent(
      "The map could not start.",
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("says the map stopped, as an alert with Reload, when the engine fails after loading", async () => {
    const services = await renderApp();
    act(() => {
      adapter(services).simulateFatalError();
    });
    const banner = screen.getByTestId("engine-error");
    expect(banner).toHaveTextContent(
      "The map stopped working. Reload the page to try again.",
    );
    expect(within(banner).getByRole("alert")).toBeInTheDocument();
    expect(
      within(banner).getByRole("button", { name: "Reload" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("tile-error")).toBeNull();
    expect(screen.queryByTestId("webgl-unavailable")).toBeNull();
  });

  it("hides the engine error when dismissed", async () => {
    const failing = createFakeServices({
      createMapAdapter: () => new FakeMapAdapter({ failMount: "load-failed" }),
    });
    await renderApp(failing);
    fireEvent.click(
      within(screen.getByTestId("engine-error")).getByRole("button", {
        name: "Dismiss",
      }),
    );
    expect(screen.queryByTestId("engine-error")).toBeNull();
  });

  it("hides a tile error when dismissed", async () => {
    const services = await renderApp();
    act(() => {
      adapter(services).simulateTileError();
    });
    fireEvent.click(
      within(screen.getByTestId("tile-error")).getByRole("button", {
        name: "Dismiss",
      }),
    );
    expect(screen.queryByTestId("tile-error")).toBeNull();
  });

  it("shows a tile error with Retry, which re-applies the basemap", async () => {
    const services = await renderApp();
    const setBasemap = vi.spyOn(adapter(services), "setBasemap");
    act(() => {
      adapter(services).simulateTileError();
    });
    expect(screen.getByTestId("tile-error")).toHaveTextContent(
      "Some of the map could not load.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(setBasemap).toHaveBeenCalled();
    expect(screen.queryByTestId("tile-error")).toBeNull();
  });
});

describe("zoom", () => {
  it("zooms with the buttons and announces the settled level", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const services = createFakeServices({
      settings: new MemorySettingsStore({ initial: { zoomButtons: true } }),
    });
    await renderApp(services);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(adapter(services).getView().zoom).toBe(3);
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(polite()).toMatch(/^Zoom level 3/);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(adapter(services).getView().zoom).toBe(2);
  });

  it("announces the settled level after a pinch or wheel on the map", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const services = await renderApp();
    act(() => {
      adapter(services).simulateUserZoom(4);
      adapter(services).simulateUserZoom(5);
    });
    // The view reaches the chrome on the next animation frame.
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(polite()).toMatch(/^Zoom level 5/);
  });

  it("does not announce a zoom made in code while the map has focus", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const services = await renderApp();
    region().focus();
    act(() => {
      adapter(services).setView({ zoom: 7 });
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(polite()).not.toMatch(/Zoom level/);
  });
});

describe("search", () => {
  it("flies to a chosen result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const services = createFakeServices();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    // happy-dom does no layout; give the map host a size so it has bounds to
    // leave out.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
    );
    await renderApp(services);
    const input = screen.getByRole("combobox", { name: "Search places" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Cape" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    // The privacy policy says only the query is sent, so the map has bounds
    // here but they never reach the provider.
    expect(services.fakes.search.searchCalls).toHaveLength(1);
    expect(services.fakes.search.searchCalls[0]?.options?.bias).toBeUndefined();
    fireEvent.click(screen.getByRole("option", { name: /Cape Town/ }));
    expectNear(adapter(services).getView().center, CAPE_TOWN.centre);
    expect(adapter(services).getView().zoom).toBe(14);
  });
});

describe("WebMCP tools", () => {
  type Tool = {
    name: string;
    execute: (input: unknown) => Promise<{ content: { text: string }[] }>;
  };

  async function renderWithTools(services = createFakeServices()) {
    const tools = new Map<string, Tool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: (tool: Tool) => {
          tools.set(tool.name, tool);
          return Promise.resolve();
        },
      },
    });
    await renderApp(services);
    const call = async (name: string, input: unknown) => {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`no tool ${name}`);
      }
      let text = "";
      await act(async () => {
        text = (await tool.execute(input)).content[0]?.text ?? "";
      });
      return text;
    };
    return { tools, call, services };
  }

  it("registers the map tools and no layer tools", async () => {
    const { tools } = await renderWithTools();
    expect([...tools.keys()].sort()).toEqual([
      "measure-area",
      "measure-distance",
      "search-map-location",
      "set-app-theme",
      "set-map-basemap",
    ]);
  });

  it("saves a basemap that is already on screen at once, replacing a saved auto choice", async () => {
    const services = createFakeServices();
    services.fakes.settings.set({ basemapId: "auto" });
    const { call } = await renderWithTools(services);
    const setBasemap = vi.spyOn(adapter(services), "setBasemap");
    expect(await call("set-map-basemap", { basemap: "bright" })).toBe(
      "Switched the basemap to bright.",
    );
    expect(services.fakes.settings.get().basemapId).toBe("bright");
    expect(setBasemap).not.toHaveBeenCalled();
  });

  it("sets the basemap and the theme", async () => {
    const { call, services } = await renderWithTools();
    expect(await call("set-map-basemap", { basemap: "osm" })).toBe(
      "Switched the basemap to osm.",
    );
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    expect(await call("set-map-basemap", { basemap: "nope" })).toMatch(
      /Unknown basemap/,
    );
    expect(await call("set-map-basemap", { basemap: "auto" })).toBe(
      'Unknown basemap "auto".',
    );
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    expect(await call("set-app-theme", { theme: "dark" })).toBe(
      "Switched the theme to dark.",
    );
    expect(services.fakes.settings.get().theme).toBe("dark");
    expect(await call("set-app-theme", { theme: "sepia" })).toMatch(
      /Unknown theme/,
    );
  });

  it("offers the basemaps of the catalogue the host supplies, so an agent cannot pick one the picker does not show", async () => {
    const services = createFakeServices({ basemaps: HOST_BASEMAP_CATALOGUE });
    const { tools, call } = await renderWithTools(services);
    expect(
      (
        tools.get("set-map-basemap") as unknown as {
          inputSchema: { properties: { basemap: { enum: string[] } } };
        }
      ).inputSchema.properties.basemap.enum,
    ).toEqual(["bright", "positron", "osm", "topographic", "dark"]);
    expect(await call("set-map-basemap", { basemap: "fiord" })).toBe(
      'Unknown basemap "fiord".',
    );
    // Satellite is in the picker, but its imagery's licence is non-commercial,
    // and an agent must not accept a provider's licence for a person.
    expect(await call("set-map-basemap", { basemap: "satellite" })).toBe(
      'Unknown basemap "satellite".',
    );
    expect(await call("set-map-basemap", { basemap: "topographic" })).toBe(
      "Switched the basemap to topographic.",
    );
    expect(services.fakes.settings.get().basemapId).toBe("topographic");
  });

  it("searches and flies to the best match", async () => {
    const services = createFakeServices();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    const { call } = await renderWithTools(services);
    expect(await call("search-map-location", { query: "cape" })).toBe(
      "Moved the map to Cape Town.",
    );
    expectNear(adapter(services).getView().center, CAPE_TOWN.centre);
  });

  it("measures along named places and shows the measurement", async () => {
    const services = createFakeServices();
    services.fakes.search.setResults("a", [
      { id: "a", label: "A", centre: { lat: 0, lng: 0 } },
    ]);
    services.fakes.search.setResults("b", [
      { id: "b", label: "B", centre: { lat: 0, lng: 1 } },
    ]);
    services.fakes.search.setResults("c", [
      { id: "c", label: "C", centre: { lat: 1, lng: 0 } },
    ]);
    const { call } = await renderWithTools(services);
    expect(await call("measure-distance", { locations: ["a"] })).toMatch(
      /at least two/,
    );
    expect(
      await call("measure-distance", { locations: ["a", "missing"] }),
    ).toBe('No place found for "missing".');
    expect(await call("measure-distance", { locations: ["a", "b"] })).toMatch(
      /^Distance along A → B: 111/,
    );
    expect(screen.getByTestId("measure-toolbar")).toBeInTheDocument();
    expect(await call("measure-area", { locations: ["a", "b", "c"] })).toMatch(
      /^Area enclosed by A, B, C: /,
    );
    expect(await call("measure-area", { locations: ["a", "b"] })).toMatch(
      /at least three/,
    );
  });
});

describe("a basemap only a host offers", () => {
  const HOSTED_BASEMAP: BasemapDefinition = {
    ...FAKE_VECTOR_BASEMAP,
    id: "fake-hosted",
    name: "Fake hosted",
  };
  const catalogue = createBasemapCatalogue([...BASEMAPS, HOSTED_BASEMAP]);

  const radio = (id: string) =>
    screen
      .getByTestId(`basemap-option-${id}`)
      .querySelector("input") as HTMLInputElement;

  describe("when the saved basemap cannot start the map", () => {
    async function renderFailing() {
      const base = createFakeServices({ basemaps: catalogue });
      let first = true;
      const services = {
        ...base,
        createMapAdapter: () => {
          const failing = first;
          first = false;
          return failing
            ? new FakeMapAdapter({ failMount: "load-failed" })
            : base.createMapAdapter();
        },
      };
      services.fakes.settings.set({ basemapId: "fake-hosted" });
      await renderApp(services);
      return services;
    }

    it("falls back to the default basemap and says which one could not be loaded", async () => {
      const services = await renderFailing();
      await settle();
      expect(screen.getByTestId("map-host")).toBeInTheDocument();
      expect(screen.getByTestId("basemap-error")).toHaveTextContent(
        "That basemap could not be loaded.",
      );
      expect(screen.queryByTestId("engine-error")).toBeNull();
      // The map drew the default one, and nothing was saved by the failure.
      expect(services.fakes.maps.at(-1)?.destroyed).toBe(false);
      expect(services.fakes.settings.get().basemapId).toBe("fake-hosted");
    });

    it("saves the default when the person goes back to it, so the picker follows the map", async () => {
      const services = await renderFailing();
      await settle();
      fireEvent.click(
        within(screen.getByTestId("basemap-error")).getByRole("button", {
          name: "Use previous basemap",
        }),
      );
      await settle();
      expect(screen.queryByTestId("basemap-error")).toBeNull();
      expect(services.fakes.settings.get().basemapId).toBe("bright");
      fireEvent.click(screen.getByRole("button", { name: "Map options" }));
      expect(radio("bright")).toBeChecked();
    });
  });
});

describe("the reference host's basemaps", () => {
  const radio = (id: string) =>
    screen
      .getByTestId(`basemap-option-${id}`)
      .querySelector("input") as HTMLInputElement;

  function hostServices() {
    return createFakeServices({ basemaps: HOST_BASEMAP_CATALOGUE });
  }

  it("shows six basemaps in the picker, Bright first and checked", async () => {
    await renderApp(hostServices());
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    const names = within(screen.getByRole("radiogroup", { name: "Basemap" }))
      .getAllByRole("radio")
      .map((option) => option.closest("label")?.textContent?.trim());
    expect(names).toEqual([
      "Bright",
      "Positron",
      "Streets",
      "Topographic",
      "Satellite",
      "Dark",
    ]);
    expect(radio("bright")).toBeChecked();
    for (const absent of ["liberty", "colorful", "fiord"]) {
      expect(
        screen.queryByTestId(`basemap-option-${absent}`),
        absent,
      ).toBeNull();
    }
  });

  it("opens a saved or linked Liberty, Colorful or Fiord on Bright, and leaves the saved value alone", async () => {
    for (const id of ["liberty", "colorful", "fiord"]) {
      for (const where of ["saved", "linked"] as const) {
        const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
        const services = hostServices();
        if (where === "saved") {
          services.fakes.settings.set({ basemapId: id });
        } else {
          services.fakes.url.write({ basemapId: id });
        }
        await renderApp(services);
        const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
        expect(options.basemap.id, `${where} ${id}`).toBe("bright");
        fireEvent.click(screen.getByRole("button", { name: "Map options" }));
        expect(radio("bright"), `${where} ${id}`).toBeChecked();
        if (where === "saved") {
          expect(services.fakes.settings.get().basemapId).toBe(id);
        }
        cleanup();
        vi.restoreAllMocks();
      }
    }
  });

  it("keeps a saved Dark or Topographic", async () => {
    for (const id of ["dark", "topographic"]) {
      const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
      const services = hostServices();
      services.fakes.settings.set({ basemapId: id });
      await renderApp(services);
      const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
      expect(options.basemap.id).toBe(id);
      cleanup();
      vi.restoreAllMocks();
    }
  });
});

describe("the first-visit tour", () => {
  const tourCard = () => screen.queryByTestId("tour-card");

  it("offers the welcome card on a first visit, after the search box, without taking focus", async () => {
    await renderApp(createFakeServices(), { firstVisit: true });
    const card = tourCard();
    expect(card).toHaveAccessibleName("New to MapCairn?");
    expect(card?.closest('[data-chrome="tour"]')).not.toBeNull();
    expect(card?.contains(document.activeElement)).toBe(false);
  });

  it("is not offered to a returning visitor, on a shared link, or when storage forgets", async () => {
    await renderApp(createFakeServices());
    expect(tourCard()).toBeNull();
    cleanup();

    const shared = createFakeServices();
    shared.fakes.url.write({
      view: { center: { lat: 1, lng: 2 }, zoom: 7, bearing: 0 },
    });
    await renderApp(shared, { firstVisit: true });
    expect(tourCard()).toBeNull();
    cleanup();

    const forgetful = createFakeServices({
      settings: new MemorySettingsStore({ persistent: false }),
    });
    await renderApp(forgetful, { firstVisit: true });
    expect(tourCard()).toBeNull();
  });

  it("opens Map options on Layers during the layer step, and advances when a layer is turned on", async () => {
    const services = createFakeServices({
      layers: new StaticLayerRegistry(SAMPLE_LAYERS),
    });
    await renderApp(services, { firstVisit: true });
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(services.settings.get().tourSeen).toBe(TOUR_VERSION);
    expect(screen.getByRole("button", { name: "Map options" })).toHaveAttribute(
      "data-tour-highlight",
      "true",
    );
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element,
    ) {
      scrolled.push(this);
    });
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    await settle();
    expect(scrolled).toContain(screen.getByRole("heading", { name: "Layers" }));
    const layersRegion = screen.getByTestId("sheet-section-layers");
    fireEvent.click(within(layersRegion).getAllByRole("switch")[0] as Element);
    await settle();
    expect(
      screen.getByRole("heading", { name: "Try the globe" }),
    ).toBeInTheDocument();
  });

  it("restarts from Help, closing the sheet and focusing the first step", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    await settle();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Turn on a layer" }),
    );
  });
});
