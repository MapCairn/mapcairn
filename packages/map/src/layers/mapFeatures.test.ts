// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFormatterRegistry,
  PALETTE_SLOTS,
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LINE_LAYER,
  SAMPLE_VECTOR_LAYER,
  type ShapeStyle,
  sampleArea,
  sampleLine,
  samplePoint,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import {
  featureBounds,
  featureOutlines,
  featurePosition,
  MAX_OUTLINE_POINTS,
  paletteColour,
  toLookRule,
  toMapFeatures,
  toMapHeatmap,
  toMapVector,
  toStyledShapes,
  toVectorHeatmaps,
} from "./mapFeatures";

describe("paletteColour", () => {
  it("has a theme value for every slot a definition may name, and nothing more", () => {
    for (const slot of PALETTE_SLOTS) {
      expect(paletteColour(slot)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(tokenValues.dataPalette).sort()).toEqual(
      [...PALETTE_SLOTS].sort(),
    );
  });

  it("refuses a slot the palette lacks", () => {
    expect(() => paletteColour("pink")).toThrow(/pink/);
  });
});

describe("featurePosition", () => {
  it("reads a point, and is null for a shape with no coordinates", () => {
    expect(featurePosition(samplePoint("a", {}, [18.4, -33.9]))).toEqual({
      lat: -33.9,
      lng: 18.4,
    });
    expect(
      featurePosition({
        id: "l",
        geometry: { type: "MultiLineString", coordinates: [] },
        fields: {},
      }),
    ).toBeNull();
  });
});

describe("toMapFeatures", () => {
  it("draws each point with its style's colour, size and shape", () => {
    expect(
      toMapFeatures(SAMPLE_ALERT_LAYER.style, [
        samplePoint("a", { level: "Red" }, [10, 20]),
      ]),
    ).toEqual([
      {
        id: "a",
        position: { lat: 20, lng: 10 },
        colour: tokenValues.dataPalette.vermillion,
        radius: 6,
        shape: "triangle",
      },
    ]);
    expect(
      toMapFeatures(SAMPLE_FEED_LAYER.style, [
        samplePoint("b", { value: 6 }),
      ])[0]?.radius,
    ).toBe(11);
  });

  it("skips features that are not points", () => {
    expect(
      toMapFeatures(SAMPLE_FEED_LAYER.style, [
        {
          id: "l",
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          fields: {},
        },
      ]),
    ).toEqual([]);
  });
});

describe("featureBounds", () => {
  it("is the box around every coordinate of a polygon or line", () => {
    expect(featureBounds(sampleArea("a", {}, [2.35, 48.85], 0.5))).toEqual({
      west: 1.85,
      south: 48.35,
      east: 2.85,
      north: 49.35,
    });
    expect(
      featureBounds(sampleLine("l", {}, [2.35, 48.85], [36.82, -1.29])),
    ).toEqual({ west: 2.35, south: -1.29, east: 36.82, north: 48.85 });
  });

  it("is a single point's own position, and null with no coordinates", () => {
    expect(featureBounds(samplePoint("p", {}, [10, 20]))).toEqual({
      west: 10,
      south: 20,
      east: 10,
      north: 20,
    });
    expect(
      featureBounds({
        id: "empty",
        geometry: { type: "MultiPolygon", coordinates: [] },
        fields: {},
      }),
    ).toBeNull();
  });
});

describe("featureOutlines", () => {
  it("lists a polygon's rings as closed and a line as open, and a point as nothing", () => {
    expect(featureOutlines(samplePoint("p"))).toEqual([]);
    const [ring] = featureOutlines(sampleArea("a"));
    expect(ring?.closed).toBe(true);
    expect(ring?.points).toHaveLength(5);
    const [line] = featureOutlines(sampleLine("l"));
    expect(line).toEqual({
      closed: false,
      points: [
        { lat: 48.85, lng: 2.35 },
        { lat: -1.29, lng: 36.82 },
      ],
    });
  });

  it("covers multi-part geometries", () => {
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ] as [number, number][];
    expect(
      featureOutlines({
        id: "m",
        geometry: { type: "MultiPolygon", coordinates: [[ring], [ring]] },
        fields: {},
      }),
    ).toHaveLength(2);
    expect(
      featureOutlines({
        id: "m",
        geometry: { type: "MultiLineString", coordinates: [ring, ring, ring] },
        fields: {},
      }),
    ).toHaveLength(3);
  });

  it("thins a long ring to a bounded number of evenly spread points, keeping both ends", () => {
    const long = Array.from(
      { length: 5000 },
      (_, index) => [index / 100, 0] as [number, number],
    );
    const [outline] = featureOutlines({
      id: "long",
      geometry: { type: "LineString", coordinates: long },
      fields: {},
    });
    expect(outline?.points).toHaveLength(MAX_OUTLINE_POINTS);
    expect(outline?.points[0]).toEqual({ lat: 0, lng: 0 });
    expect(outline?.points.at(-1)).toEqual({ lat: 0, lng: 49.99 });
  });
});

describe("featurePosition for polygons and lines", () => {
  it("is the centre of the shape's box", () => {
    expect(featurePosition(sampleArea("a", {}, [2.35, 48.85], 0.5))).toEqual({
      lat: 48.85,
      lng: 2.35,
    });
  });
});

