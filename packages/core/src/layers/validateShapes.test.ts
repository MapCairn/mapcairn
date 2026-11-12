// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { SAMPLE_AREA_LAYER, SAMPLE_LINE_LAYER } from "../fakes/layerFixtures";
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

/** Applies a change to a copy of the sample area layer's style. */
function areaWith(change: (style: Json) => void): string[] {
  const definition = copy(SAMPLE_AREA_LAYER);
  change(definition.style as Json);
  return validateLayerDefinition(definition, options);
}

function lineWith(change: (style: Json) => void): string[] {
  const definition = copy(SAMPLE_LINE_LAYER);
  change(definition.style as Json);
  return validateLayerDefinition(definition, options);
}

describe("validating a shape style", () => {
  it("accepts the sample area and line layers", () => {
    expect(validateLayerDefinition(SAMPLE_AREA_LAYER, options)).toEqual([]);
    expect(validateLayerDefinition(SAMPLE_LINE_LAYER, options)).toEqual([]);
  });

  const cases: [string, (style: Json) => void, string][] = [
    [
      "an unknown geometry",
      (s) => {
        s.geometry = "blob";
      },
      "style.geometry:",
    ],
    [
      "a fill opacity out of range",
      (s) => {
        s.fillOpacity = 0;
      },
      "style.fillOpacity:",
    ],
    [
      "a width out of range",
      (s) => {
        s.width = 40;
      },
      "style.width:",
    ],
    [
      "an unknown dash",
      (s) => {
        s.dash = "wavy";
      },
      "style.dash:",
    ],
    [
      "a label that is not a template",
      (s) => {
        s.label = { template: "" };
      },
      "style.label.template:",
    ],
    [
      "a label naming a field that does not exist",
      (s) => {
        s.label = { template: "{nothing}" };
      },
      "style.label.template: {nothing} is not a field",
    ],
    [
      "a label with an unregistered formatter",
      (s) => {
        s.label = { template: "{title|shout}" };
      },
      "style.label.template: formatter shout is not registered",
    ],
    [
      "a label zoom out of range",
      (s) => {
        s.label = { template: "{title}", minzoom: 40 };
      },
      "style.label.minzoom:",
    ],
    [
      "an unknown colour kind",
      (s) => {
        s.colour = { kind: "magic" };
      },
      "style.colour.kind:",
    ],
    [
      "an interval style over a field that does not exist",
      (s) => {
        (s.colour as Json).field = "missing";
      },
      "style.colour.field:",
    ],
    [
      "an interval range that is not ascending",
      (s) => {
        (s.colour as Json).max = -5;
      },
      "style.colour: min must be below max",
    ],
    [
      "a ramp that is too short",
      (s) => {
        s.colour = { ...(s.colour as Json), ramp: ["ordinal-1"] };
      },
      "style.colour.ramp:",
    ],
    [
      "a ramp of categorical colours",
      (s) => {
        (s.colour as Json).ramp = ["orange", "blue", "yellow"];
      },
      "style.colour.ramp[0]:",
    ],
    [
      "interval patterns that do not match the ramp",
      (s) => {
        (s.colour as Json).patterns = ["dots"];
      },
      "style.colour.patterns:",
    ],
    [
      "an unknown interval pattern",
      (s) => {
        (s.colour as Json).patterns = ["solid", "dots", "plaid"];
      },
      "style.colour.patterns[2]:",
    ],
    [
      "an interval unit that is not text",
      (s) => {
        (s.colour as Json).unit = 4;
      },
      "style.colour.unit:",
    ],
    [
      "a class with colour as the only signal",
      (s) => {
        delete (s.colour as Json).patterns;
        delete s.label;
      },
      "style.colour: colour must not be the only signal",
    ],
    [
      "a label that does not name the field",
      (s) => {
        delete (s.colour as Json).patterns;
      },
      "style.colour: colour must not be the only signal",
    ],
  ];

  it.each(cases)("rejects %s", (_name, change, expected) => {
    expect(areaWith(change).some((line) => line.startsWith(expected))).toBe(
      true,
    );
  });

  it("accepts a label that names the field as the second signal", () => {
    expect(
      areaWith((s) => {
        delete (s.colour as Json).patterns;
        s.label = { template: "{title}: {density|number}" };
      }),
    ).toEqual([]);
  });

  it("accepts distinct widths or dashes as the second signal", () => {
    expect(
      areaWith((s) => {
        delete (s.colour as Json).patterns;
        delete s.label;
        (s.colour as Json).widths = [1, 2, 4];
      }),
    ).toEqual([]);
    expect(
      areaWith((s) => {
        delete (s.colour as Json).patterns;
        delete s.label;
        (s.colour as Json).dashes = ["solid", "dashed", "dotted"];
      }),
    ).toEqual([]);
  });

  it("does not ask a single fixed class for a second signal", () => {
    expect(
      areaWith((s) => {
        s.colour = { kind: "fixed", colour: "blue", label: "Area" };
        delete s.label;
      }),
    ).toEqual([]);
  });

  it("rejects a pattern on a line style", () => {
    expect(
      lineWith((s) => {
        const colour = s.colour as { categories: Json[] };
        (colour.categories[0] as Json).pattern = "dots";
      }).some((line) => line.includes("pattern")),
    ).toBe(true);
  });

  const categoryCases: [string, (colour: Json) => void, string][] = [
    [
      "a missing field",
      (c) => {
        c.field = "nothing";
      },
      "style.colour.field:",
    ],
    [
      "no categories",
      (c) => {
        c.categories = [];
      },
      "style.colour.categories:",
    ],
    [
      "an ordinal colour for a category",
      (c) => {
        ((c.categories as Json[])[0] as Json).colour = "ordinal-1";
      },
      "style.colour.categories[0].colour:",
    ],
    [
      "a category with no words",
      (c) => {
        ((c.categories as Json[])[0] as Json).label = "";
      },
      "style.colour.categories[0].label:",
    ],
    [
      "a duplicate category value",
      (c) => {
        ((c.categories as Json[])[1] as Json).value = "main";
      },
      "style.colour.categories[1].value:",
    ],
    [
      "a bad width",
      (c) => {
        ((c.categories as Json[])[0] as Json).width = 0;
      },
      "style.colour.categories[0].width:",
    ],
    [
      "a bad dash",
      (c) => {
        ((c.categories as Json[])[0] as Json).dash = "wavy";
      },
      "style.colour.categories[0].dash:",
    ],
    [
      "no other class",
      (c) => {
        c.other = {};
      },
      "style.colour.other:",
    ],
    [
      "all classes alike",
      (c) => {
        for (const category of c.categories as Json[]) {
          delete category.width;
          delete category.dash;
        }
        c.other = { label: "Other route", colour: "orange" };
      },
      "style.colour: colour must not be the only signal",
    ],
  ];

  it.each(categoryCases)(
    "rejects a category line style with %s",
    (_name, change, expected) => {
      expect(
        lineWith((s) => change(s.colour as Json)).some((line) =>
          line.startsWith(expected),
        ),
      ).toBe(true);
    },
  );

  const stepCases: [string, (colour: Json) => void, string][] = [
    [
      "descending minimums",
      (c) => {
        (c.steps as Json[]).reverse();
      },
      "style.colour.steps: minimums must be ascending numbers",
    ],
    [
      "a categorical colour for a step",
      (c) => {
        ((c.steps as Json[])[0] as Json).colour = "orange";
      },
      "style.colour.steps[0].colour:",
    ],
    [
      "no steps",
      (c) => {
        c.steps = [];
      },
      "style.colour.steps:",
    ],
    [
      "a missing field",
      (c) => {
        c.field = "nothing";
      },
      "style.colour.field:",
    ],
  ];

  it.each(stepCases)(
    "rejects a step style with %s",
    (_name, change, expected) => {
      expect(
        areaWith((s) => {
          s.colour = {
            kind: "steps",
            field: "density",
            steps: [
              { min: 0, label: "Low", colour: "ordinal-1", pattern: "solid" },
              { min: 10, label: "High", colour: "ordinal-5", pattern: "dots" },
            ],
          };
          change(s.colour as Json);
        }).some((line) => line.startsWith(expected)),
      ).toBe(true);
    },
  );

  it("accepts steps whose patterns differ", () => {
    expect(
      areaWith((s) => {
        s.colour = {
          kind: "steps",
          field: "density",
          steps: [
            { min: 0, label: "Low", colour: "ordinal-1" },
            { min: 10, label: "High", colour: "ordinal-5", pattern: "dots" },
          ],
        };
        delete s.label;
      }),
    ).toEqual([]);
  });

  it("rejects a fixed style with a bad colour or no words", () => {
    const found = areaWith((s) => {
      s.colour = { kind: "fixed", colour: "mauve", label: "" };
    });
    expect(found.some((line) => line.startsWith("style.colour.colour:"))).toBe(
      true,
    );
    expect(found.some((line) => line.startsWith("style.colour.label:"))).toBe(
      true,
    );
  });
});
