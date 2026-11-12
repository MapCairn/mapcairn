// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type CatalogueState,
  createDecoderRegistry,
  createFormatterRegistry,
  type FeedLayerDefinition,
  isFeedLayer,
  type LayerDefinition,
  legendFor,
  type PointStyle,
  partitionDefinitions,
  type ShapeStyle,
  type SkippedDefinition,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { createExampleCatalogue } from "./exampleServices";
import { mapServerLayers } from "./mapServerLayers";
import { SAMPLE_SERVER_LAYERS } from "./sampleServerLayers";
import type { ServerLayer } from "./serverMetadata";

const OPTIONS = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

function sampleLayer(id: string): ServerLayer {
  const layer = SAMPLE_SERVER_LAYERS.layers.find((item) => item.id === id);
  if (layer === undefined) {
    throw new Error(`No sample layer ${id}`);
  }
  return layer;
}

/** What the catalogue makes of one server layer: the definition or why it was skipped. */
function partition(layer: ServerLayer) {
  return partitionDefinitions(mapServerLayers({ layers: [layer] }), OPTIONS);
}

function definitionOf(layer: ServerLayer): LayerDefinition {
  const { layers, skipped } = partition(layer);
  expect(skipped).toEqual([]);
  const [definition] = layers;
  if (definition === undefined) {
    throw new Error("The layer was skipped");
  }
  return definition;
}

function skippedProblems(layer: ServerLayer): readonly string[] {
  const { layers, skipped } = partition(layer);
  expect(layers).toEqual([]);
  return skipped.flatMap((item) => item.problems);
}

function feedDefinitionOf(layer: ServerLayer): FeedLayerDefinition {
  const definition = definitionOf(layer);
  if (!isFeedLayer(definition)) {
    throw new Error("Not a feed layer");
  }
  return definition;
}

const POLYGONS_BY_BREAKS = sampleLayer("glens_rainfall");

