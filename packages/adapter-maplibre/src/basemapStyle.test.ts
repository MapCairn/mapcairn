// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BASEMAPS,
  type BasemapDefinition,
  FAKE_HYBRID_BASEMAP,
  FAKE_RASTER_BASEMAP,
  FAKE_VECTOR_BASEMAP,
  toEngineZoom,
} from "@mapcairn/core";
import fc from "fast-check";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import {
  applyZoomLimits,
  composeHybrid,
  IMAGERY_ID,
  omitSaveDataLayers,
  styleFor,
} from "./basemapStyle";

interface FakeLayer {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  paint?: unknown;
}

/** The slice of a MapLibre map the style functions use, over plain arrays. */
class StyleMap {
  layers: FakeLayer[];
  sources: Set<string>;
  minZoom = 0;
  maxZoom = 22;
  readonly calls: string[] = [];

  constructor(layers: FakeLayer[], sources: string[]) {
    this.layers = layers;
    this.sources = new Set(sources);
  }

  getStyle() {
    return { layers: this.layers };
  }

  getLayer(id: string) {
    return this.layers.find((layer) => layer.id === id);
  }

  removeLayer(id: string) {
    this.layers = this.layers.filter((layer) => layer.id !== id);
  }

  getSource(id: string) {
    return this.sources.has(id) ? {} : undefined;
  }

  removeSource(id: string) {
    this.sources.delete(id);
  }

  addSource(id: string, spec: unknown) {
    this.calls.push(`addSource:${id}:${JSON.stringify(spec)}`);
    this.sources.add(id);
  }

  addLayer(layer: FakeLayer, before?: string) {
    this.calls.push(`addLayer:${layer.id}:before=${before}`);
    const index = before
      ? this.layers.findIndex((existing) => existing.id === before)
      : -1;
    this.layers.splice(index < 0 ? this.layers.length : index, 0, layer);
  }

  getMaxZoom() {
    return this.maxZoom;
  }

  setMinZoom(zoom: number) {
    this.calls.push(`min:${zoom}`);
    this.minZoom = zoom;
  }

  setMaxZoom(zoom: number) {
    this.calls.push(`max:${zoom}`);
    this.maxZoom = zoom;
  }

  asMap(): MapLibreMap {
    return this as unknown as MapLibreMap;
  }
}

const planet = (id: string, type: string, sourceLayer: string): FakeLayer => ({
  id,
  type,
  source: "planet",
  "source-layer": sourceLayer,
});

function labelStyle(): StyleMap {
  return new StyleMap(
    [
      { id: "background", type: "background" },
      planet("park", "fill", "park"),
      { id: "relief", type: "raster", source: "relief-source" },
      planet("road-area", "fill", "transportation"),
      planet("roads", "line", "transportation"),
      planet("ferries", "line", "transportation"),
      planet("towns", "symbol", "place"),
    ],
    ["planet", "relief-source"],
  );
}

const ids = (map: StyleMap) => map.layers.map((layer) => layer.id);

describe("styleFor", () => {
  it("is the style URL of a vector basemap", () => {
    expect(styleFor(FAKE_VECTOR_BASEMAP)).toBe(
      "https://tiles.example/style.json",
    );
  });

  it("is the label style URL of a hybrid basemap", () => {
    expect(styleFor(FAKE_HYBRID_BASEMAP)).toBe(
      "https://tiles.example/labels.json",
    );
  });

  it("is an inline style with one raster source and layer for a raster basemap", () => {
    expect(styleFor(FAKE_RASTER_BASEMAP)).toEqual({
      version: 8,
      sources: {
        basemap: {
          type: "raster",
          tiles: ["https://tiles.example/{z}/{x}/{y}.png"],
          tileSize: 256,
          maxzoom: 12,
        },
      },
      layers: [{ id: "basemap", type: "raster", source: "basemap" }],
    });
  });
});

describe("composeHybrid", () => {
  it("keeps the line and symbol layers of the label source layers, less those it omits, and drops the sources only the rest drew from", () => {
    const map = labelStyle();
    composeHybrid(map.asMap(), FAKE_HYBRID_BASEMAP);
    expect(ids(map)).toEqual([
      "basemap-ground",
      "basemap-imagery",
      "roads",
      "towns",
    ]);
    expect([...map.sources]).toEqual(["planet", IMAGERY_ID]);
  });

  it("adds the imagery under the kept layers, up to its deepest real tile level, and the swatch ground under that", () => {
    const map = labelStyle();
    composeHybrid(map.asMap(), FAKE_HYBRID_BASEMAP);
    expect(map.calls).toEqual([
      `addSource:basemap-imagery:${JSON.stringify({
        type: "raster",
        tiles: ["https://imagery.example/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 14,
      })}`,
      "addLayer:basemap-imagery:before=roads",
      "addLayer:basemap-ground:before=basemap-imagery",
    ]);
    expect(map.getLayer("basemap-ground")).toMatchObject({
      type: "background",
      paint: { "background-color": "#203024" },
    });
  });

  it("adds no ground when the basemap has no swatch", () => {
    const map = labelStyle();
    const { swatch: _swatch, ...withoutSwatch } = FAKE_HYBRID_BASEMAP;
    composeHybrid(map.asMap(), withoutSwatch);
    expect(ids(map)).toEqual(["basemap-imagery", "roads", "towns"]);
  });

  it("leaves another basemap, or none, alone", () => {
    const map = labelStyle();
    const before = ids(map);
    composeHybrid(map.asMap(), FAKE_VECTOR_BASEMAP);
    composeHybrid(map.asMap(), undefined);
    expect(ids(map)).toEqual(before);
    expect(map.calls).toEqual([]);
  });
});

