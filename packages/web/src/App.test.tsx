import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => ({
  getTownships: vi.fn(),
  fetchAreas: vi.fn(),
}));

const mapMocks = vi.hoisted(() => ({
  map: {
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    getContainer: () => document.createElement("div"),
    getZoom: () => 9,
    getCenter: () => ({ lat: -26, lng: 28 }),
    whenReady: (callback: () => void) => callback(),
    on: vi.fn(),
    off: vi.fn(),
    locate: vi.fn(),
    attributionControl: {
      addAttribution: vi.fn(),
      removeAttribution: vi.fn(),
      getContainer: () => document.createElement("div"),
    },
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TileLayer: () => null,
  GeoJSON: forwardRef<never, { data: { features: unknown[] } }>(
    ({ data }, _ref) => (
      <div data-testid="geojson-layer">{data.features.length} features</div>
    ),
  ),
  Pane: () => null,
  ZoomControl: () => null,
  ScaleControl: () => null,
  useMap: () => mapMocks.map,
  useMapEvents: () => ({}),
  Popup: () => null,
}));

vi.mock("@karta/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@karta/core")>();
  return {
    ...actual,
    fetchFeatureCollection: dataMocks.fetchAreas,
  };
});

vi.mock("./data/fetchTownships", () => ({
  fetchTownships: dataMocks.getTownships,
}));

import { registerBasemap } from "@karta/map";
import { App } from "./App";
import * as appStyles from "./App.css";
import { useMapUiStore } from "./stores/useMapUiStore";

// The real "positron" basemap is now an OpenFreeMap vector basemap
// (MapLibre GL, dynamically imported real "leaflet"/"maplibre-gl-leaflet"
// packages); exercising that real async/WebGL path isn't meaningful in
// these jsdom unit tests and races awkwardly with tests that unmount before
// other async work settles, so it's overridden here with a plain raster
// stub matching react-leaflet's mocked `TileLayer`.
registerBasemap("positron", {
  kind: "raster",
  label: "Positron",
  description: "Test-only raster stand-in for the real OpenFreeMap basemap.",
  url: "https://example.com/{z}/{x}/{y}.png",
  attribution: "Example",
});

async function renderMobilePanel() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 375,
    writable: true,
  });
  useMapUiStore.getState().reset();

  const { container, unmount } = render(<App />);
  await waitFor(() =>
    expect(screen.getByTestId("map-view")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: /explore/i }));

  return {
    container,
    unmount,
    panel: screen.getByTestId("panel-container"),
    handle: screen.getByTestId("panel-sheet-handle"),
  };
}

async function openExploreSurface() {
  const trigger = screen.getByTestId("panel-toggle");
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
}

async function activateTownshipsLayer() {
  await openExploreSurface();
  fireEvent.click(screen.getByTestId("layer-toggle-townships"));
  await waitFor(() =>
    expect(screen.getByTestId("geojson-layer")).toBeInTheDocument(),
  );
}

async function startTownshipFetch() {
  await openExploreSurface();
  fireEvent.click(screen.getByTestId("layer-toggle-townships"));
  await waitFor(() => expect(dataMocks.getTownships).toHaveBeenCalled());
}

