// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapStyledShapes } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import {
  basemapFont,
  type DataLayer,
  dataLayerEngineIds,
  planDataLayer,
  tileTemplateOf,
} from "./dataLayerPlan";

const LOOK = {
  colour: "#0072b2",
  fillOpacity: 0.5,
  pattern: "solid",
  dash: "solid",
  width: 1,
} as const;

const LINES: MapStyledShapes = {
  geometry: "line",
  shapes: [
    {
      id: "main",
      geometry: {
        type: "LineString",
        coordinates: [
          [2, 48],
          [3, 49],
        ],
      },
      look: LOOK,
      label: "Main",
    },
  ],
};

const mapWith = (style: unknown) =>
  ({ getStyle: () => style }) as unknown as MapLibreMap;

describe("dataLayerEngineIds", () => {
  it("starts every id with the mapcairn prefix so none meets a basemap id", () => {
    expect(
      Object.values(dataLayerEngineIds("a")).every((id) =>
        id.startsWith("mapcairn:a"),
      ),
    ).toBe(true);
  });
});

describe("planDataLayer", () => {
  it("never asks for the label font of a kind that draws no labels", () => {
    const labelFont = vi.fn(() => ["Font"]);
    const layers: DataLayer[] = [
      { kind: "features", features: [] },
      {
        kind: "tiles",
        overlay: { tiles: "t/{z}", tileSize: 256, maxzoom: 5, opacity: 1 },
      },
      { kind: "shapes", shapes: { colour: "#000", geometries: [] } },
    ];
    for (const layer of layers) {
      planDataLayer("a", layer, labelFont);
    }
    expect(labelFont).not.toHaveBeenCalled();
  });

  it("adds a label layer only when there is a font", () => {
    const layer: DataLayer = { kind: "styled", layer: LINES };
    const labelled = planDataLayer("a", layer, () => ["Font"]);
    const plain = planDataLayer("a", layer, () => undefined);
    expect(labelled.layers).toHaveLength(plain.layers.length + 1);
    expect(labelled.layers.at(-1)?.id).toBe("mapcairn:a:styled-label");
  });

  it("lists the engine layers a tap can land on", () => {
    const plan = planDataLayer(
      "a",
      { kind: "styled", layer: LINES },
      () => undefined,
    );
    expect(plan.lines?.length).toBeGreaterThan(0);
    expect(plan.polygons).toEqual([]);
  });
});

describe("tileTemplateOf", () => {
  const VECTOR = {
    tiles: "https://v.test/{z}/{x}/{y}.pbf",
    minzoom: 0,
    maxzoom: 9,
  };
  const HEAT_STYLE = {
    radius: 20,
    intensity: 1,
    opacity: 0.8,
    ramp: ["#fee8c8", "#e34a33"],
  };
  const plan = (layer: DataLayer) => planDataLayer("a", layer, () => undefined);

  it("finds the template of every kind of layer that requests tiles", () => {
    expect(
      tileTemplateOf(
        plan({
          kind: "tiles",
          overlay: {
            tiles: "https://t.test/{z}/{x}/{y}.png",
            tileSize: 256,
            maxzoom: 5,
            opacity: 1,
          },
        }).source,
      ),
    ).toBe("https://t.test/{z}/{x}/{y}.png");
    expect(
      tileTemplateOf(
        plan({
          kind: "vector",
          tiles: {
            source: VECTOR,
            layers: [
              {
                sourceLayer: "area",
                geometry: "area",
                rule: { kind: "fixed", look: LOOK },
              },
            ],
          },
        }).source,
      ),
    ).toBe(VECTOR.tiles);
    expect(
      tileTemplateOf(
        plan({
          kind: "heatmap",
          heatmap: {
            source: { kind: "vector", source: VECTOR, sourceLayer: "points" },
            style: HEAT_STYLE,
          },
        }).source,
      ),
    ).toBe(VECTOR.tiles);
  });

  it("finds none for a layer that holds its own data", () => {
    const layers: DataLayer[] = [
      { kind: "features", features: [] },
      { kind: "shapes", shapes: { colour: "#000", geometries: [] } },
      { kind: "styled", layer: LINES },
      {
        kind: "heatmap",
        heatmap: { source: { kind: "points", points: [] }, style: HEAT_STYLE },
      },
    ];
    for (const layer of layers) {
      expect(tileTemplateOf(plan(layer).source)).toBeUndefined();
    }
  });
});

describe("basemapFont", () => {
  const symbol = (font: unknown) => ({
    type: "symbol",
    layout: { "text-font": font },
  });

  it("is undefined without a glyph server", () => {
    expect(
      basemapFont(mapWith({ layers: [symbol(["Noto"])] })),
    ).toBeUndefined();
  });

  it("takes the first literal stack, unwrapping a literal expression", () => {
    const style = {
      glyphs: "g/{fontstack}",
      layers: [
        symbol(["get", "font"]),
        symbol(["literal", ["Noto Sans"]]),
        symbol(["Other"]),
      ],
    };
    expect(basemapFont(mapWith(style))).toEqual(["Noto Sans"]);
  });

  it("is undefined when no symbol layer names a stack", () => {
    const style = { glyphs: "g/{fontstack}", layers: [{ type: "line" }] };
    expect(basemapFont(mapWith(style))).toBeUndefined();
  });
});
