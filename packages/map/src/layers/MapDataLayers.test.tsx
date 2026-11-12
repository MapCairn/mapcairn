import {
  createFakeServices,
  FakeMapAdapter,
  type LayerDefinition,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_LINE_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
  StaticLayerRegistry,
  sampleArea,
  sampleLine,
  samplePoint,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { testMapContext } from "../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../host";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import {
  MapDataLayers,
  SelectionMarker,
  VIEW_SETTLE_MS,
} from "./MapDataLayers";
import { type DataLayers, useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);

function setup(
  props: {
    ignoreTaps?: boolean;
    definitions?: readonly LayerDefinition[];
    /** Render with no map engine yet, as before the map has started. */
    mapless?: boolean;
  } = {},
) {
  const services = createFakeServices({
    layers: new StaticLayerRegistry(props.definitions ?? SAMPLE_LAYERS),
  });
  const adapter = new FakeMapAdapter();
  const onFeatureTap = vi.fn();
  const handle: { current: DataLayers | null } = { current: null };
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    handle.current = layers;
    return (
      <>
        <MapDataLayers
          layers={layers}
          onFeatureTap={onFeatureTap}
          ignoreTaps={props.ignoreTaps}
        />
        <svg aria-hidden="true">
          <SelectionMarker layers={layers} />
        </svg>
      </>
    );
  }
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider
          value={testMapContext({ adapter: props.mapless ? null : adapter })}
        >
          <Harness />
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  const layers = () => handle.current as DataLayers;
  return {
    ...view,
    adapter,
    layers,
    onFeatureTap,
    source: services.fakes.layerSource,
  };
}

