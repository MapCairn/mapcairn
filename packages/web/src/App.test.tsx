import {
  createFakeServices,
  FakeMapAdapter,
  type FakeServices,
  type MapMountOptions,
  MemorySettingsStore,
  type SearchResult,
} from "@karta/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@karta/map";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  WEBGL_UNAVAILABLE_ADVICE,
  WEBGL_UNAVAILABLE_TITLE,
} from "./app/MapUnavailable";
import { SAVE_VIEW_DELAY_MS } from "./app/useViewPersistence";

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

async function renderApp(services: FakeServices = createFakeServices()) {
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
    expect(services.fakes.url.read().basemapId).toBe("auto");
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

  it("flies to a fix and draws its accuracy", async () => {
    const services = await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
    await settle();
    expect(screen.getByTestId("accuracy-circle")).toBeInTheDocument();
    expect(adapter(services).getView().zoom).toBeGreaterThanOrEqual(15);
    expect(polite()).toMatch(/^Location found/);
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
    );
    expect(services.fakes.maps).toHaveLength(1);
    await vi.waitFor(() =>
      expect(polite()).toMatch(/^Basemap changed to Streets/),
    );
  });

  it("treats a saved basemap that no longer exists as Auto", async () => {
    const mount = vi.spyOn(FakeMapAdapter.prototype, "mount");
    const services = createFakeServices();
    services.fakes.settings.set({ basemapId: "retired-basemap" });
    await renderApp(services);
    const [, options] = mount.mock.calls[0] as [unknown, MapMountOptions];
    expect(options.basemap.id).toBe("positron");
    fireEvent.click(screen.getByRole("button", { name: "Map options" }));
    expect(
      screen.getByRole("switch", { name: /match the map to the theme/i }),
    ).toBeChecked();
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
    expect(WEBGL_UNAVAILABLE_TITLE).toBe("Karta needs WebGL to draw the map.");
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
    await renderApp(services);
    const input = screen.getByRole("combobox", { name: "Search places" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Cape" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
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

  it("sets the basemap and the theme", async () => {
    const { call, services } = await renderWithTools();
    expect(await call("set-map-basemap", { basemap: "osm" })).toBe(
      "Switched the basemap to osm.",
    );
    expect(services.fakes.settings.get().basemapId).toBe("osm");
    expect(await call("set-map-basemap", { basemap: "nope" })).toMatch(
      /Unknown basemap/,
    );
    expect(await call("set-app-theme", { theme: "dark" })).toBe(
      "Switched the theme to dark.",
    );
    expect(services.fakes.settings.get().theme).toBe("dark");
    expect(await call("set-app-theme", { theme: "sepia" })).toMatch(
      /Unknown theme/,
    );
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
