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
