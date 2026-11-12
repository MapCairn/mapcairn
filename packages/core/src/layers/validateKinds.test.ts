// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { validateLayerDefinition } from "./validate";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

type Json = Record<string, unknown>;

function copy<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function check(base: unknown, change: (definition: Json) => void): string[] {
  const definition = copy(base);
  change(definition);
  return validateLayerDefinition(definition, options);
}

function reports(lines: string[], prefix: string): boolean {
  return lines.some((line) => line.startsWith(prefix));
}

describe("range controls", () => {
  const range = (change: (control: Json) => void) =>
    check(SAMPLE_HEATMAP_LAYER, (d) => {
      change((d.controls as Json[])[0] as Json);
    });

  it("accepts the sample", () => {
    expect(validateLayerDefinition(SAMPLE_HEATMAP_LAYER, options)).toEqual([]);
  });

  it.each([
    ["min not below max", (c: Json) => (c.max = 1), "controls[0]"],
    ["a zero step", (c: Json) => (c.step = 0), "controls[0].step"],
    [
      "a default out of range",
      (c: Json) => (c.default = 500),
      "controls[0].default",
    ],
    [
      "a bound that is not a number",
      (c: Json) => (c.min = "low"),
      "controls[0].min",
    ],
    ["a unit that is not text", (c: Json) => (c.unit = 3), "controls[0].unit"],
  ])("rejects %s", (_name, change, prefix) => {
    expect(reports(range(change), prefix)).toBe(true);
  });
});

describe("query sources", () => {
  const query = (change: (source: Json) => void) =>
    check(SAMPLE_QUERY_LAYER, (d) => change(d.source as Json));

  it("accepts the sample", () => {
    expect(validateLayerDefinition(SAMPLE_QUERY_LAYER, options)).toEqual([]);
  });

  it.each([
    [
      "a missing box edge",
      (s: Json) => (s.url = "https://q.test/?w={west}&s={south}&e={east}"),
      "source.url: a query URL must use {north}",
    ],
    [
      "an unknown variable",
      (s: Json) => (s.url = "https://q.test/{west}{south}{east}{north}{what}"),
      "source.url: {what}",
    ],
    ["a cap of zero", (s: Json) => (s.maxFeatures = 0), "source.maxFeatures:"],
    [
      "a cap above 5000",
      (s: Json) => (s.maxFeatures = 5001),
      "source.maxFeatures:",
    ],
    [
      "a fractional cap",
      (s: Json) => (s.maxFeatures = 2.5),
      "source.maxFeatures:",
    ],
    ["a zoom out of range", (s: Json) => (s.minzoom = 30), "source.minzoom:"],
    [
      "an unregistered decoder",
      (s: Json) => (s.decoder = "csv"),
      "source.decoder:",
    ],
    [
      "no id field",
      (s: Json) => (s.fields = { title: "t" }),
      "source.fields.id:",
    ],
    [
      "a filter on no field",
      (s: Json) => (s.filter = { field: "x", in: [1] }),
      "source.filter:",
    ],
  ])("rejects %s", (_name, change, prefix) => {
    expect(reports(query(change), prefix)).toBe(true);
  });

  it("accepts a filter, and still checks the card against the fields", () => {
    expect(
      query((s) => {
        s.filter = { field: "value", in: [1, 2] };
      }),
    ).toEqual([]);
    expect(
      reports(
        check(SAMPLE_QUERY_LAYER, (d) => {
          (d.card as Json).title = "{nothing}";
        }),
        "card.title:",
      ),
    ).toBe(true);
  });

  it("does not let a plain feed use the box", () => {
    const lines = check(SAMPLE_HEATMAP_LAYER, (d) => {
      (d.source as Json).url = "https://heat.test/{west}";
    });
    expect(reports(lines, "source.url: {west}")).toBe(true);
  });

  it("rejects an unknown source kind", () => {
    expect(
      reports(
        check(SAMPLE_QUERY_LAYER, (d) => {
          (d.source as Json).kind = "stream";
        }),
        "source.kind:",
      ),
    ).toBe(true);
  });
});