describe("mapServerLayers", () => {
  it("maps points coloured by value into a feed with a category style, a card and a filter", () => {
    const expected: FeedLayerDefinition<PointStyle> = {
      id: "huts-2024",
      name: "Mountain huts",
      description: "Huts a walker can shelter in, and whether each is open.",
      group: "Sample server",
      dataCost: "about 2 KB",
      attribution: [
        { text: "Example hut register", url: "https://example.org/" },
      ],
      controls: [],
      source: {
        kind: "feed",
        url: "https://example.org/server/huts/query?f=geojson",
        decoder: "geojson",
        fields: {
          id: "properties.OBJECTID",
          title: "properties.hut_name",
          status: "properties.status",
          elevation_m: "properties.elevation_m",
          last_checked: "properties.last_checked",
        },
        filter: { field: "status", in: ["open", "locked"] },
      },
      style: {
        colour: {
          kind: "category",
          field: "status",
          categories: [
            { value: "open", label: "Open", colour: "orange" },
            { value: "locked", label: "Locked", colour: "sky-blue" },
          ],
          other: { label: "Unknown", colour: "bluish-green" },
        },
      },
      card: {
        title: "{title}",
        lines: [
          "Status: {status}",
          "Elevation (m): {elevation_m|number}",
          "Last checked: {last_checked|date}",
        ],
      },
      list: {
        secondary: "Status: {status}",
        sorts: [
          { id: "name", label: "Name", field: "title", direction: "asc" },
          {
            id: "by-elevation-m",
            label: "Elevation (m)",
            field: "elevation_m",
            direction: "desc",
          },
        ],
      },
      emptyText: "No features to show.",
    };

    expect(definitionOf(sampleLayer("Huts_2024"))).toEqual(expected);
  });

  it("leaves out a field of a type a card cannot show", () => {
    const { source, card } = feedDefinitionOf(sampleLayer("Huts_2024"));

    expect(Object.keys(source.fields)).not.toContain("photo");
    expect(card.lines.join(" ")).not.toMatch(/Photo/);
  });

  it("maps class breaks into steps on ordinal colours, with a legend that carries the server's labels", () => {
    const definition = feedDefinitionOf(POLYGONS_BY_BREAKS);
    const style = definition.style as ShapeStyle;

    expect(style.geometry).toBe("area");
    expect(style.colour).toEqual({
      kind: "steps",
      field: "rain_mm",
      steps: [
        { min: 0, label: "Under 1,000 mm", colour: "ordinal-1" },
        { min: 1000, label: "1,000 to 1,499 mm", colour: "ordinal-2" },
        { min: 1500, label: "1,500 mm and over", colour: "ordinal-3" },
      ],
    });
    expect(legendFor(definition).entries.map((entry) => entry.label)).toEqual([
      "Under 1,000 mm",
      "1,000 to 1,499 mm",
      "1,500 mm and over",
    ]);
  });

  it("names the classified field on a polygon's label, so colour is not its only signal", () => {
    const { style } = feedDefinitionOf(POLYGONS_BY_BREAKS);

    expect((style as ShapeStyle).label?.template).toBe(
      "{title}: {rain_mm|number}",
    );
  });

  it("maps equal intervals on polygons into an intervals style", () => {
    const layer: ServerLayer = {
      ...POLYGONS_BY_BREAKS,
      renderer: {
        type: "equalInterval",
        field: "rain_mm",
        min: 500,
        max: 2000,
        classes: 3,
        unit: " mm",
      },
    };

    const definition = feedDefinitionOf(layer);

    expect((definition.style as ShapeStyle).colour).toEqual({
      kind: "intervals",
      field: "rain_mm",
      min: 500,
      max: 2000,
      ramp: ["ordinal-1", "ordinal-2", "ordinal-3"],
      unit: " mm",
    });
    expect(legendFor(definition).entries).toHaveLength(3);
  });

  it("draws a polyline as a line style", () => {
    const layer: ServerLayer = {
      ...POLYGONS_BY_BREAKS,
      geometryType: "polyline",
    };

    expect((feedDefinitionOf(layer).style as ShapeStyle).geometry).toBe("line");
  });

  it("maps a tile service into a raster layer whose legend is the server's, on ordinal colours", () => {
    const definition = definitionOf(sampleLayer("snow_cover"));

    expect(definition).toEqual({
      id: "snow-cover",
      name: "Snow cover",
      description: "How much of each tile is under snow.",
      group: "Sample server",
      dataCost: "about 40 KB a view",
      attribution: [{ text: "Example weather service" }],
      controls: [],
      source: {
        kind: "tiles",
        tiles: "https://example.org/server/snow/{z}/{x}/{y}.png",
        tileSize: 256,
        maxzoom: 10,
      },
      legend: [
        { label: "Patchy", colour: "ordinal-1" },
        { label: "Mostly covered", colour: "ordinal-2" },
        { label: "Deep", colour: "ordinal-3" },
      ],
    });
  });

  it("takes out the braces a server puts in a label, so they cannot become a placeholder", () => {
    const layer: ServerLayer = {
      ...POLYGONS_BY_BREAKS,
      fields: POLYGONS_BY_BREAKS.fields.map((field) =>
        field.name === "rain_mm" ? { ...field, label: "Rain {mm}" } : field,
      ),
    };

    expect(feedDefinitionOf(layer).card.lines).toEqual([
      "Rain mm: {rain_mm|number}",
    ]);
  });

  it("skips a layer with no text field to title a feature, naming the paths that are wrong", () => {
    expect(skippedProblems(sampleLayer("survey-notes"))).toEqual([
      "source.fields.title: is required",
      "card.title: {title} is not a field",
    ]);
  });

  it("skips a layer whose geometry it has no style for, and says the style is missing", () => {
    const layer = {
      ...POLYGONS_BY_BREAKS,
      geometryType: "multipatch",
    } as unknown as ServerLayer;

    expect(skippedProblems(layer)).toEqual(["style: must be an object"]);
  });

  it("skips a layer with more classes than the palette has ordinal colours", () => {
    const layer: ServerLayer = {
      ...POLYGONS_BY_BREAKS,
      renderer: {
        type: "classBreaks",
        field: "rain_mm",
        breaks: [0, 1, 2, 3, 4, 5].map((min) => ({ min, label: `${min}+` })),
      },
    };

    expect(skippedProblems(layer)).toEqual([
      "style.colour.steps[5].colour: must name a palette colour",
    ]);
  });

  it("skips equal intervals on points, which the SDK's point styles do not take", () => {
    const layer: ServerLayer = {
      ...sampleLayer("survey-notes"),
      fields: [
        { name: "OBJECTID", label: "Record", type: "oid" },
        { name: "site", label: "Site", type: "string" },
        { name: "visitors", label: "Visitors", type: "integer" },
      ],
      renderer: {
        type: "equalInterval",
        field: "visitors",
        min: 0,
        max: 100,
        classes: 4,
      },
    };

    expect(skippedProblems(layer)).toEqual([
      "style.colour.kind: must be fixed, steps or category",
    ]);
  });

  it("gives every mapped layer the id the SDK accepts, whatever form the server used", () => {
    const ids = mapServerLayers(SAMPLE_SERVER_LAYERS).map(
      (candidate) => (candidate as { id: string }).id,
    );

    expect(ids).toEqual([
      "huts-2024",
      "glens-rainfall",
      "snow-cover",
      "survey-notes",
    ]);
  });
});

describe("the catalogue that loads the mapped sample", () => {
  async function readyState(): Promise<
    Extract<CatalogueState, { status: "ready" }>
  > {
    const onSkipped = vi.fn<(skipped: readonly SkippedDefinition[]) => void>();
    const catalogue = createExampleCatalogue(onSkipped);
    await catalogue.refresh();
    const state = catalogue.getState();
    if (state.status !== "ready") {
      throw new Error(`The catalogue is ${state.status}`);
    }
    return state;
  }

  it("offers the example's own layer and the three layers it could map", async () => {
    const state = await readyState();

    expect(state.layers.map((layer) => layer.id)).toEqual([
      "example-cairns",
      "huts-2024",
      "glens-rainfall",
      "snow-cover",
    ]);
  });

  it("reports the layer it could not map as skipped, with the reason", async () => {
    const state = await readyState();

    expect(state.skipped).toEqual([
      {
        id: "survey-notes",
        problems: [
          "source.fields.title: is required",
          "card.title: {title} is not a field",
        ],
      },
    ]);
  });
});
