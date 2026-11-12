// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
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

/** Validates the sample identify layer after `change`. */
function problemsAfter(change: (definition: Json) => void): string[] {
  const definition = copy(SAMPLE_IDENTIFY_LAYER);
  change(definition);
  return validateLayerDefinition(definition, options);
}

function identify(definition: Json): Json {
  return definition.identify as Json;
}

const BASE = "https://api.test/identify";
const BOX = "bbox={bbox}&width={width}&height={height}&i={x}&j={y}";

describe("an identify block", () => {
  it("is accepted on a raster tile layer", () => {
    expect(validateLayerDefinition(SAMPLE_IDENTIFY_LAYER, options)).toEqual([]);
  });

  it("is optional: a tile layer without one is as valid as before", () => {
    expect(validateLayerDefinition(SAMPLE_TILE_LAYER, options)).toEqual([]);
  });

  it("must be an object", () => {
    expect(problemsAfter((d) => (d.identify = "yes"))).toEqual([
      "identify: must be an object",
    ]);
  });

  it.each([
    ["a feed layer", SAMPLE_FEED_LAYER],
    ["a vector tile layer", SAMPLE_VECTOR_LAYER],
  ])("is refused on %s", (_name, layer) => {
    const definition = {
      ...copy(layer),
      identify: identify(copy(SAMPLE_IDENTIFY_LAYER)),
    };
    expect(validateLayerDefinition(definition, options)).toContain(
      "identify: is only for raster tile layers",
    );
  });
});

describe("the identify URL", () => {
  const urlProblems = (url: unknown) =>
    problemsAfter((d) => {
      identify(d).url = url;
    });

  it.each([
    ["missing", undefined],
    ["not text", 4],
    ["http", `http://api.test/identify?${BOX}`],
    ["not a URL", "identify"],
  ])("must be an https URL template, not one that is %s", (_name, url) => {
    expect(urlProblems(url)).toEqual([
      "identify.url: must be an https URL template",
    ]);
  });

  it.each([
    ["host", `https://{period}.api.test/identify?${BOX}`],
    ["user information", `https://{period}@api.test/identify?${BOX}`],
  ])(
    "must not hold a placeholder in its %s, because the origin is fixed",
    (_name, url) => {
      expect(urlProblems(url)).toContain(
        "identify.url: the scheme, host and port must be fixed text, with no placeholder",
      );
    },
  );

  it("must not hold a placeholder in its port either", () => {
    expect(
      urlProblems(`https://api.test:{period}/identify?${BOX}`),
    ).not.toEqual([]);
  });

  it("may hold a placeholder in the path and the query", () => {
    expect(urlProblems(`${BASE}/{period}?${BOX}&p={period}`)).toEqual([]);
  });

  it.each(["z", "bbox-epsg-3857", "west", "limit", "nothing"])(
    "does not know {%s}",
    (name) => {
      expect(urlProblems(`${BASE}/{${name}}?${BOX}`)).toEqual([
        `identify.url: {${name}} has no control or variable`,
      ]);
    },
  );

  it("fills {x} and {y} itself, since it has no engine to leave them to", () => {
    expect(urlProblems(`${BASE}?${BOX}`)).toEqual([]);
  });

  it("accepts longitude and latitude alone", () => {
    expect(urlProblems(`${BASE}?lng={lng}&lat={lat}&zoom={zoom}`)).toEqual([]);
  });

  it.each([
    ["only longitude", "?lng={lng}"],
    ["only latitude", "?lat={lat}"],
    ["a box with no pixel", "?bbox={bbox}&width={width}&height={height}"],
    ["a box with no size", "?bbox={bbox}&i={x}&j={y}"],
    ["no position at all", "?q=1"],
  ])("needs a position, and %s is not one", (_name, query) => {
    expect(urlProblems(`${BASE}${query}`)).toEqual([
      "identify.url: must use {lng} and {lat}, or {bbox}, {width}, {height}, {x} and {y}",
    ]);
  });
});

