import {
  createFakeServices,
  FakeMapAdapter,
  type LayerDefinition,
  type LayerFeature,
  SAMPLE_ALERT_LAYER,
  SAMPLE_LAYERS,
  StaticLayerRegistry,
  samplePoint,
} from "@karta/core";
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
    layers: new StaticLayerRegistry(definitions),
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

  it("shows a feature that is not a point without moving the map", async () => {
    const { source, adapter, onShowOnMap } = setup();
    const area: LayerFeature = {
      ...samplePoint("zone", { title: "Zone" }),
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    };
    source.setFeatures("sample-points", [area]);
    toggle("sample-points", "Sample points");
    const before = adapter.getView();
    fireEvent.click(await screen.findByTestId("layer-list-row"));
    expect(adapter.getView()).toEqual(before);
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("feature-card-heading")).toHaveTextContent(
      "Zone",
    );
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
      layers: new StaticLayerRegistry(SAMPLE_LAYERS),
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
});