describe("omitSaveDataLayers", () => {
  const withOmitted: BasemapDefinition = {
    ...FAKE_VECTOR_BASEMAP,
    saveDataOmitLayers: ["relief", "missing"],
  };

  it("removes the named layers and the source only they drew from while Save data is on", () => {
    const map = labelStyle();
    omitSaveDataLayers(map.asMap(), withOmitted, true);
    expect(ids(map)).not.toContain("relief");
    expect(ids(map)).toContain("roads");
    expect([...map.sources]).toEqual(["planet"]);
  });

  it("keeps a source that a remaining layer still draws from", () => {
    const map = labelStyle();
    omitSaveDataLayers(
      map.asMap(),
      { ...FAKE_VECTOR_BASEMAP, saveDataOmitLayers: ["roads"] },
      true,
    );
    expect(ids(map)).not.toContain("roads");
    expect([...map.sources]).toContain("planet");
  });

  it("removes nothing while Save data is off, or with no basemap", () => {
    const map = labelStyle();
    const before = ids(map);
    omitSaveDataLayers(map.asMap(), withOmitted, false);
    omitSaveDataLayers(map.asMap(), undefined, true);
    expect(ids(map)).toEqual(before);
    expect([...map.sources]).toEqual(["planet", "relief-source"]);
  });
});

describe("applyZoomLimits", () => {
  const limits: BasemapDefinition = {
    ...FAKE_VECTOR_BASEMAP,
    minZoom: 2,
    maxZoom: 12,
  };

  it("sets the engine's zoom limits from the basemap's normalised zoom", () => {
    const map = new StyleMap([], []);
    applyZoomLimits(map.asMap(), limits);
    expect(map.minZoom).toBe(toEngineZoom(2));
    expect(map.maxZoom).toBe(toEngineZoom(12));
  });

  it("lowers the minimum first when it stays under the current maximum", () => {
    const map = new StyleMap([], []);
    map.maxZoom = 22;
    applyZoomLimits(map.asMap(), limits);
    expect(map.calls).toEqual([
      `min:${toEngineZoom(2)}`,
      `max:${toEngineZoom(12)}`,
    ]);
  });

  it("raises the maximum first when the new minimum passes the current maximum", () => {
    const map = new StyleMap([], []);
    map.maxZoom = 0;
    applyZoomLimits(map.asMap(), limits);
    expect(map.calls).toEqual([
      `max:${toEngineZoom(12)}`,
      `min:${toEngineZoom(2)}`,
    ]);
  });
});

/**
 * Nothing switches on a basemap's id: a basemap is data, and the adapter reads
 * its source, zoom limits and layer lists. So two basemaps that differ only in
 * `id` must be drawn the same way, whatever the id is.
 */
describe("a basemap's id", () => {
  const FAKES: readonly BasemapDefinition[] = [
    FAKE_RASTER_BASEMAP,
    FAKE_VECTOR_BASEMAP,
    FAKE_HYBRID_BASEMAP,
  ].map((basemap) => ({ ...basemap, saveDataOmitLayers: ["relief", "roads"] }));
  const anyBasemap = fc.constantFrom(...FAKES);
  // The ids the site's own basemaps use are tried as well as random text,
  // because a branch on one of them is what a random string would not find.
  const anyId = fc.oneof(
    fc.string(),
    fc.constantFrom(...BASEMAPS.map((basemap) => basemap.id)),
  );

  it("does not change the style styleFor gives", () => {
    fc.assert(
      fc.property(anyBasemap, anyId, (basemap, id) => {
        expect(styleFor({ ...basemap, id })).toEqual(styleFor(basemap));
      }),
    );
  });

  it("does not change what composeHybrid does to a style", () => {
    fc.assert(
      fc.property(anyBasemap, anyId, (basemap, id) => {
        const original = labelStyle();
        const renamed = labelStyle();
        composeHybrid(original.asMap(), basemap);
        composeHybrid(renamed.asMap(), { ...basemap, id });
        expect(renamed.calls).toEqual(original.calls);
        expect(ids(renamed)).toEqual(ids(original));
        expect([...renamed.sources]).toEqual([...original.sources]);
      }),
    );
  });

  it("does not change what omitSaveDataLayers removes", () => {
    fc.assert(
      fc.property(anyBasemap, anyId, fc.boolean(), (basemap, id, saveData) => {
        const original = labelStyle();
        const renamed = labelStyle();
        omitSaveDataLayers(original.asMap(), basemap, saveData);
        omitSaveDataLayers(renamed.asMap(), { ...basemap, id }, saveData);
        expect(ids(renamed)).toEqual(ids(original));
        expect([...renamed.sources]).toEqual([...original.sources]);
      }),
    );
  });
});