describe("the identify tolerance", () => {
  const toleranceProblems = (tolerance: unknown) =>
    problemsAfter((d) => {
      identify(d).tolerance = tolerance;
    });

  it.each([1, 12, 20])("accepts %s pixels", (tolerance) => {
    expect(toleranceProblems(tolerance)).toEqual([]);
  });

  it.each([0, 21, 1.5, -3, "12", null, Number.NaN])(
    "refuses %s, which is not a whole number of pixels from 1 to 20",
    (tolerance) => {
      expect(toleranceProblems(tolerance)).toEqual([
        "identify.tolerance: must be a whole number from 1 to 20",
      ]);
    },
  );

  it("may be left out", () => {
    expect(
      problemsAfter((d) => {
        delete identify(d).tolerance;
      }),
    ).toEqual([]);
  });
});

describe("the identify decoder, records, fields and card", () => {
  it("names a registered decoder", () => {
    expect(problemsAfter((d) => (identify(d).decoder = "csv"))).toEqual([
      "identify.decoder: is not a registered decoder",
    ]);
  });

  it("may name a path to a list of records", () => {
    expect(
      problemsAfter((d) => (identify(d).records = "results.rows")),
    ).toEqual([]);
  });

  it.each([42, "", "  "])("refuses records that are %j", (records) => {
    expect(problemsAfter((d) => (identify(d).records = records))).toEqual([
      "identify.records: must be non-empty text",
    ]);
  });

  it("needs fields, with an id and a title", () => {
    expect(problemsAfter((d) => delete identify(d).fields)).toContain(
      "identify.fields: must be an object",
    );
    expect(
      problemsAfter((d) => {
        delete (identify(d).fields as Json).id;
        delete (identify(d).fields as Json).title;
      }),
    ).toEqual(
      expect.arrayContaining([
        "identify.fields.id: is required",
        "identify.fields.title: is required",
      ]),
    );
  });

  it("needs each field to be a dotted path", () => {
    expect(
      problemsAfter((d) => {
        (identify(d).fields as Json).depth = 3;
      }),
    ).toEqual(["identify.fields.depth: must be a dotted path"]);
  });

  it("needs a card", () => {
    expect(problemsAfter((d) => delete identify(d).card)).toEqual([
      "identify.card: must be an object",
    ]);
  });

  it("checks the card against the identify fields and the formatters", () => {
    expect(
      problemsAfter((d) => {
        identify(d).card = {
          title: "{nothing}",
          lines: ["{depth|nothing}", "{depth}"],
          link: { field: "nothing", label: "More" },
        };
      }),
    ).toEqual([
      "identify.card.title: {nothing} is not a field",
      "identify.card.lines[0]: formatter nothing is not registered",
      "identify.card.link: must name a field and have a label",
    ]);
  });

  it("checks each template against the identify fields and no others", () => {
    expect(
      problemsAfter((d) => {
        (identify(d).card as Json).lines = ["{magnitude}"];
      }),
    ).toEqual(["identify.card.lines[0]: {magnitude} is not a field"]);
  });
});

describe("control ids next to an identify block", () => {
  const collision = (id: string) =>
    problemsAfter((d) => {
      (d.controls as Json[])[0] = { ...(d.controls as Json[])[0], id };
      identify(d).url = `${BASE}?${BOX}`;
      (d.source as Json).tiles = "https://tiles.test/{z}/{y}/{x}.png";
    });

  it.each(["lng", "lat", "bbox", "width", "height", "x", "y", "zoom"])(
    "refuses a control called %s, so a template name is never ambiguous",
    (id) => {
      expect(collision(id)).toEqual([
        `controls[0].id: ${id} is a name the identify URL fills itself`,
      ]);
    },
  );

  it("refuses a derived variable with the same name too", () => {
    expect(
      problemsAfter((d) => {
        d.variables = [
          {
            id: "zoom",
            from: ["period"],
            table: { "20": "a", "100": "b" },
          },
        ];
      }),
    ).toEqual([
      "variables[0].id: zoom is a name the identify URL fills itself",
    ]);
  });

  it("allows those names when the layer has no identify block", () => {
    const definition = copy(SAMPLE_TILE_LAYER);
    (definition.controls as Json[])[1] = {
      kind: "opacity",
      id: "zoom",
      label: "Opacity",
      default: 0.8,
    };
    expect(validateLayerDefinition(definition, options)).toEqual([]);
  });
});

describe("the tile URL of a layer with an identify block", () => {
  it("still does not know the identify names", () => {
    expect(
      problemsAfter((d) => {
        (d.source as Json).tiles = "https://tiles.test/{lng}/{z}/{y}/{x}.png";
      }),
    ).toEqual(["source.tiles: {lng} has no control or variable"]);
  });
});
