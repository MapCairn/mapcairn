// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASEMAPS } from "../basemaps/basemaps";
import { DRAW_KEY_HELP, MAP_KEY_HELP } from "../keyboard/keyboard";
import { checkDefinitionTexts } from "./checkDefinitionTexts";

const layer = {
  id: "quakes",
  name: { key: "quakes.name", text: "Earthquakes" },
  description: "Recent earthquakes.",
  group: "layer.group.hazards",
  dataCost: { key: "quakes.cost", text: "about 30 KB" },
  controls: [
    {
      id: "window",
      kind: "segmented",
      label: { key: "quakes.window", text: "Period" },
      options: [{ value: "day", label: { key: "quakes.day", text: "Day" } }],
    },
  ],
  card: {
    title: { key: "quakes.title", text: "{place}" },
    lines: [{ key: "quakes.depth", text: "{depth} deep" }],
    link: { field: "url", label: { key: "quakes.link", text: "Source" } },
  },
};

describe("checkDefinitionTexts", () => {
  it("reports each host key the catalogue lacks, in first-use order", () => {
    expect(
      checkDefinitionTexts([layer], { "quakes.name": "Aardbewings" }),
    ).toEqual([
      { key: "quakes.cost", problem: "missing" },
      { key: "quakes.window", problem: "missing" },
      { key: "quakes.day", problem: "missing" },
      { key: "quakes.link", problem: "missing" },
    ]);
  });

  it("reports a blank or non-string entry as blank", () => {
    const texts = {
      "quakes.name": "  ",
      "quakes.cost": 3,
    } as unknown as Record<string, string>;
    expect(checkDefinitionTexts([layer], texts).slice(0, 2)).toEqual([
      { key: "quakes.name", problem: "blank" },
      { key: "quakes.cost", problem: "blank" },
    ]);
  });

  it("finds nothing wrong when every key is translated", () => {
    const texts = Object.fromEntries(
      ["name", "cost", "window", "day", "link"].map((id) => [
        `quakes.${id}`,
        "Vertaal",
      ]),
    );
    expect(checkDefinitionTexts([layer], texts)).toEqual([]);
  });

  it("does not report plain text, a shipped key or a layer template", () => {
    const problems = checkDefinitionTexts([layer], {});
    const keys = problems.map((problem) => problem.key);
    expect(keys).not.toContain("layer.group.hazards");
    expect(keys).not.toContain("quakes.title");
    expect(keys).not.toContain("quakes.depth");
  });

  it("reports an entry no definition uses, after the missing ones", () => {
    expect(
      checkDefinitionTexts([{ name: { key: "a", text: "A" } }], {
        a: "A af",
        old: "Ou",
      }),
    ).toEqual([{ key: "old", problem: "unused" }]);
  });

  it("reports a key used twice once", () => {
    const same = { name: { key: "a", text: "A" } };
    expect(checkDefinitionTexts([same, same, [same]], {})).toEqual([
      { key: "a", problem: "missing" },
    ]);
  });

  it("reads only the catalogue's own entries", () => {
    const inherited = Object.create({ a: "Inherited" }) as Record<
      string,
      string
    >;
    expect(
      checkDefinitionTexts([{ name: { key: "a", text: "A" } }], inherited),
    ).toEqual([{ key: "a", problem: "missing" }]);
    expect(
      checkDefinitionTexts([{ name: { key: "constructor", text: "C" } }], {}),
    ).toEqual([{ key: "constructor", problem: "missing" }]);
  });

  it("treats a catalogue with no definition texts as lacking every key", () => {
    expect(
      checkDefinitionTexts([{ name: { key: "a", text: "A" } }], undefined),
    ).toEqual([{ key: "a", problem: "missing" }]);
  });

  it("reads other definitions: basemaps, keyboard help and nested lists", () => {
    const basemap = { ...BASEMAPS[0], name: { key: "b.name", text: "Base" } };
    const help = [{ keys: { key: "k.keys", text: "Q" }, description: "Quit" }];
    expect(
      checkDefinitionTexts([basemap, help, MAP_KEY_HELP, DRAW_KEY_HELP], {}),
    ).toEqual([
      { key: "b.name", problem: "missing" },
      { key: "k.keys", problem: "missing" },
    ]);
  });

  it("survives a cyclic or hostile value without looping", () => {
    const cyclic: Record<string, unknown> = {
      name: { key: "a", text: "A" },
      extra: { key: 1, text: "no key" },
      nothing: null,
    };
    cyclic.self = cyclic;
    expect(checkDefinitionTexts([cyclic], {})).toEqual([
      { key: "a", problem: "missing" },
    ]);
  });

  it("skips every property the layer types read as a template", () => {
    const source = readFileSync(
      new URL("../layers/definition.ts", import.meta.url),
      "utf8",
    );
    const templateFields = new Set(
      [
        ...source.matchAll(
          /readonly (\w+)\??: (?:readonly )?(?:LayerTemplate|T)\b/g,
        ),
      ].map((match) => match[1] as string),
    );
    expect([...templateFields].sort()).toEqual([
      "lines",
      "secondary",
      "template",
      "title",
      "unit",
    ]);
    for (const field of templateFields) {
      expect(
        checkDefinitionTexts([{ [field]: { key: "t", text: "T" } }], {}),
      ).toEqual([]);
    }
  });
});
