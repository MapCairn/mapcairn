// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { anExport } from "./fixtures";
import {
  firstSentence,
  plainText,
  renderExportPage,
  renderOverview,
  splitLead,
} from "./render";

const CONTEXT = {
  specifier: "@fixture/pkg",
  version: "1.2.3",
  related: [],
};

describe("text helpers", () => {
  it("splits a summary into its lead paragraph and the rest", () => {
    expect(splitLead("One.\nStill one.\n\nTwo.\n\nThree.")).toEqual({
      lead: "One.\nStill one.",
      rest: "Two.\n\nThree.",
    });
  });

  it("reads Markdown as plain words", () => {
    expect(
      plainText("See [the guide](./g.md) for `a < b`\n and \\{c\\}."),
    ).toBe("See the guide for a < b and {c}.");
  });

  it("takes the first sentence, and cuts a long one at a word", () => {
    expect(firstSentence("Does it. Then more.")).toBe("Does it.");
    expect(firstSentence("a ".repeat(100), 20)).toMatch(/^(a ){1,9}a?…$/);
  });
});

describe("renderExportPage", () => {
  it("opens with what the export is, then the package and version it was checked against", () => {
    const page = renderExportPage({
      ...CONTEXT,
      item: anExport({
        name: "add",
        summary: "Adds two numbers.\n\nThe rest of the story.",
        since: "0.1.0",
      }),
    });
    const lines = page.split("\n");
    expect(lines.indexOf("# add")).toBeGreaterThan(0);
    const body = page.slice(page.indexOf("# add"));
    expect(body.indexOf("Adds two numbers.")).toBeLessThan(
      body.indexOf(
        "This is a function exported by `@fixture/pkg`, checked against version 1.2.3. Added in 0.1.0.",
      ),
    );
    expect(body.indexOf("checked against version 1.2.3")).toBeLessThan(
      body.indexOf("## Signature"),
    );
    expect(body).toContain("## Description\n\nThe rest of the story.");
    expect(page).toContain('description: "Adds two numbers."');
    expect(page).toContain("custom_edit_url: null");
  });

  it("shows the import and the signature, using a type import for a type", () => {
    const fn = renderExportPage({
      ...CONTEXT,
      item: anExport({ name: "add", signature: "function add(): void;" }),
    });
    expect(fn).toContain(
      '```ts\nimport { add } from "@fixture/pkg";\n \nfunction add(): void;\n```',
    );
    const type = renderExportPage({
      ...CONTEXT,
      item: anExport({
        name: "Shape",
        kind: "interface",
        signature: "interface Shape",
      }),
    });
    expect(type).toContain('import type { Shape } from "@fixture/pkg";');
  });

  it("lists parameters, returns, examples, a deprecation and what to see next", () => {
    const page = renderExportPage({
      ...CONTEXT,
      related: [{ label: "Total", href: "./Total.md" }],
      item: anExport({
        name: "add",
        parameters: [
          {
            name: "a",
            type: "number",
            description: "The first.",
            optional: false,
          },
          { name: "b", type: "number", description: "", optional: true },
        ],
        returnType: "number",
        returns: "The sum.",
        examples: ["```ts\nadd(1, 2);\n```"],
        deprecated: "Use `sum`.",
        see: ["The guide."],
      }),
    });
    expect(page).toContain(
      "## Parameters\n\n- `a` (`number`): The first.\n- `b?` (`number`)",
    );
    expect(page).toContain("## Returns\n\n`number`: The sum.");
    expect(page).toContain("## Examples\n\n```ts\nadd(1, 2);\n```");
    expect(page).toContain(":::warning Deprecated\n\nUse `sum`.\n\n:::");
    expect(page).toContain(
      "## See also\n\n- The guide.\n- [`Total`](./Total.md)",
    );
  });

  it("renders members under their kind, with the source link last", () => {
    const page = renderExportPage({
      ...CONTEXT,
      source: { label: "src/a.ts:3", href: "https://example.com/a.ts#L3" },
      item: anExport({
        name: "Box",
        kind: "interface",
        members: [
          {
            name: "size",
            kind: "property",
            signature: "readonly size: number;",
            summary: "How big.",
            parameters: [],
            returns: "",
            deprecated: "",
          },
          {
            name: "open",
            kind: "method",
            signature: "open(now: boolean): void;",
            summary: "",
            parameters: [
              {
                name: "now",
                type: "boolean",
                description: "At once.",
                optional: false,
              },
            ],
            returns: "Nothing.",
            deprecated: "",
          },
        ],
      }),
    });
    expect(page).toContain(
      "## Properties\n\n### size\n\n```ts\nreadonly size: number;\n```\n\nHow big.",
    );
    expect(page).toContain("## Methods\n\n### open");
    expect(page).toContain(
      "- `now` (`boolean`): At once.\n\nReturns: Nothing.",
    );
    expect(
      page
        .trimEnd()
        .endsWith("Source: [src/a.ts:3](https://example.com/a.ts#L3)"),
    ).toBe(true);
  });

  it("says when an export is not yet stable", () => {
    const page = renderExportPage({
      ...CONTEXT,
      item: anExport({ releaseTag: "beta" }),
    });
    expect(page).toContain("Marked beta: it may change.");
  });
});

describe("renderOverview", () => {
  it("lists each group's entries with one line each, escaping markup in them", () => {
    const page = renderOverview({
      title: "@fixture/pkg",
      description: "A package.",
      facts: "Checked against version 1.2.3.",
      intro: [],
      sections: [
        {
          title: "Functions",
          entries: [
            { name: "add", href: "./add.md", summary: "Adds <a> and {b}." },
            { name: "bare", href: "./bare.md", summary: "" },
          ],
        },
      ],
    });
    expect(page).toContain(
      "## Functions\n\n- [`add`](./add.md): Adds &lt;a> and \\{b\\}.\n- [`bare`](./bare.md)",
    );
    expect(page).toContain(
      "# @fixture/pkg\n\nA package.\n\nChecked against version 1.2.3.",
    );
  });
});
