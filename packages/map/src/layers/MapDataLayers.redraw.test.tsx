// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  FakeMapAdapter,
  type LayerDefinition,
  type LayerFeature,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
  sampleArea,
  samplePoint,
} from "@mapcairn/core";
import { act, render, waitFor } from "@testing-library/react";
import { useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { testMapContext } from "../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../host";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { MapDataLayers } from "./MapDataLayers";
import { type DataLayers, useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);

type DrawMethod =
  | "setFeatureLayer"
  | "setStyledShapes"
  | "setHeatmapLayer"
  | "setVectorLayer"
  | "setTileLayer";

/**
 * `MapDataLayers` over the real hook and a scripted catalogue. A test replaces
 * a layer's definition in two ways: `swap` hands the map a new definition
 * object while every control value and loaded feature stays the very same
 * object, so only the definition says the layer changed; `catalogue.setLayers`
 * is the real route, a refreshed list.
 */
function setup(
  definitions: readonly LayerDefinition[],
  features: Readonly<Record<string, readonly LayerFeature[]>> = {},
) {
  const catalogue = new FakeLayerCatalogue(definitions);
  const services = createFakeServices({ layers: catalogue });
  const adapter = new FakeMapAdapter();
  for (const [id, loaded] of Object.entries(features)) {
    services.fakes.layerSource.setFeatures(id, loaded);
  }
  const handle: {
    layers: DataLayers | null;
    swap: (definition: LayerDefinition) => void;
  } = { layers: null, swap: () => undefined };
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    const [swapped, setSwapped] = useState<LayerDefinition | null>(null);
    handle.layers = layers;
    handle.swap = setSwapped;
    const shown = useMemo(
      () =>
        swapped
          ? {
              ...layers,
              layers: layers.layers.map((layer) =>
                layer.definition.id === swapped.id
                  ? { ...layer, definition: swapped }
                  : layer,
              ),
            }
          : layers,
      [layers, swapped],
    );
    return <MapDataLayers layers={shown} />;
  }
  const tree = () => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider value={testMapContext({ adapter })}>
          <Harness />
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
  const view = render(tree());
  return {
    adapter,
    catalogue,
    layers: () => handle.layers as DataLayers,
    swap: (definition: LayerDefinition) => act(() => handle.swap(definition)),
    /** Renders again with nothing changed, as any unrelated update would. */
    rerender: () => view.rerender(tree()),
  };
}

const KINDS: readonly {
  readonly kind: string;
  readonly definition: LayerDefinition;
  readonly features: readonly LayerFeature[];
  readonly methods: readonly DrawMethod[];
  /** The same layer with a change that leaves its URL and controls alone. */
  readonly replaced: LayerDefinition;
}[] = [
  {
    kind: "a feed layer drawn as points",
    definition: SAMPLE_FEED_LAYER,
    features: [samplePoint("a")],
    methods: ["setFeatureLayer"],
    replaced: {
      ...SAMPLE_FEED_LAYER,
      style: {
        ...SAMPLE_FEED_LAYER.style,
        size: { field: "value", stops: [[0, 12]], labels: ["Any"] },
      },
    },
  },
  {
    kind: "a feed layer drawn as shapes",
    definition: SAMPLE_AREA_LAYER,
    features: [sampleArea("p", { density: 10 })],
    methods: ["setStyledShapes"],
    replaced: {
      ...SAMPLE_AREA_LAYER,
      style: { ...SAMPLE_AREA_LAYER.style, fillOpacity: 0.3 },
    },
  },
  {
    kind: "a heatmap",
    definition: SAMPLE_HEATMAP_LAYER,
    features: [samplePoint("a", { weight: 2 })],
    methods: ["setHeatmapLayer"],
    replaced: {
      ...SAMPLE_HEATMAP_LAYER,
      heatmap: {
        ...SAMPLE_HEATMAP_LAYER.heatmap,
        ramp: ["ordinal-2", "ordinal-4", "ordinal-5"],
      },
    },
  },
  {
    kind: "a vector tile layer and its heatmap source layer",
    definition: SAMPLE_VECTOR_LAYER,
    features: [],
    methods: ["setVectorLayer", "setHeatmapLayer"],
    replaced: { ...SAMPLE_VECTOR_LAYER, maxzoom: 12 },
  },
  {
    kind: "a raster layer",
    definition: SAMPLE_TILE_LAYER,
    features: [],
    methods: ["setTileLayer"],
    replaced: {
      ...SAMPLE_TILE_LAYER,
      source: { ...SAMPLE_TILE_LAYER.source, tileSize: 512 },
    },
  },
];