describe("MapDataLayers", () => {
  it("draws nothing while every layer is off", () => {
    const { adapter } = setup();
    expect(adapter.drawnLayers()).toEqual([]);
  });

  it("draws a feed layer's points once they load, styled from the definition", async () => {
    const { adapter, layers, source } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("a", { level: "Orange" }),
      samplePoint("b", { level: "Red" }),
    ]);
    act(() => layers().setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(adapter.drawnLayers()).toEqual([
        { id: "sample-alerts", kind: "features", count: 2 },
      ]),
    );
    expect(adapter.featuresOf("sample-alerts")?.[0]).toMatchObject({
      colour: tokenValues.dataPalette.orange,
      shape: "square",
    });
  });

  it("draws a polygon layer with each polygon's look and label, and a line layer as lines", async () => {
    const { adapter, layers, source } = setup({
      definitions: [SAMPLE_AREA_LAYER, SAMPLE_LINE_LAYER],
    });
    source.setFeatures("sample-areas", [
      sampleArea("p", { title: "Paris", density: 250 }),
    ]);
    source.setFeatures("sample-lines", [sampleLine("r", { kind: "main" })]);
    act(() => layers().setEnabled("sample-areas", true));
    act(() => layers().setEnabled("sample-lines", true));
    await waitFor(() =>
      expect(adapter.drawnLayers()).toEqual([
        { id: "sample-areas", kind: "styled", geometry: "area", count: 1 },
        { id: "sample-lines", kind: "styled", geometry: "line", count: 1 },
      ]),
    );
    expect(adapter.styledShapesOf("sample-areas")?.shapes[0]).toMatchObject({
      id: "p",
      label: "Paris",
      look: {
        colour: tokenValues.dataPalette["ordinal-5"],
        pattern: "crosshatch",
      },
    });
    act(() => layers().setEnabled("sample-areas", false));
    expect(adapter.drawnLayers().map((layer) => layer.id)).toEqual([
      "sample-lines",
    ]);
  });

  it("selects a polygon when it is tapped", async () => {
    const { adapter, layers, source } = setup({
      definitions: [SAMPLE_AREA_LAYER],
    });
    source.setFeatures("sample-areas", [sampleArea("p", { density: 10 })]);
    act(() => layers().setEnabled("sample-areas", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(1));
    act(() => adapter.simulateFeatureTap("sample-areas", "p"));
    expect(layers().selected?.feature.id).toBe("p");
  });

  it("opens a list when a tap finds several features, and a card when it finds one", async () => {
    const { adapter, layers, source } = setup({
      definitions: [SAMPLE_AREA_LAYER, SAMPLE_FEED_LAYER],
    });
    source.setFeatures("sample-areas", [sampleArea("p", { density: 10 })]);
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => layers().setEnabled("sample-areas", true));
    act(() => layers().setEnabled("sample-points", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(2));
    act(() =>
      adapter.simulateFeatureHits([
        { layerId: "sample-points", featureId: "a" },
        { layerId: "sample-areas", featureId: "p" },
      ]),
    );
    expect(layers().selected).toBeNull();
    expect(layers().choices?.map((item) => item.feature.id)).toEqual([
      "a",
      "p",
    ]);
    act(() => adapter.simulateFeatureTap("sample-areas", "p"));
    expect(layers().choices).toBeNull();
    expect(layers().selected?.feature.id).toBe("p");
  });

  describe("query layers", () => {
    it("reports the view when a query layer is turned on, and again once the map settles", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { adapter, layers, source } = setup({
          definitions: [SAMPLE_QUERY_LAYER],
        });
        source.setFeatures("sample-query", [samplePoint("a")]);
        act(() =>
          adapter.setView({ center: { lat: 48.85, lng: 2.35 }, zoom: 12 }),
        );
        act(() => layers().setEnabled("sample-query", true));
        await waitFor(() => expect(source.requests).toHaveLength(1));
        // A burst of moves asks once, after the map stops.
        act(() => {
          adapter.setView({ center: { lat: 10, lng: 20 } });
          adapter.setView({ center: { lat: 10.1, lng: 20.1 } });
          adapter.setView({ center: { lat: 10.2, lng: 20.2 } });
        });
        expect(source.requests).toHaveLength(1);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(VIEW_SETTLE_MS + 50);
        });
        await waitFor(() => expect(source.requests).toHaveLength(2));
        expect(source.requests[1]?.url).not.toBe(source.requests[0]?.url);
      } finally {
        vi.useRealTimers();
      }
    });

    it("listens to the map only while a query layer is on", () => {
      const { adapter, layers } = setup({ definitions: [SAMPLE_QUERY_LAYER] });
      const bounds = vi.spyOn(adapter, "getBounds");
      expect(bounds).not.toHaveBeenCalled();
      act(() => layers().setEnabled("sample-query", true));
      expect(bounds).toHaveBeenCalledTimes(1);
      act(() => layers().setEnabled("sample-query", false));
      act(() => adapter.setView({ center: { lat: 1, lng: 1 } }));
      expect(bounds).toHaveBeenCalledTimes(1);
    });
  });

  it("draws a heatmap from its points and follows its controls", async () => {
    const { adapter, layers, source } = setup({
      definitions: [SAMPLE_HEATMAP_LAYER],
    });
    source.setFeatures("sample-heat", [
      samplePoint("a", { weight: 2 }),
      samplePoint("b", { weight: 5 }, [2.35, 48.85]),
    ]);
    act(() => layers().setEnabled("sample-heat", true));
    await waitFor(() =>
      expect(adapter.drawnLayers()).toEqual([
        { id: "sample-heat", kind: "heatmap", source: "points", count: 2 },
      ]),
    );
    expect(adapter.heatmapOf("sample-heat")?.style).toMatchObject({
      radius: 20,
      intensity: 1,
      opacity: 0.8,
    });
    act(() => layers().setControl("sample-heat", "radius", "50"));
    act(() => layers().setControl("sample-heat", "opacity", "0.4"));
    expect(adapter.heatmapOf("sample-heat")?.style).toMatchObject({
      radius: 50,
      opacity: 0.4,
    });
  });

  it("draws a vector tile layer and its heatmap source layers, and removes them together", () => {
    const { adapter, layers } = setup({ definitions: [SAMPLE_VECTOR_LAYER] });
    act(() => layers().setEnabled("sample-districts", true));
    expect(adapter.drawnLayers()).toEqual([
      {
        id: "sample-districts",
        kind: "vector",
        tiles: "https://vector.test/{z}/{x}/{y}.pbf",
        sourceLayers: ["areas", "roads"],
      },
      {
        id: "sample-districts:heatmap:2",
        kind: "heatmap",
        source: "vector",
        count: 0,
      },
    ]);
    act(() => layers().setEnabled("sample-districts", false));
    expect(adapter.drawnLayers()).toEqual([]);
  });

  it("hands a tile layer's bounds to the map, so it never asks for a tile outside them", () => {
    const { adapter, layers } = setup();
    const setTileLayer = vi.spyOn(adapter, "setTileLayer");
    act(() => layers().setEnabled("sample-imagery", true));
    expect(setTileLayer).toHaveBeenCalledWith(
      "sample-imagery",
      expect.objectContaining({ bounds: [-180, -60, 180, 85] }),
    );
  });

  it("draws a tile layer with its URL and opacity, and follows its controls", () => {
    const { adapter, layers } = setup();
    act(() => layers().setEnabled("sample-imagery", true));
    expect(adapter.drawnLayers()).toEqual([
      {
        id: "sample-imagery",
        kind: "tiles",
        tiles: "https://tiles.test/2026-11-08/{z}/{y}/{x}.jpg",
        opacity: 0.8,
      },
    ]);
    act(() => layers().setControl("sample-imagery", "opacity", "0.5"));
    act(() => layers().setControl("sample-imagery", "date", "2026-01-02"));
    expect(adapter.drawnLayers()).toEqual([
      {
        id: "sample-imagery",
        kind: "tiles",
        tiles: "https://tiles.test/2026-01-02/{z}/{y}/{x}.jpg",
        opacity: 0.5,
      },
    ]);
  });

  it("removes a layer from the map when it is turned off, and everything on unmount", async () => {
    const { adapter, layers, source, unmount } = setup();
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => layers().setEnabled("sample-imagery", true));
    act(() => layers().setEnabled("sample-points", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(2));
    act(() => layers().setEnabled("sample-imagery", false));
    expect(adapter.drawnLayers().map((layer) => layer.id)).toEqual([
      "sample-points",
    ]);
    unmount();
    expect(adapter.drawnLayers()).toEqual([]);
  });

  it("selects a tapped point and asks the app to show its card", async () => {
    const { adapter, layers, source, onFeatureTap } = setup();
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => layers().setEnabled("sample-points", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(1));
    act(() => adapter.simulateFeatureTap("sample-points", "a"));
    expect(layers().selected?.feature.id).toBe("a");
    expect(layers().focusRequest).toBe(1);
    expect(onFeatureTap).toHaveBeenCalledWith({
      layerId: "sample-points",
      featureId: "a",
      hits: [{ layerId: "sample-points", featureId: "a" }],
    });
  });

  it("ignores taps while the app says so (measuring)", async () => {
    const { adapter, layers, source, onFeatureTap } = setup({
      ignoreTaps: true,
    });
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => layers().setEnabled("sample-points", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(1));
    act(() => adapter.simulateFeatureTap("sample-points", "a"));
    expect(layers().selected).toBeNull();
    expect(onFeatureTap).not.toHaveBeenCalled();
  });

  it("draws an affected area while it is shown", async () => {
    const { adapter, layers, source } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e", { area: "https://alerts.test/a" }),
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
    act(() => layers().setEnabled("sample-alerts", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(1));
    act(() => layers().showDetail("sample-alerts", "e"));
    await waitFor(() =>
      expect(adapter.drawnLayers()).toContainEqual({
        id: ":detail",
        kind: "shapes",
        count: 1,
      }),
    );
    act(() => layers().hideDetail());
    expect(adapter.drawnLayers().map((layer) => layer.id)).toEqual([
      "sample-alerts",
    ]);
  });

  it("draws a tile layer with no opacity control at full opacity", () => {
    const opaque: LayerDefinition = {
      ...SAMPLE_TILE_LAYER,
      controls: SAMPLE_TILE_LAYER.controls.filter(
        (control) => control.kind !== "opacity",
      ),
    };
    const { adapter, layers } = setup({ definitions: [opaque] });
    act(() => layers().setEnabled(opaque.id, true));
    expect(adapter.drawnLayers()).toMatchObject([
      { id: "sample-imagery", opacity: 1 },
    ]);
  });

  it("waits for the map before it draws or listens, and draws no ring without one", async () => {
    const { adapter, layers, source, container } = setup({ mapless: true });
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => layers().setEnabled("sample-points", true));
    await waitFor(() => expect(layers().layers[0]?.features).toHaveLength(1));
    act(() => layers().select("sample-points", "a"));
    expect(adapter.drawnLayers()).toEqual([]);
    expect(
      container.querySelector("[data-testid='selection-marker']"),
    ).toBeNull();
  });

  it("outlines the selected polygon or line in the overlay layer, and rings a point", async () => {
    const { container, adapter, layers, source } = setup({
      definitions: [SAMPLE_AREA_LAYER, SAMPLE_LINE_LAYER],
    });
    source.setFeatures("sample-areas", [sampleArea("p", { density: 10 })]);
    source.setFeatures("sample-lines", [sampleLine("r", { kind: "main" })]);
    act(() => layers().setEnabled("sample-areas", true));
    act(() => layers().setEnabled("sample-lines", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(2));
    act(() => layers().select("sample-areas", "p"));
    const marker = () =>
      container.querySelector("[data-testid='selection-marker']");
    expect(marker()?.querySelectorAll("path")).toHaveLength(2);
    expect(marker()?.querySelector("circle")).toBeNull();
    const [halo, ring] = [...(marker()?.querySelectorAll("path") ?? [])];
    expect(halo?.getAttribute("d")).toBe(ring?.getAttribute("d"));
    expect(halo?.getAttribute("d")).toMatch(/^M[\d.,-]+( L[\d.,-]+)+ Z$/);
    act(() => layers().select("sample-lines", "r"));
    expect(marker()?.querySelector("path")?.getAttribute("d")).not.toContain(
      "Z",
    );
  });

  it("rings the selected point in the overlay layer", async () => {
    const { container, adapter, layers, source } = setup();
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => layers().setEnabled("sample-points", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(1));
    expect(
      container.querySelector("[data-testid='selection-marker']"),
    ).toBeNull();
    act(() => layers().select("sample-points", "a"));
    expect(
      container.querySelector("[data-testid='selection-marker']"),
    ).not.toBeNull();
  });
});
