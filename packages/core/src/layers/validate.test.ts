import { describe, expect, it } from "vitest";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
} from "../fakes/layerFixtures";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { assertValidDefinitions, validateLayerDefinition } from "./validate";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

type Json = Record<string, unknown>;

/** A deep copy that a test can change freely. */
function copy<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function problems(value: unknown): string[] {
  return validateLayerDefinition(value, options);
}

describe("validateLayerDefinition", () => {
  it("accepts every sample definition", () => {
    for (const definition of SAMPLE_LAYERS) {
      expect(problems(definition)).toEqual([]);
    }
  });

  it("rejects something that is not an object", () => {
    expect(problems("layer")).toEqual(["definition: must be an object"]);
    expect(problems(null)).toEqual(["definition: must be an object"]);
  });

  /** Each case breaks one thing and names the problem it must report. */
  const cases: [string, Json, (d: Json) => void, string][] = [
    [
      "a bad id",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.id = "Bad Id";
      },
      "id:",
    ],
    [
      "an empty name",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.name = "";
      },
      "name:",
    ],
    [
      "a missing description",
      SAMPLE_FEED_LAYER,
      (d) => {
        delete d.description;
      },
      "description:",
    ],
    [
      "a missing group",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.group = 3;
      },
      "group:",
    ],
    [
      "a missing data cost",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.dataCost = "";
      },
      "dataCost:",
    ],
    [
      "no attribution",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.attribution = [];
      },
      "attribution:",
    ],
    [
      "an attribution with no text",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.attribution = [{ text: "" }];
      },
      "attribution[0].text:",
    ],
    [
      "an attribution link that is not https",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.attribution = [{ text: "A", url: "http://a.test" }];
      },
      "attribution[0].url:",
    ],
    [
      "an empty disclaimer",
      SAMPLE_ALERT_LAYER,
      (d) => {
        d.disclaimer = "";
      },
      "disclaimer:",
    ],
    [
      "controls that are not a list",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.controls = {};
      },
      "controls:",
    ],
    [
      "a control that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as unknown[])[0] = 1;
      },
      "controls[0]:",
    ],
    [
      "an unknown control kind",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[0].kind = "dial";
      },
      "controls[0].kind:",
    ],
    [
      "a bad control id",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[0].id = "1x";
      },
      "controls[0].id:",
    ],
    [
      "a duplicate control id",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[1].id = "window";
      },
      "controls[1].id: duplicate",
    ],
    [
      "a control with no label",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[0].label = "";
      },
      "controls[0].label:",
    ],
    [
      "a segmented control with no options",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[0].options = [];
      },
      "controls[0].options:",
    ],
    [
      "a segmented option with a bad value",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.controls as Json[])[0].options as Json[])[0].value = "A B";
      },
      "controls[0].options[0].value:",
    ],
    [
      "a segmented option with no label",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.controls as Json[])[0].options as Json[])[0].label = "";
      },
      "controls[0].options[0].label:",
    ],
    [
      "duplicate segmented options",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.controls as Json[])[0].options as Json[])[1].value = "hour";
      },
      "controls[0].options[1].value: duplicate",
    ],
    [
      "a segmented default that is not an option",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[0].default = "week";
      },
      "controls[0].default:",
    ],
    [
      "a switch default that is not a boolean",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[1].default = "no";
      },
      "controls[1].default:",
    ],
    [
      "a condition on an unknown control",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[1].enabledWhen = {
          control: "nope",
          in: ["day"],
        };
      },
      "controls[1].enabledWhen:",
    ],
    [
      "a condition with a value its control lacks",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[1].enabledWhen = {
          control: "window",
          in: ["year"],
        };
      },
      "controls[1].enabledWhen:",
    ],
    [
      "a condition that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.controls as Json[])[1].enabledWhen = "window";
      },
      "controls[1].enabledWhen:",
    ],
    [
      "a date bound that is not a date",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.controls as Json[])[0].min = "2024-13-01";
      },
      "controls[0].min:",
    ],
    [
      "a relative date that is negative",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.controls as Json[])[0].max = { daysAgo: -1 };
      },
      "controls[0].max:",
    ],
    [
      "a fixed date range that is backwards",
      SAMPLE_TILE_LAYER,
      (d) => {
        Object.assign((d.controls as Json[])[0], {
          min: "2025-01-02",
          max: "2025-01-01",
          default: "2025-01-01",
        });
      },
      "controls[0]: min is after max",
    ],
    [
      "a fixed default outside a fixed range",
      SAMPLE_TILE_LAYER,
      (d) => {
        Object.assign((d.controls as Json[])[0], {
          min: "2025-01-01",
          max: "2025-01-05",
          default: "2025-02-01",
        });
      },
      "controls[0].default:",
    ],
    [
      "an opacity outside 0.1 to 1",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.controls as Json[])[1].default = 0;
      },
      "controls[1].default:",
    ],
    [
      "a variable list that is not a list",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.variables = {};
      },
      "variables:",
    ],
    [
      "a variable that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.variables = [1];
      },
      "variables[0]:",
    ],
    [
      "a variable named like a control",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.variables as Json[])[0].id = "window";
      },
      "variables[0].id:",
    ],
    [
      "a variable from an unknown control",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.variables as Json[])[0].from = ["nope"];
      },
      "variables[0].from:",
    ],
    [
      "a variable from a date control",
      SAMPLE_TILE_LAYER,
      (d) => {
        d.variables = [{ id: "v", from: ["date"], table: {} }];
      },
      "variables[0].from:",
    ],
    [
      "a variable table missing a combination",
      SAMPLE_FEED_LAYER,
      (d) => {
        delete ((d.variables as Json[])[0].table as Json)["day|true"];
      },
      "variables[0].table: no value for day|true",
    ],
    [
      "a variable table with an empty value",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.variables as Json[])[0].table as Json)["day|true"] = "";
      },
      "variables[0].table: no value for day|true",
    ],
    [
      "a source that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.source = "x";
      },
      "source:",
    ],
    [
      "an unknown source kind",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).kind = "stream";
      },
      "source.kind:",
    ],
    [
      "a feed URL that is not https",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).url = "http://sample.test/{feed}";
      },
      "source.url:",
    ],
    [
      "a feed URL variable with no control",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).url = "https://sample.test/{region}";
      },
      "source.url: {region}",
    ],
    [
      "a feed URL with an engine placeholder",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).url = "https://sample.test/{z}";
      },
      "source.url: {z}",
    ],
    [
      "an unregistered decoder",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).decoder = "csv";
      },
      "source.decoder:",
    ],
    [
      "fields with no title",
      SAMPLE_FEED_LAYER,
      (d) => {
        delete ((d.source as Json).fields as Json).title;
      },
      "source.fields.title:",
    ],
    [
      "fields that are not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).fields = [];
      },
      "source.fields:",
    ],
    [
      "a field path that is empty",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.source as Json).fields as Json).value = "";
      },
      "source.fields.value:",
    ],
    [
      "a filter on an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).filter = { field: "nope", in: ["a"] };
      },
      "source.filter:",
    ],
    [
      "a filter with no values",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.source as Json).filter = { field: "kind", in: [] };
      },
      "source.filter:",
    ],
    [
      "a tile URL that is not https",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.source as Json).tiles = "http://t.test/{z}/{x}/{y}";
      },
      "source.tiles:",
    ],
    [
      "a tile URL variable with no control",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.source as Json).tiles = "https://t.test/{layer}/{z}/{x}/{y}";
      },
      "source.tiles: {layer}",
    ],
    [
      "a tile size that is not 256 or 512",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.source as Json).tileSize = 300;
      },
      "source.tileSize:",
    ],
    [
      "a max zoom out of range",
      SAMPLE_TILE_LAYER,
      (d) => {
        (d.source as Json).maxzoom = 30;
      },
      "source.maxzoom:",
    ],
    [
      "a tile legend with an unknown colour",
      SAMPLE_TILE_LAYER,
      (d) => {
        d.legend = [{ label: "A", colour: "pink" }];
      },
      "legend[0].colour:",
    ],
    [
      "a tile legend entry with no label",
      SAMPLE_TILE_LAYER,
      (d) => {
        d.legend = [{ label: "", colour: "blue" }];
      },
      "legend[0].label:",
    ],
    [
      "a tile legend that is not a list",
      SAMPLE_TILE_LAYER,
      (d) => {
        d.legend = "blue";
      },
      "legend:",
    ],
    [
      "a feed with no style",
      SAMPLE_FEED_LAYER,
      (d) => {
        delete d.style;
      },
      "style:",
    ],
    [
      "an unknown colour rule",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.style as Json).colour = { kind: "gradient" };
      },
      "style.colour.kind:",
    ],
    [
      "a step colour on an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.style as Json).colour as Json).field = "nope";
      },
      "style.colour.field:",
    ],
    [
      "steps out of order",
      SAMPLE_FEED_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).steps as Json[])[1].min = -5;
      },
      "style.colour.steps:",
    ],
    [
      "a step with an unknown colour",
      SAMPLE_FEED_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).steps as Json[])[0].colour = "pink";
      },
      "style.colour.steps[0].colour:",
    ],
    [
      "a step with no label",
      SAMPLE_FEED_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).steps as Json[])[0].label = "";
      },
      "style.colour.steps[0].label:",
    ],
    [
      "a step colour from the categorical palette",
      SAMPLE_FEED_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).steps as Json[])[0].colour =
          "orange";
      },
      "style.colour.steps[0].colour: use an ordinal colour",
    ],
    [
      "no steps",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.style as Json).colour as Json).steps = [];
      },
      "style.colour.steps:",
    ],
    [
      "a category with an unknown colour",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).categories as Json[])[0].colour =
          "pink";
      },
      "style.colour.categories[0].colour:",
    ],
    [
      "a category with an ordinal colour",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).categories as Json[])[0].colour =
          "ordinal-1";
      },
      "style.colour.categories[0].colour: use a categorical colour",
    ],
    [
      "a category with an unknown shape",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).categories as Json[])[0].shape =
          "star";
      },
      "style.colour.categories[0].shape:",
    ],
    [
      "duplicate categories",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).categories as Json[])[1].value =
          "Green";
      },
      "style.colour.categories[1].value: duplicate",
    ],
    [
      "a category with no label",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).categories as Json[])[1].label = "";
      },
      "style.colour.categories[1].label:",
    ],
    [
      "no categories",
      SAMPLE_ALERT_LAYER,
      (d) => {
        ((d.style as Json).colour as Json).categories = [];
      },
      "style.colour.categories:",
    ],
    [
      "two categories sharing a colour",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (((d.style as Json).colour as Json).categories as Json[])[1].colour =
          "bluish-green";
      },
      "style.colour.categories[1].colour: duplicate",
    ],
    [
      "an other entry with an unknown colour",
      SAMPLE_ALERT_LAYER,
      (d) => {
        ((d.style as Json).colour as Json).other = {
          label: "Other",
          colour: "pink",
        };
      },
      "style.colour.other:",
    ],
    [
      "a fixed colour with no label",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.style as Json).colour = { kind: "fixed", colour: "blue", label: "" };
      },
      "style.colour.label:",
    ],
    [
      "a fixed colour that is unknown",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.style as Json).colour = {
          kind: "fixed",
          colour: "pink",
          label: "A",
        };
      },
      "style.colour.colour:",
    ],
    [
      "an unknown style shape",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.style as Json).shape = "star";
      },
      "style.shape:",
    ],
    [
      "size stops on an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.style as Json).size as Json).field = "nope";
      },
      "style.size.field:",
    ],
    [
      "size stops out of order",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.style as Json).size as Json).stops = [
          [3, 4],
          [0, 7],
        ];
        ((d.style as Json).size as Json).labels = ["a", "b"];
      },
      "style.size.stops:",
    ],
    [
      "a size radius out of range",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.style as Json).size as Json).stops = [[0, 40]];
        ((d.style as Json).size as Json).labels = ["a"];
      },
      "style.size.stops:",
    ],
    [
      "size labels that do not match the stops",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.style as Json).size as Json).labels = ["a"];
      },
      "style.size.labels:",
    ],
    [
      "a size rule that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.style as Json).size = 3;
      },
      "style.size:",
    ],
    [
      "colour categories with no shape, size or words on the card",
      SAMPLE_ALERT_LAYER,
      (d) => {
        for (const category of ((d.style as Json).colour as Json)
          .categories as Json[]) {
          delete category.shape;
        }
        d.card = { title: "{title}", lines: ["{severity}"] };
      },
      "style.colour: colour must not be the only signal",
    ],
    [
      "colour steps with no size or words on the card",
      SAMPLE_FEED_LAYER,
      (d) => {
        delete (d.style as Json).size;
        d.card = { title: "{title}", lines: ["{depth|km} deep"] };
      },
      "style.colour: colour must not be the only signal",
    ],
    [
      "a card with no title",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.card as Json).title = "";
      },
      "card.title:",
    ],
    [
      "a card template with an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.card as Json).lines = ["{nope}"];
      },
      "card.lines[0]: {nope}",
    ],
    [
      "a card template with an unknown formatter",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.card as Json).lines = ["{value|money}"];
      },
      "card.lines[0]: formatter money",
    ],
    [
      "card lines that are not a list",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.card as Json).lines = "x";
      },
      "card.lines:",
    ],
    [
      "a card link to an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.card as Json).link = { field: "nope", label: "Open" };
      },
      "card.link:",
    ],
    [
      "a card that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.card = 1;
      },
      "card:",
    ],
    [
      "a list that is not an object",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.list = 1;
      },
      "list:",
    ],
    [
      "a list template with an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.list as Json).secondary = "{nope}";
      },
      "list.secondary: {nope}",
    ],
    [
      "a list with no sorts",
      SAMPLE_FEED_LAYER,
      (d) => {
        (d.list as Json).sorts = [];
      },
      "list.sorts:",
    ],
    [
      "a sort on an unknown field",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.list as Json).sorts as Json[])[0].field = "nope";
      },
      "list.sorts[0].field:",
    ],
    [
      "a sort with a bad direction",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.list as Json).sorts as Json[])[0].direction = "up";
      },
      "list.sorts[0].direction:",
    ],
    [
      "duplicate sort ids",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.list as Json).sorts as Json[])[1].id = "newest";
      },
      "list.sorts[1].id: duplicate",
    ],
    [
      "a sort with no label",
      SAMPLE_FEED_LAYER,
      (d) => {
        ((d.list as Json).sorts as Json[])[0].label = "";
      },
      "list.sorts[0].label:",
    ],
    [
      "no empty text",
      SAMPLE_FEED_LAYER,
      (d) => {
        d.emptyText = "";
      },
      "emptyText:",
    ],
    [
      "a detail that is not an object",
      SAMPLE_ALERT_LAYER,
      (d) => {
        d.detail = "x";
      },
      "detail:",
    ],
    [
      "a detail URL field that does not exist",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).urlField = "nope";
      },
      "detail.urlField:",
    ],
    [
      "a detail origin that is not an https origin",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).origins = ["https://alerts.test/path"];
      },
      "detail.origins[0]:",
    ],
    [
      "a detail with no origins",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).origins = [];
      },
      "detail.origins:",
    ],
    [
      "a detail with an unregistered decoder",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).decoder = "kml";
      },
      "detail.decoder:",
    ],
    [
      "a detail with an unknown colour",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).colour = "pink";
      },
      "detail.colour:",
    ],
    [
      "a detail with no label",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).label = "";
      },
      "detail.label:",
    ],
    [
      "a detail with no data cost",
      SAMPLE_ALERT_LAYER,
      (d) => {
        (d.detail as Json).dataCost = "";
      },
      "detail.dataCost:",
    ],
  ];

  it.each(cases)("reports %s", (_name, base, change, expected) => {
    const definition = copy(base);
    change(definition);
    const found = problems(definition);
    expect(found.some((problem) => problem.startsWith(expected))).toBe(true);
  });

  it("accepts colour categories without shapes when the card names the category", () => {
    const definition = copy(SAMPLE_ALERT_LAYER);
    for (const category of ((definition.style as Json).colour as Json)
      .categories as Json[]) {
      delete category.shape;
    }
    expect(problems(definition)).toEqual([]);
  });

  it("accepts colour steps without sizes when the card names the value", () => {
    const definition = copy(SAMPLE_FEED_LAYER);
    delete (definition.style as Json).size;
    expect(problems(definition)).toEqual([]);
  });
});

describe("assertValidDefinitions", () => {
  it("returns the definitions when every one is valid", () => {
    expect(assertValidDefinitions(SAMPLE_LAYERS, options)).toBe(SAMPLE_LAYERS);
  });

  it("throws with every problem, naming each layer", () => {
    expect(() =>
      assertValidDefinitions(
        [
          { ...SAMPLE_FEED_LAYER, name: "" },
          { ...SAMPLE_TILE_LAYER, dataCost: "" },
        ],
        options,
      ),
    ).toThrow(/sample-points: name:.*\n.*sample-imagery: dataCost:/s);
  });

  it("throws on two layers with the same id", () => {
    expect(() =>
      assertValidDefinitions([SAMPLE_FEED_LAYER, SAMPLE_FEED_LAYER], options),
    ).toThrow(/sample-points: id: duplicate/);
  });
});