describe("MapDataLayers when a layer's definition is replaced", () => {
  describe.each(KINDS)(
    "$kind",
    ({ definition, features, methods, replaced }) => {
      const turnedOn = async () => {
        const page = setup([definition], { [definition.id]: features });
        act(() => page.layers().setEnabled(definition.id, true));
        await waitFor(() =>
          expect(page.adapter.drawnLayers().length).toBeGreaterThan(0),
        );
        const spies = methods.map((method) => vi.spyOn(page.adapter, method));
        return { ...page, spies };
      };

      it("is drawn again, with the same URL and controls, so the new look shows", async () => {
        const { swap, spies } = await turnedOn();
        swap(replaced);
        for (const spy of spies) {
          expect(spy).toHaveBeenCalledTimes(1);
        }
      });

      it("is not drawn again by a render that changes nothing", async () => {
        const { swap, rerender, spies } = await turnedOn();
        swap(replaced);
        rerender();
        for (const spy of spies) {
          expect(spy).toHaveBeenCalledTimes(1);
        }
      });

      it("is not drawn again when a refresh lists the same definition", async () => {
        const { catalogue, spies } = await turnedOn();
        act(() => catalogue.setLayers([definition]));
        for (const spy of spies) {
          expect(spy).not.toHaveBeenCalled();
        }
      });
    },
  );

  it("draws a feed layer again with the new look when a refresh replaces its definition", async () => {
    const { adapter, catalogue, layers } = setup([SAMPLE_AREA_LAYER], {
      "sample-areas": [sampleArea("p", { density: 10 })],
    });
    act(() => layers().setEnabled("sample-areas", true));
    await waitFor(() => expect(adapter.drawnLayers()).toHaveLength(1));
    const fillOpacity = () =>
      adapter.styledShapesOf("sample-areas")?.shapes[0]?.look.fillOpacity;
    expect(fillOpacity()).toBe(0.6);
    act(() =>
      catalogue.setLayers([
        {
          ...SAMPLE_AREA_LAYER,
          style: { ...SAMPLE_AREA_LAYER.style, fillOpacity: 0.3 },
        },
      ]),
    );
    expect(fillOpacity()).toBe(0.3);
  });

  it("draws a raster layer once, not twice, when its tile URL and its definition both change", async () => {
    const { adapter, catalogue, layers } = setup([SAMPLE_TILE_LAYER]);
    act(() => layers().setEnabled("sample-imagery", true));
    const setTileLayer = vi.spyOn(adapter, "setTileLayer");
    act(() => {
      catalogue.setLayers([
        {
          ...SAMPLE_TILE_LAYER,
          source: {
            ...SAMPLE_TILE_LAYER.source,
            tiles: "https://tiles.test/v2/{date}/{z}/{y}/{x}.jpg",
          },
        },
      ]);
    });
    expect(setTileLayer).toHaveBeenCalledTimes(1);
    expect(setTileLayer).toHaveBeenCalledWith(
      "sample-imagery",
      expect.objectContaining({
        tiles: "https://tiles.test/v2/2026-11-08/{z}/{y}/{x}.jpg",
      }),
    );
  });

  it("draws a vector tile layer once, not twice, when its tile URL and its definition both change", () => {
    const { adapter, catalogue, layers } = setup([SAMPLE_VECTOR_LAYER]);
    act(() => layers().setEnabled("sample-districts", true));
    const setVectorLayer = vi.spyOn(adapter, "setVectorLayer");
    act(() => {
      catalogue.setLayers([
        {
          ...SAMPLE_VECTOR_LAYER,
          source: {
            ...SAMPLE_VECTOR_LAYER.source,
            tiles: "https://vector.test/v2/{z}/{x}/{y}.pbf",
          },
        },
      ]);
    });
    expect(setVectorLayer).toHaveBeenCalledTimes(1);
    expect(setVectorLayer).toHaveBeenCalledWith(
      "sample-districts",
      expect.objectContaining({
        source: expect.objectContaining({
          tiles: "https://vector.test/v2/{z}/{x}/{y}.pbf",
        }),
      }),
    );
  });

  describe("the old drawing", () => {
    it("is replaced in place: the layer is never removed first, so it does not flicker", () => {
      const { adapter, catalogue, layers } = setup([SAMPLE_VECTOR_LAYER]);
      act(() => layers().setEnabled("sample-districts", true));
      const removeLayer = vi.spyOn(adapter, "removeLayer");
      act(() => catalogue.setLayers([{ ...SAMPLE_VECTOR_LAYER, maxzoom: 12 }]));
      expect(removeLayer).not.toHaveBeenCalled();
      expect(adapter.drawnLayers()).toHaveLength(2);
    });

    it("keeps nothing of a heatmap source layer the new definition no longer has", () => {
      const { adapter, catalogue, layers } = setup([SAMPLE_VECTOR_LAYER]);
      act(() => layers().setEnabled("sample-districts", true));
      const withoutHeatmap: LayerDefinition = {
        ...SAMPLE_VECTOR_LAYER,
        sourceLayers: SAMPLE_VECTOR_LAYER.sourceLayers.filter(
          (sourceLayer) => !("heatmap" in sourceLayer),
        ),
      };
      const removeLayer = vi.spyOn(adapter, "removeLayer");
      act(() => catalogue.setLayers([withoutHeatmap]));
      expect(removeLayer.mock.calls).toEqual([["sample-districts:heatmap:2"]]);
      expect(adapter.drawnLayers()).toEqual([
        {
          id: "sample-districts",
          kind: "vector",
          tiles: "https://vector.test/{z}/{x}/{y}.pbf",
          sourceLayers: ["areas", "roads"],
        },
      ]);
    });

    it("leaves no drawing of the old kind when a definition of another kind takes its id", () => {
      const takeover: LayerDefinition = {
        ...SAMPLE_VECTOR_LAYER,
        id: SAMPLE_TILE_LAYER.id,
      };
      const { adapter, catalogue, layers } = setup([SAMPLE_TILE_LAYER]);
      act(() => layers().setEnabled("sample-imagery", true));
      const removeLayer = vi.spyOn(adapter, "removeLayer");
      act(() => catalogue.setLayers([takeover]));
      expect(removeLayer).not.toHaveBeenCalledWith("sample-imagery");
      expect(adapter.drawnLayers().map((layer) => layer.kind)).toEqual([
        "vector",
        "heatmap",
      ]);
    });
  });
});