describe("App", () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
    useMapUiStore.getState().reset();
    dataMocks.getTownships.mockReset().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/gauteng/")
          ? [
              {
                type: "Feature",
                properties: {
                  id: "A",
                  name: "Mamelodi",
                  commuteMinutes: 20,
                  nearestJobCenter: "Pretoria CBD",
                  distanceKm: null,
                  nearestTransitKm: null,
                  nearestAReYengStopKm: null,
                },
                geometry: null,
              },
            ]
          : [],
      ),
    );
    dataMocks.fetchAreas.mockReset().mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
  });
  it("provides skip navigation, a page heading, and a main landmark", async () => {
    render(<App />);

    expect(
      screen.getByRole("link", { name: /skip to map information/i }),
    ).toHaveAttribute("href", "#map-information");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole("banner")).toContainElement(heading);
    expect(screen.getByRole("main")).toHaveAttribute("id", "map-information");
    expect(
      document.querySelector('search[aria-label="Search place"]'),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Map settings" })).not.toBeNull();
    expect(document.getElementById("map-controls")).toHaveAttribute(
      "aria-labelledby",
      "map-panel-heading",
    );
    expect(screen.queryByTestId("geojson-layer")).not.toBeInTheDocument();
    expect(dataMocks.getTownships).not.toHaveBeenCalled();
  });

  it("keeps Explore closed on first load at desktop size", () => {
    render(<App />);

    expect(screen.getByTestId("panel-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps an explicit accessible name on the panel toggle regardless of its visible label's CSS visibility", () => {
    render(<App />);

    const trigger = screen.getByTestId("panel-toggle");
    expect(trigger).toHaveAttribute("aria-label", "Explore");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-label", "Close");
  });

  it("does not render the old introduction card or an overlay on first load", async () => {
    render(<App />);

    expect(
      screen.queryByRole("button", { name: /minimise introduction/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /buffer zones/i, level: 1 }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("geojson-layer")).not.toBeInTheDocument();
  });

  it("keeps shell copy domain-neutral before a layer is selected", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Karta | Interactive map",
    );
    expect(screen.getByTestId("location-search-input")).toHaveAttribute(
      "placeholder",
      "Search places",
    );
    expect(screen.queryByTestId("app-name")).not.toBeInTheDocument();
  });

  it("switches between Settings and Measure without stacking surfaces", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(useMapUiStore.getState().activeSurface).toBe("settings");
    expect(screen.getByRole("heading", { name: "Map settings" })).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Map settings" })).toBeVisible();

    const measurementToggle = await screen.findByTestId(
      "measurement-control-toggle",
    );
    expect(measurementToggle).toHaveAttribute("aria-label", "Back to map");
    fireEvent.click(measurementToggle);
    expect(useMapUiStore.getState().activeSurface).toBe("measure");
    expect(
      screen.queryByRole("heading", { name: "Map settings" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("measurement-control-panel")).toBeVisible();

    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(useMapUiStore.getState().activeSurface).toBe("settings");
    expect(
      screen.queryByTestId("measurement-control-panel"),
    ).not.toBeInTheDocument();
  });

  it("shows map-chrome location search outside settings", async () => {
    render(<App />);

    expect(screen.getByTestId("location-search-input")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByTestId("location-search-input")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(screen.queryByText("Theme")).not.toBeInTheDocument();
  });

  it("selects a township directly from the unified search box, alongside place search", async () => {
    render(<App />);
    await activateTownshipsLayer();

    fireEvent.change(screen.getByTestId("location-search-input"), {
      target: { value: "Mamelodi" },
    });

    const option = await screen.findByRole("option", { name: "Mamelodi" });
    fireEvent.click(option);

    await waitFor(() => {
      expect(window.location.search).toContain("feature=A");
    });
    expect(screen.getByTestId("feature-details")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Mamelodi" })).toBeVisible();
  });

  it("hides the active legend chip while Settings is open", async () => {
    render(<App />);
    await activateTownshipsLayer();
    fireEvent.click(screen.getByTestId("panel-toggle"));
    expect(screen.getByTestId("active-legend-chip")).toBeVisible();

    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(screen.queryByTestId("active-legend-chip")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(screen.getByTestId("active-legend-chip")).toBeVisible();
  });

  it("shows layer controls when Explore is opened, with no default overlay", async () => {
    render(<App />);
    await openExploreSurface();

    expect(
      screen.getByRole("checkbox", { name: "Modelled car time" }),
    ).not.toBeChecked();
    expect(screen.queryByTestId("geojson-layer")).not.toBeInTheDocument();
  });

  it("shows a Story tab that renders the domain's story copy", async () => {
    render(<App />);
    await openExploreSurface();

    const tablist = await screen.findByTestId("panel-tablist");
    const layersTab = screen.getByTestId("panel-tab-layers");
    const storyTab = screen.getByTestId("panel-tab-story");
    expect(tablist).toBeInTheDocument();
    expect(layersTab).toHaveAttribute("aria-selected", "true");
    expect(storyTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(storyTab);

    expect(storyTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { name: "Why this map exists" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Modelled car time" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-viewport")).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("shows a Browse tab listing every selectable feature, grouped by layer, and selects one on click", async () => {
    render(<App />);
    await activateTownshipsLayer();

    const browseTab = await screen.findByTestId("panel-tab-browser");
    fireEvent.click(browseTab);

    expect(browseTab).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByRole("heading", { name: "Modelled car time" }),
    ).toBeInTheDocument();

    const row = await screen.findByRole("button", { name: "Mamelodi" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(window.location.search).toContain("feature=A");
    });
  });

  it("moves tab focus with arrow keys and activates the focused tab", async () => {
    render(<App />);
    await openExploreSurface();

    const layersTab = await screen.findByTestId("panel-tab-layers");
    const storyTab = screen.getByTestId("panel-tab-story");
    layersTab.focus();

    fireEvent.keyDown(layersTab, { key: "ArrowRight" });

    expect(storyTab).toHaveFocus();
    expect(storyTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(storyTab, { key: "ArrowLeft" });

    expect(layersTab).toHaveFocus();
    expect(layersTab).toHaveAttribute("aria-selected", "true");
  });

  it.each([
    ["End", "panel-tab-browser"],
    ["Home", "panel-tab-layers"],
    ["a", "panel-tab-layers"],
  ] as const)(
    "pressing %s from the layers tab moves focus to %s",
    async (key, expectedTabTestId) => {
      render(<App />);
      await openExploreSurface();

      const layersTab = await screen.findByTestId("panel-tab-layers");
      layersTab.focus();

      fireEvent.keyDown(layersTab, { key });

      const expectedTab = screen.getByTestId(expectedTabTestId);
      expect(expectedTab).toHaveFocus();
      expect(expectedTab).toHaveAttribute("aria-selected", "true");
    },
  );

  it("collapses and restores the controls panel", async () => {
    render(<App />);

    const trigger = screen.getByTestId("panel-toggle");
    await openExploreSurface();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);

    expect(
      screen.queryByRole("checkbox", { name: "Modelled car time" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /explore/i }));

    expect(
      screen.getByRole("checkbox", { name: "Modelled car time" }),
    ).not.toBeChecked();
  });

  it("moves focus into the panel's active tab when it's opened via the trigger", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /explore/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /layers/i })).toHaveFocus();
    });
  });

  it("closes the panel on Escape and restores focus to the trigger", async () => {
    render(<App />);
    const trigger = screen.getByTestId("panel-toggle");
    await openExploreSurface();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("keeps the desktop panel open on an outside click, since it behaves as a persistent sidebar there", async () => {
    render(<App />);
    const trigger = screen.getByTestId("panel-toggle");
    await openExploreSurface();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseDown(document.body);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("opens measurement mode as the active surface on desktop", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTestId("measurement-control-toggle"));

    expect(screen.getByTestId("measurement-control-panel")).toBeInTheDocument();
    expect(screen.getByTestId("measurement-control-hint")).toBeInTheDocument();
  });

  it("closes the mobile sheet on an outside click, unlike the desktop sidebar", async () => {
    const { panel } = await renderMobilePanel();

    fireEvent.mouseDown(document.body);

    expect(panel).toHaveAttribute("data-panel-closing", "true");
    fireEvent.animationEnd(panel);
    await waitFor(() => expect(panel).not.toBeVisible());
  });

  it("does not close the mobile sheet on a click inside it", async () => {
    const { panel } = await renderMobilePanel();

    fireEvent.mouseDown(panel);

    expect(panel).not.toHaveAttribute("data-panel-closing", "true");
    expect(panel).toBeVisible();
  });

  it("keeps the measurement toggle visible (not hidden) while the mobile Explore panel is open", async () => {
    await renderMobilePanel();

    expect(
      screen.getByTestId("measurement-control-toggle"),
    ).toBeInTheDocument();
  });

  it("switches from Explore to measurement when the measurement toggle is tapped", async () => {
    const { panel } = await renderMobilePanel();

    fireEvent.click(screen.getByTestId("measurement-control-toggle"));

    expect(panel).not.toBeVisible();
    expect(useMapUiStore.getState().activeSurface).toBe("measure");
    expect(
      screen.queryByTestId("measurement-control-panel"),
    ).toBeInTheDocument();
  });

  it("returns the panel toggle and legend trigger to their base position as soon as the sheet starts closing, not after its exit animation finishes", async () => {
    const { container, panel } = await renderMobilePanel();

    const appRoot = container.querySelector("[data-panel-open]");
    expect(appRoot).toHaveAttribute("data-panel-open", "true");

    fireEvent.mouseDown(document.body);

    expect(panel).toHaveAttribute("data-panel-closing", "true");
    expect(appRoot).toHaveAttribute("data-panel-open", "false");
  });

  it("suppresses the active legend chip while Explore is open", async () => {
    render(<App />);
    await activateTownshipsLayer();
    fireEvent.click(screen.getByTestId("panel-toggle"));
    expect(screen.getByTestId("active-legend-chip")).toBeVisible();
    await openExploreSurface();
    expect(screen.queryByTestId("active-legend-chip")).not.toBeInTheDocument();
  });

  it("opens the full active legend from the map chip", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
      writable: true,
    });
    useMapUiStore.getState().reset();

    render(<App />);
    expect(screen.queryByTestId("active-legend-chip")).not.toBeInTheDocument();
    await activateTownshipsLayer();
    fireEvent.click(screen.getByTestId("panel-toggle"));
    expect(await screen.findByTestId("active-legend-chip")).toBeVisible();
    fireEvent.click(screen.getByTestId("active-legend-chip"));
    expect(useMapUiStore.getState().activeSurface).toBe("legend");
    expect(
      screen.getByRole("list", { name: /active map layers legend/i }),
    ).toBeInTheDocument();
  });

  it("restores the legend ramp and focus after opening and closing its surface", async () => {
    render(<App />);
    await activateTownshipsLayer();
    fireEvent.click(screen.getByTestId("panel-toggle"));

    const chip = screen.getByTestId("active-legend-chip");
    const ramp = chip.querySelector(`.${appStyles.legendRamp}`) as HTMLElement;
    await waitFor(() =>
      expect(ramp.getAttribute("style")).toContain("linear-gradient"),
    );
    const background = ramp.getAttribute("style");

    fireEvent.click(chip);
    expect(screen.getByRole("dialog", { name: "Map legend" })).toBeVisible();
    fireEvent.click(screen.getByTestId("panel-toggle"));

    const remountedChip = screen.getByTestId("active-legend-chip");
    const remountedRamp = remountedChip.querySelector(
      `.${appStyles.legendRamp}`,
    ) as HTMLElement;
    await waitFor(() =>
      expect(remountedRamp.getAttribute("style")).toBe(background),
    );
    await waitFor(() =>
      expect(screen.getByTestId("panel-toggle")).toHaveFocus(),
    );
  }, 15_000);

  it("lets mobile users snap the panel between medium and full height", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
      writable: true,
    });
    useMapUiStore.getState().reset();

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("map-view")).toBeInTheDocument(),
    );

    const openPanel = screen.getByRole("button", { name: /explore/i });
    fireEvent.click(openPanel);

    const panel = screen.getByTestId("panel-container");
    const handle = screen.getByTestId("panel-sheet-handle");

    expect(panel).toHaveAttribute("data-panel-size", "half");
    expect(handle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(handle);

    expect(panel).toHaveAttribute("data-panel-size", "full");
    expect(handle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(handle);

    expect(panel).toHaveAttribute("data-panel-size", "half");
    expect(handle).toHaveAttribute("aria-pressed", "false");
  });

  it("supports drag gestures on the mobile sheet handle", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 7,
      clientY: 220,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 7,
      clientY: 150,
    });

    await waitFor(() =>
      expect(panel).toHaveAttribute("data-panel-dragging", "true"),
    );
    expect(handle).toHaveAttribute("data-dragging", "true");

    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 7,
      clientY: 130,
    });

    expect(panel).toHaveAttribute("data-panel-size", "full");
    await waitFor(() =>
      expect(panel).toHaveAttribute("data-panel-dragging", "false"),
    );
    await waitFor(() =>
      expect(panel).toHaveAttribute("data-panel-drag-direction", "none"),
    );

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 8,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 8,
      clientY: 210,
    });

    await waitFor(() =>
      expect(panel).toHaveAttribute("data-panel-drag-direction", "down"),
    );

    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 8,
      clientY: 230,
    });

    expect(panel).toHaveAttribute("data-panel-size", "half");
  });

  it("sets the panel's drag-offset CSS custom property once mounted", async () => {
    const { panel } = await renderMobilePanel();
    const bareVarName = appStyles.panelDragOffset
      .toString()
      .replace(/^var\((--[\w-]+)\)$/, "$1");

    await waitFor(() =>
      expect(panel.style.getPropertyValue(bareVarName)).toBe("0px"),
    );
  });

  it("does not suppress the next handle click when a drag produces no click", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 41,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 41,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 41,
      clientY: 230,
    });
    expect(panel).toHaveAttribute("data-panel-size", "peek");

    await new Promise((resolve) => window.setTimeout(resolve, 5));
    fireEvent.click(handle);

    expect(panel).toHaveAttribute("data-panel-size", "half");
  });

  it("removes the sheet drag's window pointer listeners on unmount mid-gesture", async () => {
    const { handle, unmount } = await renderMobilePanel();
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 21,
      clientY: 200,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 21,
      clientY: 150,
    });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "pointerup",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "pointercancel",
      expect.any(Function),
    );
  });

  it("renders the panel with no SSR-time inline style attribute for the drag offset", () => {
    // A literal `style="--...:0px"` attribute in the server-rendered HTML
    // is applied by the browser's HTML parser before any script runs,
    // which this app's strict style-src (no 'unsafe-inline') refuses. The
    // live value above is instead applied imperatively via `panelRef`'s
    // `style.setProperty()` once mounted (a CSSOM mutation CSP does not
    // restrict) so the element must carry no `style` attribute at all in
    // the initial server-rendered markup.
    const markup = renderToStaticMarkup(<App />);
    const panelMarkup = markup.match(/<aside[^>]*id="map-controls"[^>]*>/)?.[0];

    expect(panelMarkup).toBeDefined();
    expect(panelMarkup).not.toContain("style=");
  });

  it("snaps through peek and closes the panel on a second downward swipe", async () => {
    const { panel, handle } = await renderMobilePanel();

    expect(panel).toHaveAttribute("data-panel-size", "half");

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 11,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 11,
      clientY: 210,
    });

    await waitFor(() =>
      expect(panel).toHaveAttribute("data-panel-drag-direction", "down"),
    );

    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 11,
      clientY: 230,
    });

    expect(panel).toHaveAttribute("data-panel-size", "peek");

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 14,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 14,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 14,
      clientY: 230,
    });

    expect(panel).toHaveAttribute("data-panel-closing", "true");

    fireEvent.animationEnd(panel);

    await waitFor(() => expect(panel).not.toBeVisible());
    expect(screen.getByRole("button", { name: /explore/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("ignores an animationend bubbling up from inside the panel while closing", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 13,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 13,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 13,
      clientY: 230,
    });

    expect(panel).toHaveAttribute("data-panel-size", "peek");
    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 15,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 15,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 15,
      clientY: 230,
    });

    expect(panel).toHaveAttribute("data-panel-closing", "true");

    fireEvent.animationEnd(screen.getByTestId("panel-viewport"));

    expect(panel).toBeVisible();
    expect(panel).toHaveAttribute("data-panel-closing", "true");

    fireEvent.animationEnd(panel);
    await waitFor(() => expect(panel).not.toBeVisible());
  });

  it("keeps a newly opened surface open when the previous sheet close animation ends", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 31,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 31,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 31,
      clientY: 230,
    });
    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 32,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 32,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 32,
      clientY: 230,
    });
    expect(panel).toHaveAttribute("data-panel-closing", "true");

    fireEvent.click(screen.getByTestId("settings-menu-trigger"));
    expect(screen.getByText("Theme")).toBeVisible();

    fireEvent.animationEnd(panel);

    expect(panel).toBeVisible();
    expect(screen.getByText("Theme")).toBeVisible();
  });

  it("closes the panel immediately under prefers-reduced-motion, skipping the exit animation", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 12,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 12,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 12,
      clientY: 230,
    });

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 16,
      clientY: 140,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 16,
      clientY: 210,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 16,
      clientY: 230,
    });

    expect(panel).not.toBeVisible();
    expect(screen.getByRole("button", { name: /explore/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    vi.unstubAllGlobals();
  });

  it("suppresses the synthetic click that follows a drag past the threshold", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 9,
      clientY: 200,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 9,
      clientY: 100,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 9,
      clientY: 100,
    });

    expect(panel).toHaveAttribute("data-panel-size", "full");

    fireEvent.click(handle);
    expect(panel).toHaveAttribute("data-panel-size", "full");

    fireEvent.click(handle);
    expect(panel).toHaveAttribute("data-panel-size", "half");
  });

  it("ignores sheet handle interactions on desktop viewports", async () => {
    render(<App />);
    await openExploreSurface();

    const panel = screen.getByTestId("panel-container");
    const handle = screen.getByTestId("panel-sheet-handle");

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 1,
      clientY: 100,
      button: 0,
    });
    fireEvent.click(handle);

    expect(panel).toHaveAttribute("data-panel-dragging", "false");
    expect(panel).toHaveAttribute("data-panel-size", "half");
  });

  it("ignores a non-primary mouse button on the sheet handle", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "mouse",
      pointerId: 2,
      clientY: 150,
      button: 2,
    });

    expect(panel).toHaveAttribute("data-panel-dragging", "false");
  });

  it("ignores pointer move and up events from a different pointer while dragging", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 1,
      clientY: 200,
      button: 0,
    });

    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 99,
      clientY: 60,
    });
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 99,
      clientY: 60,
    });

    expect(panel).toHaveAttribute("data-panel-dragging", "true");

    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 1,
      clientY: 200,
    });

    expect(panel).toHaveAttribute("data-panel-dragging", "false");
  });

  it("prunes velocity samples older than the tracking window during a drag", async () => {
    let now = 0;
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockImplementation(() => now);

    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 4,
      clientY: 200,
      button: 0,
    });
    now = 50;
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 4,
      clientY: 190,
    });
    now = 300;
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 4,
      clientY: 100,
    });
    now = 310;
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 4,
      clientY: 95,
    });
    now = 460;
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 4,
      clientY: 90,
    });

    expect(panel).toHaveAttribute("data-panel-size", "full");

    performanceNow.mockRestore();
  });

  it("treats a small drag as a tap and skips releasing already-released pointer capture", async () => {
    const { panel, handle } = await renderMobilePanel();

    fireEvent.pointerDown(handle, {
      pointerType: "touch",
      pointerId: 5,
      clientY: 200,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerType: "touch",
      pointerId: 5,
      clientY: 205,
    });
    handle.releasePointerCapture(5);
    fireEvent.pointerUp(window, {
      pointerType: "touch",
      pointerId: 5,
      clientY: 205,
    });

    expect(panel).toHaveAttribute("data-panel-size", "half");
    expect(panel).toHaveAttribute("data-panel-dragging", "false");
  });

  it.each(["resolve", "reject"] as const)(
    "does not update state if the component unmounts before the township fetch settles (%s)",
    async (mode) => {
      let resolveTownships: ((value: unknown[]) => void) | undefined;
      let rejectTownships: ((reason: unknown) => void) | undefined;
      dataMocks.getTownships.mockReset().mockReturnValue(
        new Promise((resolve, reject) => {
          resolveTownships = resolve;
          rejectTownships = reject;
        }),
      );
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { unmount } = render(<App />);
      // The fetch only starts once the map reports itself ready, so wait for
      // it to be in flight before unmounting; otherwise this asserts
      // nothing about a settling request.
      await startTownshipFetch();
      unmount();
      if (mode === "resolve") {
        resolveTownships?.([]);
      } else {
        rejectTownships?.(new Error("data load failed"));
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        consoleError.mock.calls.some(([message]) =>
          String(message).includes("Failed to load region map data"),
        ),
      ).toBe(false);
      consoleError.mockRestore();
    },
  );

  it("shows a data error and retries the validated requests", async () => {
    dataMocks.getTownships
      .mockRejectedValueOnce(new Error("invalid data"))
      .mockRejectedValueOnce(new Error("invalid data"));
    render(<App />);

    await startTownshipFetch();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Map data could not be loaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(dataMocks.getTownships).toHaveBeenCalledTimes(4),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  it("does not show a data error when only one region's township data fails to load", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    dataMocks.getTownships.mockReset().mockImplementation((url: string) =>
      url.includes("/gauteng/")
        ? Promise.resolve([
            {
              type: "Feature",
              properties: {
                id: "A",
                name: "Mamelodi",
                commuteMinutes: 20,
                nearestJobCenter: "Pretoria CBD",
                distanceKm: null,
                nearestTransitKm: null,
              },
              geometry: null,
            },
          ])
        : Promise.reject(new Error("not published yet")),
    );

    render(<App />);

    await activateTownshipsLayer();
    expect(screen.getByTestId("geojson-layer")).toHaveTextContent("1 features");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to load region map data",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it("aborts the in-flight township/area requests when the component unmounts", async () => {
    let capturedTownshipSignal: AbortSignal | undefined;
    let capturedAreaSignal: AbortSignal | undefined;
    dataMocks.getTownships
      .mockReset()
      .mockImplementation((_url: string, signal?: AbortSignal) => {
        capturedTownshipSignal = signal;
        return new Promise(() => {});
      });
    dataMocks.fetchAreas
      .mockReset()
      .mockImplementation(
        (_url: string, _schema?: unknown, signal?: AbortSignal) => {
          capturedAreaSignal = signal;
          return new Promise(() => {});
        },
      );

    const { unmount } = render(<App />);

    await startTownshipFetch();
    expect(capturedTownshipSignal).toBeInstanceOf(AbortSignal);
    expect(capturedAreaSignal).toBeInstanceOf(AbortSignal);
    expect(capturedTownshipSignal?.aborted).toBe(false);
    expect(capturedAreaSignal?.aborted).toBe(false);

    unmount();

    expect(capturedTownshipSignal?.aborted).toBe(true);
    expect(capturedAreaSignal?.aborted).toBe(true);
  });
});
