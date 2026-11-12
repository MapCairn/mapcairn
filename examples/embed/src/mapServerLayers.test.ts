// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFormatterRegistry,
  type FeedLayerDefinition,
  isFeedLayer,
  type LayerDefinition,
  legendFor,
  type PointStyle,
  partitionDefinitions,
  type ShapeStyle,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
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
            id: "by-number-1",
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

const HUTS = sampleLayer("Huts_2024");
const SNOW = sampleLayer("snow_cover");

/** Where a layer's server metadata is wrong in a way TypeScript would have caught. */
function malformed(layer: ServerLayer, change: object): ServerLayer {
  return { ...layer, ...change } as unknown as ServerLayer;
}

function fieldsOf(layer: ServerLayer): Readonly<Record<string, string>> {
  return feedDefinitionOf(layer).source.fields;
}

describe("mapServerLayers with metadata a server got wrong", () => {
  it.each([
    ["no credit", malformed(HUTS, { credit: undefined })],
    ["no field list", malformed(HUTS, { fields: undefined })],
    ["a number for an id", malformed(HUTS, { id: 7 })],
    [
      "a number for a field label",
      malformed(HUTS, {
        fields: [
          { name: "OBJECTID", label: "Record", type: "oid" },
          { name: "hut_name", label: "Name", type: "string" },
          { name: "elevation_m", label: 7, type: "integer" },
        ],
      }),
    ],
    ["no service", malformed(HUTS, { service: undefined })],
    ["nothing at all", null as unknown as ServerLayer],
  ])(
    "skips only the layer with %s, and keeps the layers around it",
    (_name, bad) => {
      const { layers, skipped } = partitionDefinitions(
        mapServerLayers({ layers: [bad, sampleLayer("glens_rainfall")] }),
        OPTIONS,
      );

      expect(layers.map((layer) => layer.id)).toEqual(["glens-rainfall"]);
      expect(skipped).toEqual([
        { problems: ["definition: must be an object"] },
      ]);
    },
  );
});

describe("mapServerLayers and the classes of equal intervals", () => {
  function withClasses(classes: number): ServerLayer {
    return {
      ...POLYGONS_BY_BREAKS,
      renderer: {
        type: "equalInterval",
        field: "rain_mm",
        min: 0,
        max: 2000,
        classes,
      },
    };
  }

  it.each([2, 5])("maps %s classes", (classes) => {
    const style = feedDefinitionOf(withClasses(classes)).style as ShapeStyle;

    expect(style.colour).toMatchObject({
      kind: "intervals",
      ramp: [
        "ordinal-1",
        "ordinal-2",
        "ordinal-3",
        "ordinal-4",
        "ordinal-5",
      ].slice(0, classes),
    });
  });

  it.each([6, 1e9, 2 ** 32, Number.POSITIVE_INFINITY])(
    "skips %s classes, which the palette has no colour for, without counting them",
    (classes) => {
      expect(skippedProblems(withClasses(classes))).toEqual([
        "style.colour.ramp[5]: must name a palette colour",
      ]);
    },
  );

  it.each([1, 0, -3, Number.NaN])(
    "skips %s classes, because equal intervals need at least two",
    (classes) => {
      expect(skippedProblems(withClasses(classes))).toEqual([
        "style.colour.ramp: must have 2 to 7 classes",
      ]);
    },
  );
});

describe("mapServerLayers and the names a server uses", () => {
  const OID = { name: "OBJECTID", label: "Record", type: "oid" } as const;
  const NAME = { name: "name", label: "Name", type: "string" } as const;

  it("keeps a field called title apart from the feature's title, in the field map, the card, the sorts and the style", () => {
    const layer: ServerLayer = {
      ...HUTS,
      fields: [OID, NAME, { name: "title", label: "Rank", type: "integer" }],
      renderer: {
        type: "classBreaks",
        field: "title",
        breaks: [
          { min: 0, label: "Low" },
          { min: 5, label: "High" },
        ],
      },
      visibleValues: { field: "title", values: [1, 2] },
    };

    const definition = feedDefinitionOf(layer);

    expect(definition.source.fields).toEqual({
      id: "properties.OBJECTID",
      title: "properties.name",
      "title-field": "properties.title",
    });
    expect(definition.source.filter).toEqual({
      field: "title-field",
      in: [1, 2],
    });
    expect(definition.card.lines).toEqual(["Rank: {title-field|number}"]);
    expect(definition.list.sorts.map((sort) => sort.field)).toEqual([
      "title",
      "title-field",
    ]);
    expect((definition.style as PointStyle).colour).toMatchObject({
      field: "title-field",
    });
  });

  it("keeps a text field called id apart from the feature's id", () => {
    const layer: ServerLayer = {
      ...HUTS,
      fields: [OID, NAME, { name: "id", label: "Reference", type: "string" }],
      renderer: { type: "simple", label: "Hut" },
      visibleValues: { field: "id", values: ["a"] },
    };

    const definition = feedDefinitionOf(layer);

    expect(definition.source.fields).toEqual({
      id: "properties.OBJECTID",
      title: "properties.name",
      "id-field": "properties.id",
    });
    expect(definition.source.filter).toEqual({ field: "id-field", in: ["a"] });
  });

  it("colours by the first text field through the name the feature's title has", () => {
    const layer: ServerLayer = {
      ...HUTS,
      renderer: {
        type: "uniqueValue",
        field: "hut_name",
        values: [{ value: "Corrour bothy", label: "Corrour" }],
        otherLabel: "Another",
      },
    };

    expect((feedDefinitionOf(layer).style as PointStyle).colour).toMatchObject({
      kind: "category",
      field: "title",
    });
  });

  it("leaves out a field whose name a template cannot read", () => {
    const layer: ServerLayer = {
      ...HUTS,
      fields: [
        ...HUTS.fields,
        { name: "rain mm", label: "Rain", type: "integer" },
      ],
    };

    expect(Object.keys(fieldsOf(layer))).not.toContain("rain mm");
    expect(feedDefinitionOf(layer).card.lines.join(" ")).not.toMatch(/Rain/);
  });

  it("gives sorts of fields whose names turn into the same text their own ids", () => {
    const layer: ServerLayer = {
      ...POLYGONS_BY_BREAKS,
      fields: [
        ...POLYGONS_BY_BREAKS.fields,
        { name: "rain-mm", label: "Rain, other gauge", type: "double" },
      ],
    };

    expect(feedDefinitionOf(layer).list.sorts.map((sort) => sort.id)).toEqual([
      "name",
      "by-number-1",
      "by-number-2",
    ]);
  });

  it("skips a layer with no object id, and says the id is missing", () => {
    const layer: ServerLayer = {
      ...HUTS,
      fields: HUTS.fields.filter((field) => field.type !== "oid"),
    };

    expect(skippedProblems(layer)).toEqual(["source.fields.id: is required"]);
  });

  it("shows the feature's title on the second line of the list when there is no other field", () => {
    const { visibleValues: _filter, ...unfiltered } = HUTS;
    const layer: ServerLayer = {
      ...unfiltered,
      fields: [OID, NAME],
      renderer: { type: "simple", label: "Hut" },
    };

    const definition = feedDefinitionOf(layer);

    expect(definition.card.lines).toEqual([]);
    expect(definition.list.secondary).toBe("{title}");
    expect(definition.list.sorts.map((sort) => sort.field)).toEqual(["title"]);
  });
});

