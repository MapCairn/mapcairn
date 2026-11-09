import {
  createFakeServices,
  FakeMapAdapter,
  type LayerDefinition,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
  StaticLayerRegistry,
  samplePoint,
} from "@karta/core";
import { tokenValues } from "@karta/theme";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { testMapContext } from "../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../host";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { MapDataLayers, SelectionMarker } from "./MapDataLayers";
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
