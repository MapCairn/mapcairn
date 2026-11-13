// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  type DetailSource,
  FakeLayerCatalogue,
  FakeMapAdapter,
  type FeedLayerDefinition,
  isFeedLayer,
  type LayerCatalogue,
  type LayerDefinition,
  type LayerFeature,
  type PointStyle,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LAYERS,
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
import { paletteColour } from "./mapFeatures";
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
function mount<Catalogue extends LayerCatalogue>(
  catalogue: Catalogue,
  features: Readonly<Record<string, readonly LayerFeature[]>> = {},
  details: Readonly<Record<string, readonly LayerFeature[]>> = {},
) {
  const services = createFakeServices({ layers: catalogue });
  const adapter = new FakeMapAdapter();
  for (const [id, loaded] of Object.entries(features)) {
    services.fakes.layerSource.setFeatures(id, loaded);
  }
  for (const [id, shapes] of Object.entries(details)) {
    services.fakes.layerSource.setDetail(id, shapes);
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
  render(tree());
  return {
    adapter,
    catalogue,
    layers: () => handle.layers as DataLayers,
    swap: (definition: LayerDefinition) => act(() => handle.swap(definition)),
  };
}

function setup(
  definitions: readonly LayerDefinition[],
  features: Readonly<Record<string, readonly LayerFeature[]>> = {},
) {
  return mount(new FakeLayerCatalogue(definitions), features);
}

/** A second layer, so a test can change the layers' state without touching the one it watches. */
const OTHER_LAYER: LayerDefinition = {
  ...SAMPLE_TILE_LAYER,
  id: "other-imagery",
};

/** A runtime catalogue whose `load` returns a fresh deep copy of the definitions each time. */
function copyingCatalogue(definitions: readonly LayerDefinition[]) {
  const load = vi.fn(async () => structuredClone(definitions));
  return {
    load,
    catalogue: createRuntimeLayerCatalogue({
      load,
      options: {
        decoders: createDecoderRegistry(),
        formatters: createFormatterRegistry(),
      },
    }),
  };
}

/** How many times a draw method was called for a layer (or one of its heatmap source layers). */
function drawsOf(spy: { mock: { calls: unknown[][] } }, layerId: string) {
  return spy.mock.calls.filter(([id]) => String(id).startsWith(layerId)).length;
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
        const page = setup([definition, OTHER_LAYER], {
          [definition.id]: features,
        });
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
          expect(drawsOf(spy, definition.id)).toBe(1);
        }
      });

      it("is not drawn again when the layers' state changes for another reason", async () => {
        const { swap, layers, spies } = await turnedOn();
        swap(replaced);
        act(() => layers().setEnabled(OTHER_LAYER.id, true));
        for (const spy of spies) {
          expect(drawsOf(spy, definition.id)).toBe(1);
        }
      });

      it("is not drawn again when a refresh lists the same definition", async () => {
        const { catalogue, spies } = await turnedOn();
        act(() => catalogue.setLayers([definition, OTHER_LAYER]));
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

  describe("an affected area that is shown", () => {
    /** The sample alerts layer, whose `detail` block gives the area its colour. */
    function alertsWithDetail(): FeedLayerDefinition<PointStyle> & {
      detail: DetailSource;
    } {
      const found = SAMPLE_LAYERS.find((layer) => layer.id === "sample-alerts");
      if (!found || !isFeedLayer(found) || !found.detail) {
        throw new Error(
          "the sample alerts layer lost its affected-area detail",
        );
      }
      return { ...found, detail: found.detail };
    }

    async function showingArea() {
      const alerts = alertsWithDetail();
      const page = mount(
        new FakeLayerCatalogue([alerts]),
        { [alerts.id]: [samplePoint("e", { area: "https://alerts.test/a" })] },
        {
          [alerts.id]: [
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
          ],
        },
      );
      act(() => page.layers().setEnabled(alerts.id, true));
      await waitFor(() => expect(page.adapter.drawnLayers()).toHaveLength(1));
      act(() => page.layers().showDetail(alerts.id, "e"));
      await waitFor(() => expect(page.adapter.drawnLayers()).toHaveLength(2));
      return { ...page, alerts };
    }

    it("is drawn again in the new colour when a refresh changes only the colour", async () => {
      const { adapter, catalogue, alerts } = await showingArea();
      const setShapeLayer = vi.spyOn(adapter, "setShapeLayer");
      act(() =>
        catalogue.setLayers([
          {
            ...alerts,
            detail: { ...alerts.detail, colour: "orange" as const },
          },
        ]),
      );
      expect(setShapeLayer).toHaveBeenCalledTimes(1);
      expect(setShapeLayer).toHaveBeenCalledWith(
        ":detail",
        expect.objectContaining({ colour: paletteColour("orange") }),
      );
    });

    it("is not drawn again when a refresh lists the same definition", async () => {
      const { adapter, catalogue, alerts } = await showingArea();
      const setShapeLayer = vi.spyOn(adapter, "setShapeLayer");
      act(() => catalogue.setLayers([alerts]));
      expect(setShapeLayer).not.toHaveBeenCalled();
    });
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

  it.each([
    ["tile size", { tileSize: 512 as const }],
    [
      "bounds",
      { bounds: [-90, -45, 90, 45] as [number, number, number, number] },
    ],
  ])(
    "draws a raster layer again when a refresh changes only its %s",
    (_name, change) => {
      const { adapter, catalogue, layers } = setup([SAMPLE_TILE_LAYER]);
      act(() => layers().setEnabled("sample-imagery", true));
      const setTileLayer = vi.spyOn(adapter, "setTileLayer");
      act(() =>
        catalogue.setLayers([
          {
            ...SAMPLE_TILE_LAYER,
            source: { ...SAMPLE_TILE_LAYER.source, ...change },
          },
        ]),
      );
      expect(setTileLayer).toHaveBeenCalledTimes(1);
      expect(setTileLayer).toHaveBeenCalledWith(
        "sample-imagery",
        expect.objectContaining(change),
      );
    },
  );

  describe("a refresh that returns an equal copy of a definition", () => {
    it.each([
      [
        "a feed layer",
        SAMPLE_AREA_LAYER,
        { "sample-areas": [sampleArea("p", { density: 10 })] },
        "setStyledShapes",
      ],
      ["a raster layer", SAMPLE_TILE_LAYER, {}, "setTileLayer"],
    ] as const)(
      "draws %s nothing again",
      async (_name, definition, features, method) => {
        const { load, catalogue } = copyingCatalogue([definition]);
        const { adapter, layers } = mount(catalogue, features);
        await waitFor(() => expect(layers().layers).toHaveLength(1));
        act(() => layers().setEnabled(definition.id, true));
        await waitFor(() =>
          expect(adapter.drawnLayers().length).toBeGreaterThan(0),
        );
        const kept = layers().layers[0]?.definition;
        const spy = vi.spyOn(adapter, method);
        await act(() => catalogue.refresh());
        expect(load).toHaveBeenCalledTimes(2);
        expect(layers().layers[0]?.definition).toBe(kept);
        expect(spy).not.toHaveBeenCalled();
      },
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