describe("mapServerLayers and the rest of a layer", () => {
  it("colours every feature alike for a simple renderer, as a marker and as an area", () => {
    const point = feedDefinitionOf({
      ...HUTS,
      renderer: { type: "simple", label: "Hut" },
    });
    const area = feedDefinitionOf({
      ...POLYGONS_BY_BREAKS,
      renderer: { type: "simple", label: "Glen" },
    });

    expect(point.style).toEqual({
      colour: { kind: "fixed", colour: "orange", label: "Hut" },
    });
    expect(area.style).toEqual({
      kind: "shapes",
      geometry: "area",
      colour: { kind: "fixed", colour: "orange", label: "Glen" },
    });
  });

  it("maps six values and the class for every other value, the most the categorical colours allow", () => {
    const values = ["a", "b", "c", "d", "e", "f"].map((value) => ({
      value,
      label: value.toUpperCase(),
    }));
    const layer: ServerLayer = {
      ...HUTS,
      renderer: {
        type: "uniqueValue",
        field: "status",
        values,
        otherLabel: "?",
      },
    };

    expect((feedDefinitionOf(layer).style as PointStyle).colour).toMatchObject({
      other: { colour: "reddish-purple" },
    });
  });

  it("skips seven values, which leave no categorical colour for the other class", () => {
    const values = ["a", "b", "c", "d", "e", "f", "g"].map((value) => ({
      value,
      label: value.toUpperCase(),
    }));
    const layer: ServerLayer = {
      ...HUTS,
      renderer: {
        type: "uniqueValue",
        field: "status",
        values,
        otherLabel: "?",
      },
    };

    expect(skippedProblems(layer)).toEqual([
      "style.colour.other: must have a label and a categorical colour",
    ]);
  });

  it("maps a tile legend of five entries and skips one of six", () => {
    const withLegend = (count: number): ServerLayer =>
      malformed(SNOW, {
        service: {
          ...SNOW.service,
          legend: Array.from({ length: count }, (_, index) => ({
            label: `Class ${index + 1}`,
          })),
        },
      });

    expect(definitionOf(withLegend(5))).toMatchObject({
      legend: [
        { label: "Class 1", colour: "ordinal-1" },
        { label: "Class 2", colour: "ordinal-2" },
        { label: "Class 3", colour: "ordinal-3" },
        { label: "Class 4", colour: "ordinal-4" },
        { label: "Class 5", colour: "ordinal-5" },
      ],
    });
    expect(skippedProblems(withLegend(6))).toEqual([
      "legend[5].colour: must name a palette colour",
    ]);
  });

  it("credits a feed with no link without one, and sets no filter when the server names none", () => {
    const { attribution, source } = feedDefinitionOf({
      ...POLYGONS_BY_BREAKS,
      credit: { text: "Example weather service" },
    });

    expect(attribution).toEqual([{ text: "Example weather service" }]);
    expect(source).not.toHaveProperty("filter");
  });

  it("skips a layer whose id does not start with a letter once it is made lowercase and hyphenated", () => {
    expect(skippedProblems({ ...HUTS, id: "2024_huts" })).toEqual([
      "id: must be lowercase letters, digits and hyphens, starting with a letter",
    ]);
  });

  it("keeps the first of two layers whose ids become the same, and skips the other as a duplicate", () => {
    const { layers, skipped } = partitionDefinitions(
      mapServerLayers({
        layers: [HUTS, { ...POLYGONS_BY_BREAKS, id: "huts-2024" }],
      }),
      OPTIONS,
    );

    expect(layers.map((layer) => layer.name)).toEqual(["Mountain huts"]);
    expect(skipped).toEqual([{ id: "huts-2024", problems: ["id: duplicate"] }]);
  });
});
