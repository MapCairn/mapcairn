// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  type DateTimeControlDefinition,
  FakeLayerCatalogue,
  FakeMapAdapter,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_LINE_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_TIME_LAYER,
  SAMPLE_VECTOR_LAYER,
  sampleArea,
  sampleLine,
  samplePoint,
  tileUrl,
} from "@mapcairn/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChromeLayoutProvider } from "../chrome/layoutContext";
import {
  testChromeLayout,
  testMapContext,
} from "../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../host";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection, SHOW_ON_MAP_MIN_ZOOM } from "./LayersSection";
import { type DataLayers, useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);

function setup(
  definitions: readonly LayerDefinition[] = SAMPLE_LAYERS,
  chrome?: Parameters<typeof testChromeLayout>[0],
) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const adapter = new FakeMapAdapter();
  const onShowOnMap = vi.fn();
  const handle: { current: DataLayers | null } = { current: null };
  const visible: { set: (shown: boolean) => void } = { set: () => {} };
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    const [shown, setShown] = useState(true);
    handle.current = layers;
    visible.set = setShown;
    // The app unmounts the section whenever the sheet closes.
    return shown ? (
      <LayersSection layers={layers} onShowOnMap={onShowOnMap} />
    ) : null;
  }
  const tree = (layout: typeof chrome) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider value={testMapContext({ adapter })}>
          {layout ? (
            <ChromeLayoutProvider value={testChromeLayout(layout)}>
              <Harness />
            </ChromeLayoutProvider>
          ) : (
            <Harness />
          )}
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
  const view = render(tree(chrome));
  return {
    ...view,
    /** Re-renders with new chrome facts, such as the side panel having measured. */
    withChrome: (next: typeof chrome) => view.rerender(tree(next)),
    /** Shows or hides the section, as the sheet opening and closing does. */
    showSection: (shown: boolean) => act(() => visible.set(shown)),
    adapter,
    onShowOnMap,
    source: services.fakes.layerSource,
    services,
    layers: () => handle.current as DataLayers,
  };
}

const item = (id: string) => screen.getByTestId(`layer-${id}`);
const toggle = (id: string, name: string) =>
  fireEvent.click(within(item(id)).getByRole("switch", { name }));

