// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  headingsOf,
  PART_CEILING,
  slugifyHeading,
  splitDocument,
} from "./repositoryDocParts";

const SOURCE = [
  "# Title",
  "",
  "Opening line.",
  "",
  "### Aside",
  "",
  "Aside text.",
  "",
  "## First section",
  "",
  "First text. More.",
  "",
  "```md",
  "## Not a heading",
  "```",
  "",
  "## Second `code` section",
  "",
  "| Name | What |",
  "| ---- | ---- |",
  "| `a`  | one  |",
  "",
  "## First section",
  "",
  "Same title again.",
  "",
].join("\n");

const textOf = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** What a split holds in order, with the table headers that continuation parts repeat taken out. */
function rejoin(split: ReturnType<typeof splitDocument>): string {
  return `${split.preamble}${split.parts.map((part) => part.markdown).join("")}`;
}

/** The text after the document's own title line, which the split does not keep. */
function afterTitle(text: string): string {
  return text.slice(text.indexOf("\n") + 1);
}

describe("slugifyHeading", () => {
  it("makes the id the framework gives a heading", () => {
    expect(slugifyHeading("Layers and dependency rules")).toBe(
      "layers-and-dependency-rules",
    );
    expect(slugifyHeading("What the lint checks, and where")).toBe(
      "what-the-lint-checks-and-where",
    );
    expect(slugifyHeading("The `Sheet` [link](x.md) (and 2 more)")).toBe(
      "the-sheet-link-and-2-more",
    );
  });
});

describe("splitDocument", () => {
  const split = splitDocument(SOURCE);

  it("takes the title and keeps the text before the first section as the preamble", () => {
    expect(split.title).toBe("Title");
    expect(split.preamble).toBe(
      "\nOpening line.\n\n### Aside\n\nAside text.\n\n",
    );
  });

  it("makes one part for each second-level heading outside a code block", () => {
    expect(split.parts.map((part) => part.title)).toEqual([
      "First section",
      "Second code section",
      "First section",
    ]);
  });

  it("gives each part a unique stem, numbering a repeated title", () => {
    expect(split.parts.map((part) => part.stem)).toEqual([
      "first-section",
      "second-code-section",
      "first-section-2",
    ]);
  });

  it("loses and repeats no text: the preamble and the parts, joined, are the source after its title", () => {
    expect(rejoin(split)).toBe(afterTitle(SOURCE));
  });

  it("is the same every time", () => {
    expect(splitDocument(SOURCE)).toEqual(split);
  });

  it("refuses a document with no title", () => {
    expect(() => splitDocument("Body only.\n")).toThrow(/title/);
  });

  it("makes no part of a document with no sections", () => {
    const only = splitDocument("# T\n\nText.\n");
    expect(only.parts).toEqual([]);
    expect(only.preamble).toBe("\nText.\n");
  });
});

describe("splitDocument, over the ceiling", () => {
  const rows = Array.from(
    { length: 30 },
    (_, index) => `| \`row${index}\` | ${"x".repeat(40)} |`,
  );
  const source = [
    "# T",
    "",
    "## Big",
    "",
    "Lead paragraph.",
    "",
    "| Name | What |",
    "| ---- | ---- |",
    ...rows,
    "",
    "### After",
    "",
    "Tail paragraph.",
    "",
    "## Small",
    "",
    "Short.",
    "",
  ].join("\n");
  const ceiling = 600;
  const split = splitDocument(source, ceiling);
  const big = split.parts.filter((part) => part.title.startsWith("Big"));

  it("splits the section into numbered parts and leaves a section under the ceiling whole", () => {
    expect(big.length).toBeGreaterThan(2);
    expect(big.map((part) => part.title)).toEqual(
      big.map((_, index) => `Big (part ${index + 1} of ${big.length})`),
    );
    expect(big.map((part) => part.stem)).toEqual(
      big.map((_, index) => `big-part-${index + 1}`),
    );
    expect(split.parts.at(-1)?.title).toBe("Small");
  });

  it("splits a table between its rows and repeats its header in each later part", () => {
    expect(big[0]?.tableHeader).toBe("");
    for (const part of big.slice(1)) {
      if (part.markdown.startsWith("|")) {
        expect(part.tableHeader).toBe("| Name | What |\n| ---- | ---- |\n");
      }
    }
    expect(big.some((part) => part.tableHeader !== "")).toBe(true);
  });

  it("keeps every part within the ceiling, counting the repeated header", () => {
    for (const part of split.parts) {
      expect(part.bytes).toBe(
        Buffer.byteLength(part.tableHeader + part.markdown),
      );
      expect(part.bytes).toBeLessThanOrEqual(ceiling);
    }
  });

  it("loses and repeats no text", () => {
    expect(rejoin(split)).toBe(afterTitle(source));
  });

  it("never ends a part on a heading or on a table's header", () => {
    for (const part of big) {
      expect(part.markdown.trimEnd().split("\n").at(-1)).not.toMatch(/^#+ /);
      expect(part.markdown.trimEnd().split("\n").at(-1)).not.toBe(
        "| ---- | ---- |",
      );
    }
  });

  it("numbers the parts of a section, and each knows its place", () => {
    expect(big.map((part) => [part.part, part.parts])).toEqual(
      big.map((_, index) => [index + 1, big.length]),
    );
  });

  it("does not cut a code block", () => {
    const code = `# T\n\n## A\n\n\`\`\`ts\n${"const a = 1;\n".repeat(100)}\`\`\`\n\nAfter.\n`;
    const cut = splitDocument(code, 300);
    expect(rejoin(cut)).toBe(afterTitle(code));
    for (const part of cut.parts) {
      expect(part.markdown.split("```").length - 1).toBeLessThanOrEqual(2);
      expect((part.markdown.split("```").length - 1) % 2).toBe(0);
    }
  });
});

describe("headingsOf", () => {
  it("lists the headings outside code blocks with their level, text and id", () => {
    expect(headingsOf("## A b\n\n```\n### no\n```\n\n### C `d`\n")).toEqual([
      { level: 2, text: "A b", id: "a-b" },
      { level: 3, text: "C d", id: "c-d" },
    ]);
  });
});

describe("the repository documents", () => {
  const documents = ["../../../ARCHITECTURE.md", "../../../DESIGN.md"];

  it.each(documents)(
    "%s splits with every part within the ceiling and no text lost",
    (path) => {
      const text = textOf(path);
      const split = splitDocument(text);
      expect(rejoin(split)).toBe(afterTitle(text));
      for (const part of split.parts) {
        expect(part.bytes).toBeLessThanOrEqual(PART_CEILING);
      }
    },
  );

  it.each(documents)(
    "%s has every heading in exactly one part, or its preamble",
    (path) => {
      const text = textOf(path);
      const split = splitDocument(text);
      const inParts = [
        ...headingsOf(split.preamble),
        ...split.parts.flatMap((part) => headingsOf(part.markdown)),
      ];
      expect(inParts.map((heading) => heading.text)).toEqual(
        headingsOf(afterTitle(text)).map((heading) => heading.text),
      );
    },
  );

  it("splits the two documents into parts a phone and a model's context can read", () => {
    expect(PART_CEILING).toBeLessThanOrEqual(40_000);
    for (const path of documents) {
      const split = splitDocument(textOf(path));
      expect(split.parts.length).toBeGreaterThan(5);
    }
  });

  it("has unique stems", () => {
    for (const path of documents) {
      const stems = splitDocument(textOf(path)).parts.map((part) => part.stem);
      expect(new Set(stems).size).toBe(stems.length);
    }
  });
});