describe("toLookRule", () => {
  const look = (slot: keyof typeof tokenValues.dataPalette) => ({
    colour: tokenValues.dataPalette[slot],
  });

  it("turns categories into cases with the other class as the fallback", () => {
    const [areas] = SAMPLE_VECTOR_LAYER.sourceLayers;
    const rule = toLookRule((areas as { style: ShapeStyle }).style);
    expect(rule).toMatchObject({
      kind: "category",
      field: "kind",
      cases: [
        { value: "park", look: { ...look("bluish-green"), pattern: "dots" } },
        { value: "water", look: { ...look("sky-blue"), pattern: "stripes" } },
      ],
      fallback: { ...look("orange"), pattern: "solid" },
    });
  });

  it("turns steps into ascending minimums with their looks", () => {
    const roads = SAMPLE_VECTOR_LAYER.sourceLayers[1] as { style: ShapeStyle };
    expect(toLookRule(roads.style)).toMatchObject({
      kind: "steps",
      field: "rank",
      steps: [
        { min: 0, look: { width: 1.5, dash: "solid" } },
        { min: 5, look: { width: 4, dash: "dashed" } },
      ],
    });
  });

  it("turns equal intervals into steps at each class's lower bound", () => {
    const rule = toLookRule(SAMPLE_AREA_LAYER.style);
    expect(rule).toMatchObject({ kind: "steps", field: "density" });
    expect(rule.kind === "steps" && rule.steps.map((step) => step.min)).toEqual(
      [0, 100, 200],
    );
  });

  it("turns a fixed style into one look", () => {
    expect(
      toLookRule({
        kind: "shapes",
        geometry: "line",
        colour: { kind: "fixed", colour: "blue", label: "Line" },
      }),
    ).toMatchObject({ kind: "fixed", look: { width: 2.5 } });
  });
});

describe("toMapVector", () => {
  it("keeps shape source layers, with windows, labels and rules, in order", () => {
    const vector = toMapVector(SAMPLE_VECTOR_LAYER, {}, 0);
    expect(vector.source).toEqual({
      tiles: "https://vector.test/{z}/{x}/{y}.pbf",
      minzoom: 0,
      maxzoom: 14,
    });
    expect(vector.minzoom).toBe(2);
    expect(vector.maxzoom).toBe(18);
    expect(vector.layers.map((layer) => layer.sourceLayer)).toEqual([
      "areas",
      "roads",
    ]);
    expect(vector.layers[0]).toMatchObject({
      geometry: "area",
      label: { field: "name", minzoom: 6 },
    });
    expect(vector.layers[1]).toMatchObject({ geometry: "line", minzoom: 8 });
  });
});

describe("toMapHeatmap", () => {
  it("draws each point with its weight, using the layer's controls and palette", () => {
    const heatmap = toMapHeatmap(
      SAMPLE_HEATMAP_LAYER,
      [samplePoint("a", { weight: 3 }), samplePoint("b", { weight: null })],
      { radius: "32", intensity: "2", opacity: "0.5" },
    );
    expect(heatmap).toEqual({
      source: {
        kind: "points",
        points: [
          { position: { lat: -33.9, lng: 18.4 }, weight: 3 },
          { position: { lat: -33.9, lng: 18.4 }, weight: 1 },
        ],
      },
      style: {
        radius: 32,
        intensity: 2,
        opacity: 0.5,
        ramp: [
          tokenValues.dataPalette["ordinal-1"],
          tokenValues.dataPalette["ordinal-3"],
          tokenValues.dataPalette["ordinal-5"],
        ],
      },
    });
  });

  it("skips features that are not points", () => {
    const heatmap = toMapHeatmap(
      SAMPLE_HEATMAP_LAYER,
      [sampleArea("p"), samplePoint("a")],
      {},
    );
    expect(
      heatmap.source.kind === "points" && heatmap.source.points,
    ).toHaveLength(1);
  });
});

describe("toVectorHeatmaps", () => {
  it("makes a heatmap of each vector source layer that has one", () => {
    const heatmaps = toVectorHeatmaps(SAMPLE_VECTOR_LAYER, {}, 0);
    expect(heatmaps).toHaveLength(1);
    expect(heatmaps[0]).toMatchObject({
      source: {
        kind: "vector",
        sourceLayer: "events",
        weightField: "size",
        source: { maxzoom: 14 },
      },
      style: { radius: 16, intensity: 1, opacity: 0.8 },
    });
  });
});

describe("toStyledShapes", () => {
  const formatters = createFormatterRegistry();

  it("gives each polygon its look from the style, as hex colours", () => {
    const shapes = toStyledShapes(
      SAMPLE_AREA_LAYER,
      [sampleArea("a", { title: "Paris", density: 250 })],
      formatters,
      0,
    );
    expect(shapes.geometry).toBe("area");
    expect(shapes.labelMinZoom).toBe(3);
    expect(shapes.shapes).toEqual([
      {
        id: "a",
        geometry: expect.objectContaining({ type: "Polygon" }),
        look: {
          colour: tokenValues.dataPalette["ordinal-5"],
          fillOpacity: 0.6,
          pattern: "crosshatch",
          dash: "solid",
          width: 1.5,
        },
        label: "Paris",
      },
    ]);
  });

  it("draws only the geometry the style names", () => {
    const shapes = toStyledShapes(
      SAMPLE_LINE_LAYER,
      [sampleLine("l", { kind: "main" }), sampleArea("a", { kind: "main" })],
      formatters,
      0,
    );
    expect(shapes.geometry).toBe("line");
    expect(shapes.shapes.map((shape) => shape.id)).toEqual(["l"]);
    expect(shapes.shapes[0]?.look).toMatchObject({
      colour: tokenValues.dataPalette.vermillion,
      width: 5,
      dash: "solid",
    });
    expect(shapes.shapes[0]?.label).toBeUndefined();
  });

  it("leaves the label out when its fields are all missing", () => {
    const [shape] = toStyledShapes(
      SAMPLE_AREA_LAYER,
      [sampleArea("a", { title: null, density: 1 })],
      formatters,
      0,
    ).shapes;
    expect(shape?.label).toBeUndefined();
  });
});