describe("LayersSection", () => {
  it("renders nothing when the host has no layers", () => {
    const { container } = setup([]);
    expect(container.querySelector("section")).toBeNull();
  });

  it("is a Layers region with a group heading and a switch per layer, all off", () => {
    setup();
    expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Samples", level: 4 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Imagery", level: 4 }),
    ).toBeInTheDocument();
    for (const name of ["Sample points", "Sample alerts", "Sample imagery"]) {
      expect(screen.getByRole("switch", { name })).not.toBeChecked();
    }
    // The data cost is only worth a line when someone is saving data.
    expect(
      within(item("sample-points")).queryByText(/Uses about 30 KB/),
    ).toBeNull();
  });

  it("shows what a layer uses while Save data is on", () => {
    const { services } = setup();
    expect(screen.queryByText(/Uses about 30 KB/)).toBeNull();
    act(() => services.fakes.preferences.set({ saveData: true }));
    expect(
      within(item("sample-points")).getByText("Uses about 30 KB."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/only while it is on/)).toBeNull();
  });

  it("shows the status, controls and legend of a layer while it is on", async () => {
    const { source } = setup();
    source.setFeatures("sample-points", [samplePoint("a"), samplePoint("b")]);
    toggle("sample-points", "Sample points");
    await waitFor(() =>
      expect(
        screen.getByTestId("layer-status-sample-points"),
      ).toHaveTextContent(/Updated \d\d:\d\d, 2 shown/),
    );
    expect(
      within(item("sample-points")).getByRole("radiogroup", { name: "Period" }),
    ).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "Key for Sample points" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Below 3", "3 to 5", "5 and above"]);
  });

  it("disables a control whose condition is not met", () => {
    setup();
    toggle("sample-points", "Sample points");
    const small = within(item("sample-points")).getByRole("switch", {
      name: /Include small values/,
    });
    expect(small).toBeEnabled();
    fireEvent.click(
      within(item("sample-points")).getByRole("radio", { name: "Hour" }),
    );
    expect(small).toBeDisabled();
  });

  it("offers Try again after a failure", async () => {
    const { source } = setup();
    source.fail("sample-points", "network");
    toggle("sample-points", "Sample points");
    const retry = await screen.findByTestId("layer-retry-sample-points");
    expect(
      screen.getByText("Could not load. Check your connection."),
    ).toBeInTheDocument();
    source.setFeatures("sample-points", [samplePoint("a")]);
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        screen.getByTestId("layer-status-sample-points"),
      ).toHaveTextContent(/1 shown/),
    );
  });

  it("says when a feed is empty, in the layer's words", async () => {
    setup();
    toggle("sample-alerts", "Sample alerts");
    await waitFor(() =>
      expect(
        screen.getByTestId("layer-status-sample-alerts"),
      ).toHaveTextContent("No sample alerts right now."),
    );
  });

  it("lists loaded features, and a row shows its feature on the map and opens its card", async () => {
    const { source, adapter, onShowOnMap } = setup();
    source.setFeatures("sample-points", [
      samplePoint("a", { title: "Alpha", time: 1 }, [10, 20]),
      samplePoint("b", { title: "Beta", time: 2 }, [30, 40]),
    ]);
    toggle("sample-points", "Sample points");
    const list = await screen.findByTestId("layer-list-sample-points");
    const rows = within(list).getAllByTestId("layer-list-row");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Beta"),
      expect.stringContaining("Alpha"),
    ]);
    expect(rows[0]).toHaveAccessibleName(/Beta.*show on map/);
    fireEvent.click(rows[1] as HTMLElement);
    expect(adapter.getView().center.lat).toBeCloseTo(20);
    expect(adapter.getView().zoom).toBe(5);
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
    const card = screen.getByTestId("feature-card");
    expect(
      within(card).getByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(within(card).getByText("Below 3")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
        "Showing Alpha on the map.",
      ),
    );
  });

  it("sorts the list with the layer's sort options", async () => {
    const { source } = setup();
    source.setFeatures("sample-points", [
      samplePoint("a", { title: "Small", value: 1, time: 2 }),
      samplePoint("b", { title: "Big", value: 6, time: 1 }),
    ]);
    toggle("sample-points", "Sample points");
    const list = await screen.findByTestId("layer-list-sample-points");
    fireEvent.click(within(list).getByRole("radio", { name: "Largest" }));
    expect(within(list).getAllByTestId("layer-list-row")[0]).toHaveTextContent(
      "Big",
    );
  });

  it("shows a long list a page at a time", async () => {
    const { source } = setup();
    source.setFeatures(
      "sample-points",
      Array.from({ length: 60 }, (_, i) => samplePoint(`p${i}`, { time: i })),
    );
    toggle("sample-points", "Sample points");
    const list = await screen.findByTestId("layer-list-sample-points");
    expect(within(list).getAllByTestId("layer-list-row")).toHaveLength(50);
    fireEvent.click(within(list).getByRole("button", { name: "Show all 60" }));
    expect(within(list).getAllByTestId("layer-list-row")).toHaveLength(60);
  });

  it("shows the card's lines, a safe link, and the disclaimer, and closes", async () => {
    const { source, layers } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e", {
        title: "Flood in Portugal",
        level: "Orange",
        severity: "Magnitude 4",
        from: "2026-11-06T21:00:00",
        area: "https://alerts.test/a",
      }),
    ]);
    toggle("sample-alerts", "Sample alerts");
    await screen.findByTestId("layer-list-sample-alerts");
    act(() => layers().select("sample-alerts", "e"));
    const card = screen.getByTestId("feature-card");
    expect(card).toHaveTextContent("Orange alert");
    expect(card).toHaveTextContent("Magnitude 4");
    expect(card).toHaveTextContent("From 6 Nov 2026, 21:00 UTC");
    expect(
      within(card).getByTestId("feature-card-disclaimer"),
    ).toHaveTextContent(SAMPLE_ALERT_LAYER.disclaimer as string);
    expect(within(card).queryByTestId("feature-card-link")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Close card" }));
    expect(screen.queryByTestId("feature-card")).toBeNull();
  });

  it("links to the provider only over https", async () => {
    const { source, layers } = setup();
    source.setFeatures("sample-points", [
      samplePoint("a", { url: "https://sample.test/e/a" }),
      samplePoint("b", { url: "javascript:alert(1)" }),
    ]);
    toggle("sample-points", "Sample points");
    await screen.findByTestId("layer-list-sample-points");
    act(() => layers().select("sample-points", "a"));
    expect(screen.getByTestId("feature-card-link")).toHaveAttribute(
      "href",
      "https://sample.test/e/a",
    );
    expect(screen.getByTestId("feature-card-link")).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByTestId("feature-card-link")).toHaveAccessibleName(
      "Details at the source (opens in a new tab)",
    );
    act(() => layers().select("sample-points", "b"));
    expect(screen.queryByTestId("feature-card-link")).toBeNull();
  });

  it("loads the affected area on request, says what it costs, and hides it", async () => {
    const { source, layers } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e", { title: "Storm", area: "https://alerts.test/a" }),
    ]);
    source.setDetail("sample-alerts", [
      {
        id: "s",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        fields: {},
      },
    ]);
    toggle("sample-alerts", "Sample alerts");
    await screen.findByTestId("layer-list-sample-alerts");
    act(() => layers().select("sample-alerts", "e"));
    expect(screen.getByText("Uses about 300 KB.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show affected area" }));
    const hide = await screen.findByRole("button", {
      name: "Hide affected area",
    });
    fireEvent.click(hide);
    expect(
      screen.getByRole("button", { name: "Show affected area" }),
    ).toBeInTheDocument();
  });

  it("offers Try again when the affected area fails", async () => {
    const { source, layers } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e", { area: "https://alerts.test/a" }),
    ]);
    toggle("sample-alerts", "Sample alerts");
    await screen.findByTestId("layer-list-sample-alerts");
    act(() => layers().select("sample-alerts", "e"));
    fireEvent.click(screen.getByRole("button", { name: "Show affected area" }));
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The affected area could not load."),
    ).toBeInTheDocument();
  });

  it("moves focus to the card heading when a tap asks for it", async () => {
    const { source, layers } = setup();
    source.setFeatures("sample-points", [samplePoint("a", { title: "Alpha" })]);
    toggle("sample-points", "Sample points");
    await screen.findByTestId("layer-list-sample-points");
    act(() => layers().select("sample-points", "a", { focus: true }));
    await waitFor(() =>
      expect(screen.getByTestId("feature-card-heading")).toHaveFocus(),
    );
  });

  it("fits the map to a polygon when it is shown, and keeps the whole shape in view", async () => {
    const { source, adapter, onShowOnMap } = setup([SAMPLE_AREA_LAYER]);
    source.setFeatures("sample-areas", [
      sampleArea("zone", { title: "Zone", density: 10 }, [2.35, 48.85], 2),
    ]);
    toggle("sample-areas", "Sample areas");
    fireEvent.click(await screen.findByTestId("layer-list-row"));
    const view = adapter.getView();
    expect(view.center.lng).toBeCloseTo(2.35, 3);
    expect(view.center.lat).toBeCloseTo(48.85, 3);
    // Four degrees across fits in a window, so the fit is a regional zoom.
    expect(view.zoom).toBeGreaterThan(3);
    expect(view.zoom).toBeLessThan(8);
    const bounds = adapter.getBounds();
    expect(bounds.west).toBeLessThanOrEqual(0.35);
    expect(bounds.east).toBeGreaterThanOrEqual(4.35);
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("feature-card-heading")).toHaveTextContent(
      "Zone",
    );
    expect(screen.getByTestId("feature-card")).toHaveTextContent(
      "Density 10 per km²",
    );
  });

  it("draws an area layer's key from its style: words, hatching and the outline each class has", async () => {
    setup([SAMPLE_AREA_LAYER]);
    toggle("sample-areas", "Sample areas");
    const key = await screen.findByTestId("layer-legend-sample-areas");
    expect(within(key).getAllByRole("listitem")).toHaveLength(3);
    expect(key).toHaveTextContent("Up to 100 per km²");
    expect(key).toHaveTextContent("200 per km² and above");
    expect(
      [...key.querySelectorAll("svg")].map((svg) =>
        svg.getAttribute("data-pattern"),
      ),
    ).toEqual([null, "dots", "crosshatch"]);
  });

  it("tells a line layer's classes apart by width and dash as well as colour", async () => {
    setup([SAMPLE_LINE_LAYER]);
    toggle("sample-lines", "Sample lines");
    const key = await screen.findByTestId("layer-legend-sample-lines");
    const lines = [...key.querySelectorAll("[data-part='line']")];
    expect(lines.map((line) => line.getAttribute("stroke-width"))).toEqual([
      "5",
      "3",
      "2.5",
    ]);
    expect(lines.map((line) => line.getAttribute("stroke-dasharray"))).toEqual([
      null,
      "4 3",
      "1 3",
    ]);
  });

  it("names a polygon's class on its card, with the same swatch as the key", async () => {
    const { source } = setup([SAMPLE_AREA_LAYER]);
    source.setFeatures("sample-areas", [
      sampleArea("zone", { title: "Zone", density: 150 }),
    ]);
    toggle("sample-areas", "Sample areas");
    fireEvent.click(await screen.findByTestId("layer-list-row"));
    const card = screen.getByTestId("feature-card");
    expect(card).toHaveTextContent("100 to 200 per km²");
    expect(card.querySelector("svg[data-pattern]")).toHaveAttribute(
      "data-pattern",
      "dots",
    );
  });

  describe("layer kinds", () => {
    it("offers a heatmap's radius, intensity and opacity, and names its density steps in words", async () => {
      const { source, layers } = setup([SAMPLE_HEATMAP_LAYER]);
      source.setFeatures("sample-heat", [samplePoint("a"), samplePoint("b")]);
      toggle("sample-heat", "Sample density");
      await screen.findByTestId("layer-legend-sample-heat");
      const key = screen.getByTestId("layer-legend-sample-heat");
      expect(
        within(key)
          .getAllByRole("listitem")
          .map((entry) => entry.textContent),
      ).toEqual(["Sparse", "Moderate", "Dense"]);
      const radius = screen.getByTestId("layer-control-sample-heat-radius");
      expect(radius).toHaveTextContent("Radius");
      expect(radius).toHaveTextContent("20 px");
      fireEvent.keyDown(within(radius).getByRole("slider"), {
        key: "ArrowRight",
      });
      await waitFor(() =>
        expect(layers().layers[0]?.controls.radius).toBe("22"),
      );
      expect(screen.getByTestId("layer-status-sample-heat")).toHaveTextContent(
        "2 shown",
      );
      // A heatmap has no features to list or open.
      expect(screen.queryByTestId("layer-list-sample-heat")).toBeNull();
    });

    it("lists a vector tile layer's source layers in its key, with no list", () => {
      setup([SAMPLE_VECTOR_LAYER]);
      toggle("sample-districts", "Sample districts");
      const key = screen.getByTestId("layer-legend-sample-districts");
      expect(within(key).getAllByRole("listitem")).toHaveLength(8);
      expect(key).toHaveTextContent("Major road");
      expect(key).toHaveTextContent("Many events");
      expect(screen.queryByTestId("layer-list-sample-districts")).toBeNull();
    });

    it("says to zoom in below a query layer's zoom, and when it shows only the first", async () => {
      const { source, layers, adapter } = setup([SAMPLE_QUERY_LAYER]);
      toggle("sample-query", "Sample query");
      act(() =>
        layers().setView({ west: 0, south: 0, east: 50, north: 50 }, 3),
      );
      expect(screen.getByTestId("layer-status-sample-query")).toHaveTextContent(
        "Zoom in to load this layer.",
      );
      source.setFeatures("sample-query", [
        samplePoint("a"),
        samplePoint("b"),
        samplePoint("c"),
        samplePoint("d"),
      ]);
      act(() => adapter.setView({ zoom: 12 }));
      act(() =>
        layers().setView(
          { west: 2.2, south: 48.8, east: 2.5, north: 48.95 },
          12,
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByTestId("layer-status-sample-query"),
        ).toHaveTextContent("Showing the first 3. Zoom in to see more."),
      );
    });
  });

  describe("several features found together", () => {
    async function twoFeatures() {
      const view = setup([SAMPLE_FEED_LAYER, SAMPLE_AREA_LAYER]);
      view.source.setFeatures("sample-points", [
        samplePoint("a", { title: "Point A", value: 4 }),
      ]);
      view.source.setFeatures("sample-areas", [
        sampleArea("zone", { title: "Zone", density: 150 }),
      ]);
      toggle("sample-points", "Sample points");
      toggle("sample-areas", "Sample areas");
      await waitFor(() =>
        expect(view.layers().layers[1]?.features).toHaveLength(1),
      );
      await waitFor(() =>
        expect(view.layers().layers[0]?.features).toHaveLength(1),
      );
      act(() =>
        view.layers().choose(
          [
            { layerId: "sample-points", featureId: "a" },
            { layerId: "sample-areas", featureId: "zone" },
          ],
          { focus: true },
        ),
      );
      return view;
    }

    it("shows a list with each feature and its layer, and focuses its heading", async () => {
      await twoFeatures();
      const list = await screen.findByTestId("feature-choices");
      expect(within(list).getByRole("heading")).toHaveTextContent(
        "2 features here",
      );
      await waitFor(() =>
        expect(screen.getByTestId("feature-choices-heading")).toHaveFocus(),
      );
      const rows = within(list).getAllByTestId("feature-choices-row");
      expect(rows[0]).toHaveTextContent("Point A");
      expect(rows[0]).toHaveTextContent("Sample points");
      expect(rows[1]).toHaveTextContent("Zone");
      expect(rows[1]).toHaveTextContent("Sample areas");
      expect(screen.queryByTestId("feature-card")).toBeNull();
    });

    it("opens a row's card with a way back to the list, and the card takes focus", async () => {
      await twoFeatures();
      fireEvent.click(
        within(await screen.findByTestId("feature-choices")).getAllByTestId(
          "feature-choices-row",
        )[1] as HTMLElement,
      );
      expect(screen.getByTestId("feature-card-heading")).toHaveTextContent(
        "Zone",
      );
      await waitFor(() =>
        expect(screen.getByTestId("feature-card-heading")).toHaveFocus(),
      );
      expect(screen.queryByTestId("feature-choices")).toBeNull();
      fireEvent.click(screen.getByTestId("feature-card-back"));
      expect(screen.queryByTestId("feature-card")).toBeNull();
      expect(await screen.findByTestId("feature-choices")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId("feature-choices-heading")).toHaveFocus(),
      );
    });

    it("offers no way back for a card opened on its own, and closes the list from its button", async () => {
      const view = await twoFeatures();
      fireEvent.click(screen.getByTestId("feature-choices-close"));
      expect(screen.queryByTestId("feature-choices")).toBeNull();
      act(() => view.layers().select("sample-points", "a"));
      expect(screen.queryByTestId("feature-card-back")).toBeNull();
    });

    it("drops a layer's features from the list when it is turned off", async () => {
      await twoFeatures();
      toggle("sample-areas", "Sample areas");
      // One feature left is still a list until it is dealt with, with only what remains.
      expect(
        within(screen.getByTestId("feature-choices")).getAllByTestId(
          "feature-choices-row",
        ),
      ).toHaveLength(1);
    });
  });

  it("fits a line the same way, from end to end", async () => {
    const { source, adapter } = setup([SAMPLE_LINE_LAYER]);
    source.setFeatures("sample-lines", [
      sampleLine(
        "route",
        { title: "Route", kind: "main" },
        [2.35, 48.85],
        [4.83, 45.76],
      ),
    ]);
    toggle("sample-lines", "Sample lines");
    fireEvent.click(await screen.findByTestId("layer-list-row"));
    const bounds = adapter.getBounds();
    expect(bounds.west).toBeLessThanOrEqual(2.35);
    expect(bounds.east).toBeGreaterThanOrEqual(4.83);
    expect(bounds.south).toBeLessThanOrEqual(45.76);
    expect(bounds.north).toBeGreaterThanOrEqual(48.85);
  });

  it("names a feature with no title by its layer, on the card and in the announcement", async () => {
    const { source } = setup();
    source.setFeatures("sample-points", [samplePoint("a", { title: null })]);
    toggle("sample-points", "Sample points");
    fireEvent.click(await screen.findByTestId("layer-list-row"));
    expect(screen.getByTestId("feature-card-heading")).toHaveTextContent(
      "Sample points",
    );
    await waitFor(() =>
      expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
        "Showing the feature on the map.",
      ),
    );
  });

  it("says when the provider sent something unexpected", async () => {
    const { source } = setup();
    source.fail("sample-points", "invalid");
    toggle("sample-points", "Sample points");
    await waitFor(() =>
      expect(
        screen.getByTestId("layer-status-sample-points"),
      ).toHaveTextContent("Could not load: the provider sent something"),
    );
  });

  it("works with no map and no chrome around it, as in a guide or a test", async () => {
    const services = createFakeServices({
      layers: new FakeLayerCatalogue(SAMPLE_LAYERS),
    });
    services.fakes.layerSource.setFeatures("sample-points", [
      samplePoint("a", { title: "Alpha" }),
    ]);
    function Harness() {
      const layers = useDataLayers({ now: () => NOW });
      return <LayersSection layers={layers} />;
    }
    render(
      <ServicesProvider services={services}>
        <LiveRegionProvider>
          <Harness />
        </LiveRegionProvider>
      </ServicesProvider>,
    );
    toggle("sample-points", "Sample points");
    fireEvent.click(await screen.findByTestId("layer-list-row"));
    expect(
      within(screen.getByTestId("feature-card")).getByRole("heading", {
        name: "Alpha",
      }),
    ).toBeInTheDocument();
  });

  describe("making room for the sheet", () => {
    // The fake map is 800 by 600; the half sheet covers the lower 300.
    const PHONE = {
      layout: "sheet",
      viewport: { width: 800, height: 600 },
    } as const;
    const PANEL = {
      layout: "panel",
      viewport: { width: 800, height: 600 },
      panelEdge: 300,
    } as const;

    async function withPoint(
      chrome: Parameters<typeof testChromeLayout>[0],
      position: [number, number],
    ) {
      const rendered = setup(SAMPLE_LAYERS, chrome);
      rendered.source.setFeatures("sample-points", [
        samplePoint("a", { title: "Alpha" }, position),
      ]);
      toggle("sample-points", "Sample points");
      await screen.findByTestId("layer-list-sample-points");
      return rendered;
    }

    it("shows a feature clear of the half sheet, not behind it", async () => {
      const { adapter } = await withPoint(PHONE, [10, 20]);
      const fit = vi.spyOn(adapter, "fitBounds");
      fireEvent.click(screen.getByTestId("layer-list-row"));
      expect(fit).toHaveBeenCalledTimes(1);
      expect(fit.mock.calls[0]?.[1]).toEqual({
        maxZoom: SHOW_ON_MAP_MIN_ZOOM,
        padding: { top: 0, right: 0, bottom: 300, left: 0 },
      });
      expect(adapter.getView().center.lat).toBeCloseTo(20);
    });

    it("keeps a closer zoom, and shows a feature clear of the side panel", async () => {
      const { adapter } = await withPoint(PANEL, [10, 20]);
      adapter.setView({ zoom: 9 });
      const fit = vi.spyOn(adapter, "fitBounds");
      fireEvent.click(screen.getByTestId("layer-list-row"));
      expect(fit.mock.calls[0]?.[1]).toEqual({
        maxZoom: 9,
        padding: { top: 0, right: 0, bottom: 0, left: 300 },
      });
    });

    it("scrolls the card to the top of the sheet, smoothly", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      await withPoint(PHONE, [10, 20]);
      fireEvent.click(screen.getByTestId("layer-list-row"));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      expect(scrollIntoView.mock.instances[0]).toBe(
        screen.getByTestId("feature-card-heading"),
      );
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: "smooth",
      });
    });

    it("scrolls at once for a person who prefers reduced motion", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const { services, source, layers } = setup(SAMPLE_LAYERS, PHONE);
      services.fakes.preferences.set({ reducedMotion: true });
      source.setFeatures("sample-points", [samplePoint("a")]);
      toggle("sample-points", "Sample points");
      await screen.findByTestId("layer-list-sample-points");
      fireEvent.click(screen.getByTestId("layer-list-row"));
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "start",
          behavior: "auto",
        }),
      );
      scrollIntoView.mockClear();
      act(() => layers().select("sample-points", "a", { focus: true }));
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "start",
          behavior: "auto",
        }),
      );
    });

    it("pans a tapped point from behind the sheet, to the middle of what shows", async () => {
      const { adapter, layers } = await withPoint(PHONE, [10, 20]);
      adapter.setView({ center: { lat: 20, lng: 10 }, zoom: 5 });
      const pan = vi.spyOn(adapter, "panBy");
      act(() => layers().select("sample-points", "a", { focus: true }));
      // The point is at the map's middle, 300px down: under the sheet's top edge.
      await waitFor(() => expect(pan).toHaveBeenCalledWith(0, 300 - 150));
    });

    it("acts on a tap once: reopening the sheet later does not move the map or the focus again", async () => {
      const { adapter, layers, showSection } = await withPoint(PHONE, [10, 20]);
      adapter.setView({ center: { lat: 20, lng: 10 }, zoom: 5 });
      const pan = vi.spyOn(adapter, "panBy");
      act(() => layers().select("sample-points", "a", { focus: true }));
      await waitFor(() =>
        expect(screen.getByTestId("feature-card-heading")).toHaveFocus(),
      );
      expect(pan).toHaveBeenCalledTimes(1);
      showSection(false);
      adapter.setView({ center: { lat: 50, lng: 60 }, zoom: 5 });
      pan.mockClear();
      showSection(true);
      await act(async () => {});
      expect(pan).not.toHaveBeenCalled();
      expect(screen.getByTestId("feature-card-heading")).not.toHaveFocus();
    });

    it("leaves a tapped point that already shows where it is", async () => {
      const { adapter, layers, source } = setup(SAMPLE_LAYERS, PHONE);
      const high = adapter.unproject({ x: 400, y: 100 });
      source.setFeatures("sample-points", [
        samplePoint("a", { title: "Alpha" }, [high.lng, high.lat]),
      ]);
      toggle("sample-points", "Sample points");
      await screen.findByTestId("layer-list-sample-points");
      const pan = vi.spyOn(adapter, "panBy");
      act(() => layers().select("sample-points", "a", { focus: true }));
      await waitFor(() =>
        expect(screen.getByTestId("feature-card-heading")).toHaveFocus(),
      );
      expect(pan).not.toHaveBeenCalled();
    });

    it("waits for the side panel to say where it ends before moving a tapped point", async () => {
      const { adapter, layers, withChrome } = await withPoint(
        { ...PANEL, panelEdge: null },
        [10, 20],
      );
      adapter.setView({ center: { lat: 20, lng: 10 }, zoom: 5 });
      const pan = vi.spyOn(adapter, "panBy");
      act(() => layers().select("sample-points", "a", { focus: true }));
      await act(async () => {});
      expect(pan).not.toHaveBeenCalled();
      expect(layers().focusPending).toBe(true);
      // Now it knows the panel covers the left 500px, so the point at 400 is behind it.
      withChrome({ ...PANEL, panelEdge: 500 });
      await waitFor(() => expect(pan).toHaveBeenCalledWith(400 - 650, 0));
      await waitFor(() =>
        expect(screen.getByTestId("feature-card-heading")).toHaveFocus(),
      );
      expect(layers().focusPending).toBe(false);
    });
  });

  it("changes a tile layer's date and opacity through its controls", () => {
    const { layers } = setup();
    toggle("sample-imagery", "Sample imagery");
    const date = screen.getByTestId("layer-control-sample-imagery-date");
    expect(date).toHaveAttribute("min", "2024-02-29");
    expect(date).toHaveAttribute("max", "2026-11-08");
    fireEvent.change(date, { target: { value: "2025-05-05" } });
    fireEvent.change(date, { target: { value: "" } });
    expect(
      layers().layers.find((l) => l.definition.id === "sample-imagery")
        ?.controls.date,
    ).toBe("2025-05-05");
    const slider = within(
      screen.getByTestId("layer-control-sample-imagery-opacity"),
    ).getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(
      layers().layers.find((l) => l.definition.id === "sample-imagery")
        ?.controls.opacity,
    ).toBe("0.75");
  });

  describe("a tile layer the map found no tiles for", () => {
    it("says no imagery was found for the chosen time, with the control to pick another beside it", () => {
      const { layers } = setup([SAMPLE_TIME_LAYER]);
      toggle("sample-rain", "Sample rain");
      expect(screen.queryByTestId("layer-status-sample-rain")).toBeNull();
      act(() =>
        layers().reportTilesUnavailable(
          "sample-rain",
          tileUrl(SAMPLE_TIME_LAYER, {}, NOW),
        ),
      );
      const status = screen.getByTestId("layer-status-sample-rain");
      expect(status).toHaveTextContent(
        "No imagery was found for 06:00 UTC on 9 November 2026. Try another.",
      );
      expect(status.querySelector("svg")).not.toBeNull();
      expect(
        within(item("sample-rain")).queryByRole("button", {
          name: "Try again",
        }),
      ).toBeNull();
      const group = screen.getByRole("group", { name: "Time shown" });
      expect(group).not.toBeDisabled();
      fireEvent.change(within(group).getByRole("combobox"), {
        target: { value: "2026-11-09t0530" },
      });
      expect(screen.queryByTestId("layer-status-sample-rain")).toBeNull();
    });

    it("takes the status away when a tile of the layer loads later", () => {
      const { layers } = setup([SAMPLE_TIME_LAYER]);
      toggle("sample-rain", "Sample rain");
      const tiles = tileUrl(SAMPLE_TIME_LAYER, {}, NOW);
      act(() => layers().reportTilesUnavailable("sample-rain", tiles));
      expect(
        screen.getByTestId("layer-status-sample-rain"),
      ).toBeInTheDocument();
      act(() => layers().reportTilesRecovered("sample-rain", tiles));
      expect(screen.queryByTestId("layer-status-sample-rain")).toBeNull();
    });

    it("says only that a layer with nothing to choose did not load", () => {
      const plain: LayerDefinition = {
        ...SAMPLE_TILE_LAYER,
        id: "sample-plain",
        name: "Sample plain",
        controls: [],
        source: {
          ...SAMPLE_TILE_LAYER.source,
          tiles: "https://tiles.test/{z}",
        },
      };
      const { layers } = setup([plain]);
      toggle("sample-plain", "Sample plain");
      act(() =>
        layers().reportTilesUnavailable(
          "sample-plain",
          "https://tiles.test/{z}",
        ),
      );
      expect(screen.getByTestId("layer-status-sample-plain")).toHaveTextContent(
        "Could not load. Check your connection.",
      );
    });
  });

  describe("a date and time control", () => {
    // NOW is 12:00 UTC and the sample is six hours behind, so 06:00 is the newest slot.
    const timeOf = (layers: () => DataLayers) =>
      layers().layers.find((l) => l.definition.id === "sample-rain")?.controls
        .time;
    const open = () => {
      const view = setup([SAMPLE_TIME_LAYER]);
      toggle("sample-rain", "Sample rain");
      const group = screen.getByRole("group", { name: "Time shown" });
      return {
        ...view,
        group,
        date: within(group).getByLabelText("Date (UTC)"),
        time: within(group).getByRole("combobox", { name: "Time (UTC)" }),
      };
    };

    it("shows the newest slot, bounded to the days the provider has, and says so in words", () => {
      const { group, date, time } = open();
      expect(date).toHaveAttribute("type", "date");
      expect(date).toHaveAttribute("min", "2000-06-01");
      expect(date).toHaveAttribute("max", "2026-11-09");
      expect(date).toHaveValue("2026-11-09");
      expect(time).toHaveValue("2026-11-09t0600");
      expect(group).toHaveTextContent(
        "Showing 06:00 to 06:30 UTC on 9 November 2026.",
      );
      expect(group).toHaveTextContent(
        "Newest available: 06:00 UTC on 9 November 2026. Newer times may not be out yet, so they are not offered.",
      );
      expect(date).toHaveAccessibleDescription(/Showing 06:00 to 06:30 UTC/);
      expect(time).toHaveAccessibleDescription(
        /Newest available.*Some half hours have no data./,
      );
    });

    it("offers only the times that exist on the chosen day", () => {
      const { time, date, layers } = open();
      const labels = () =>
        within(time)
          .getAllByRole("option")
          .map((option) => option.textContent);
      expect(labels()).toHaveLength(13);
      expect(labels().at(-1)).toBe("06:00");
      fireEvent.change(date, { target: { value: "2026-11-01" } });
      expect(timeOf(layers)).toBe("2026-11-01t0600");
      expect(labels()).toHaveLength(48);
      expect(labels()[0]).toBe("00:00");
      expect(labels().at(-1)).toBe("23:30");
    });

    it("changes the time, and moves a time not out yet back to the newest, saying so", async () => {
      const { time, date, layers, group } = open();
      fireEvent.change(date, { target: { value: "2026-11-08" } });
      fireEvent.change(time, { target: { value: "2026-11-08t2130" } });
      expect(timeOf(layers)).toBe("2026-11-08t2130");
      expect(group).toHaveTextContent(
        "Showing 21:30 to 22:00 UTC on 8 November 2026.",
      );
      fireEvent.change(date, { target: { value: "2026-11-09" } });
      expect(timeOf(layers)).toBe("2026-11-09t0600");
      await waitFor(() =>
        expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
          "Time moved to 06:00 UTC on 9 November 2026, the nearest available.",
        ),
      );
      fireEvent.change(date, { target: { value: "" } });
      expect(timeOf(layers)).toBe("2026-11-09t0600");
    });

    it("keeps a day being typed as a draft until it is one the provider has, and says nothing meanwhile", async () => {
      const { time, date, layers } = open();
      fireEvent.change(date, { target: { value: "2026-11-01" } });
      fireEvent.change(time, { target: { value: "2026-11-01t2130" } });
      fireEvent.focus(date);
      // Typing a year digit by digit passes through years nobody means.
      for (const draft of ["0002-11-05", "0020-11-05", "0202-11-05"]) {
        fireEvent.change(date, { target: { value: draft } });
        expect(date).toHaveValue(draft);
        expect(timeOf(layers)).toBe("2026-11-01t2130");
      }
      fireEvent.change(date, { target: { value: "2025-11-05" } });
      expect(timeOf(layers)).toBe("2025-11-05t2130");
      fireEvent.change(date, { target: { value: "2029-11-05" } });
      fireEvent.blur(date);
      expect(date).toHaveValue("2025-11-05");
      expect(timeOf(layers)).toBe("2025-11-05t2130");
      expect(screen.getByTestId("live-region-polite")).not.toHaveTextContent(
        "Time moved",
      );
    });

    it("describes the inputs with the status alone when the control has no help line", () => {
      const { description: _omitted, ...bare } = SAMPLE_TIME_LAYER
        .controls[0] as DateTimeControlDefinition;
      setup([{ ...SAMPLE_TIME_LAYER, controls: [bare] }]);
      toggle("sample-rain", "Sample rain");
      const group = screen.getByRole("group", { name: "Time shown" });
      const time = within(group).getByRole("combobox", { name: "Time (UTC)" });
      expect(time).toHaveAccessibleDescription(
        "Showing 06:00 to 06:30 UTC on 9 November 2026. Newest available: 06:00 UTC on 9 November 2026. Newer times may not be out yet, so they are not offered.",
      );
    });

    it("is disabled, not hidden, while its condition is not met", () => {
      const gated: LayerDefinition = {
        ...SAMPLE_TIME_LAYER,
        controls: [
          {
            kind: "switch",
            id: "live",
            label: "Choose a time",
            default: false,
          },
          {
            ...SAMPLE_TIME_LAYER.controls[0],
            enabledWhen: { control: "live", in: ["true"] },
          } as LayerDefinition["controls"][number],
        ],
      };
      setup([gated]);
      toggle("sample-rain", "Sample rain");
      const group = screen.getByRole("group", { name: "Time shown" });
      expect(within(group).getByLabelText("Date (UTC)")).toBeDisabled();
      expect(
        within(group).getByRole("combobox", { name: "Time (UTC)" }),
      ).toBeDisabled();
    });
  });
});