describe("heatmap layers", () => {
  const heat = (change: (heatmap: Json, definition: Json) => void) =>
    check(SAMPLE_HEATMAP_LAYER, (d) => change(d.heatmap as Json, d));

  it.each([
    [
      "a weight field that does not exist",
      (h: Json) => (h.weightField = "nope"),
      "heatmap.weightField:",
    ],
    ["a radius out of range", (h: Json) => (h.radius = 500), "heatmap.radius:"],
    [
      "an intensity out of range",
      (h: Json) => (h.intensity = 0),
      "heatmap.intensity:",
    ],
    [
      "a radius that names no control",
      (h: Json) => (h.radius = { control: "missing" }),
      "heatmap.radius:",
    ],
    [
      "a radius control that is not a range",
      (h: Json) => (h.radius = { control: "opacity" }),
      "heatmap.radius:",
    ],
    [
      "a radius control with bounds outside the allowed radius",
      (_h: Json, d: Json) => {
        ((d.controls as Json[])[0] as Json).max = 500;
      },
      "heatmap.radius:",
    ],
    [
      "a ramp that is too short",
      (h: Json) => {
        h.ramp = ["ordinal-1", "ordinal-2"];
        h.words = ["a", "b"];
      },
      "heatmap.ramp:",
    ],
    [
      "a ramp that is too long",
      (h: Json) => {
        h.ramp = [
          "ordinal-1",
          "ordinal-2",
          "ordinal-3",
          "ordinal-4",
          "ordinal-5",
          "ordinal-1",
        ];
        h.words = ["a", "b", "c", "d", "e", "f"];
      },
      "heatmap.ramp:",
    ],
    [
      "a categorical colour in the ramp",
      (h: Json) => ((h.ramp as string[])[0] = "orange"),
      "heatmap.ramp[0]:",
    ],
    [
      "words that do not match the ramp",
      (h: Json) => (h.words = ["Few"]),
      "heatmap.words:",
    ],
    [
      "an empty word",
      (h: Json) => ((h.words as string[])[1] = ""),
      "heatmap.words[1]:",
    ],
    ["no empty text", (_h: Json, d: Json) => delete d.emptyText, "emptyText:"],
  ])("rejects %s", (_name, change, prefix) => {
    expect(reports(heat(change), prefix)).toBe(true);
  });

  it("accepts fixed numbers and control references", () => {
    expect(
      heat((h) => {
        h.radius = 12;
        h.intensity = 2;
      }),
    ).toEqual([]);
  });

  it("works from a query source too", () => {
    expect(
      check(SAMPLE_HEATMAP_LAYER, (d) => {
        d.source = copy(SAMPLE_QUERY_LAYER.source);
        (d.heatmap as Json).weightField = "value";
      }),
    ).toEqual([]);
  });

  it("rejects a tile source", () => {
    expect(
      reports(
        check(SAMPLE_HEATMAP_LAYER, (d) => {
          d.source = {
            kind: "tiles",
            tiles: "https://t.test/{z}/{x}/{y}.png",
            tileSize: 256,
            maxzoom: 5,
          };
        }),
        "source.kind:",
      ),
    ).toBe(true);
  });
});

describe("vector tile layers", () => {
  const vector = (change: (definition: Json) => void) =>
    check(SAMPLE_VECTOR_LAYER, change);
  const layer = (d: Json, index: number) =>
    (d.sourceLayers as Json[])[index] as Json;

  it("accepts the sample", () => {
    expect(validateLayerDefinition(SAMPLE_VECTOR_LAYER, options)).toEqual([]);
  });

  it.each([
    [
      "a tile URL with a variable that has no control",
      (d: Json) =>
        ((d.source as Json).tiles = "https://v.test/{z}/{x}/{y}/{what}.pbf"),
      "source.tiles:",
    ],
    [
      "a tile URL that is not https",
      (d: Json) => ((d.source as Json).tiles = "http://v.test/{z}/{x}/{y}.pbf"),
      "source.tiles:",
    ],
    [
      "a deepest level out of range",
      (d: Json) => ((d.source as Json).maxzoom = 40),
      "source.maxzoom:",
    ],
    [
      "a shallowest level below zero",
      (d: Json) => ((d.source as Json).minzoom = -1),
      "source.minzoom:",
    ],
    [
      "a shallowest level past the deepest",
      (d: Json) => ((d.source as Json).minzoom = 20),
      "source.minzoom:",
    ],
    [
      "a window that runs backwards",
      (d: Json) => {
        d.minzoom = 12;
        d.maxzoom = 4;
      },
      "minzoom:",
    ],
    ["a window out of range", (d: Json) => (d.maxzoom = 30), "maxzoom:"],
    ["no source layers", (d: Json) => (d.sourceLayers = []), "sourceLayers:"],
    [
      "a source layer with no name",
      (d: Json) => (layer(d, 0).sourceLayer = ""),
      "sourceLayers[0].sourceLayer:",
    ],
    [
      "a source layer with a bad window",
      (d: Json) => (layer(d, 1).minzoom = 99),
      "sourceLayers[1].minzoom:",
    ],
    [
      "a source layer with neither style nor heatmap",
      (d: Json) => delete layer(d, 0).style,
      "sourceLayers[0]:",
    ],
    [
      "a source layer with both",
      (d: Json) => (layer(d, 0).heatmap = copy(SAMPLE_HEATMAP_LAYER.heatmap)),
      "sourceLayers[0]:",
    ],
    [
      "a label that is not one plain property",
      (d: Json) =>
        (((layer(d, 0).style as Json).label as Json).template =
          "{name} {name|number}"),
      "sourceLayers[0].style.label.template:",
    ],
    [
      "a colour on an area that is the only signal",
      (d: Json) => {
        const style = layer(d, 0).style as Json;
        delete style.label;
        for (const category of (style.colour as Json).categories as Json[]) {
          delete category.pattern;
        }
      },
      "sourceLayers[0].style.colour:",
    ],
    [
      "a property name that is not an identifier",
      (d: Json) =>
        (((layer(d, 0).style as Json).colour as Json).field = "has space"),
      "sourceLayers[0].style.colour.field:",
    ],
    [
      "a heatmap with a radius control but no such control",
      (d: Json) => ((layer(d, 2).heatmap as Json).radius = { control: "r" }),
      "sourceLayers[2].heatmap.radius:",
    ],
    [
      "a heatmap weight property that is not an identifier",
      (d: Json) => ((layer(d, 2).heatmap as Json).weightField = "a b"),
      "sourceLayers[2].heatmap.weightField:",
    ],
  ])("rejects %s", (_name, change, prefix) => {
    expect(reports(vector(change), prefix)).toBe(true);
  });

  it("accepts a source layer that fills the whole window of its layer", () => {
    expect(
      vector((d) => {
        layer(d, 1).minzoom = 2;
        layer(d, 1).maxzoom = 18;
      }),
    ).toEqual([]);
  });
});
