// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sidebar } from "../sidebars";
import { sidebarDocIds } from "./docChecks";
import { PART_COPY_ALLOWANCE } from "./markdownChecks";
import { type CopyContext, copyText, parseDocSource } from "./markdownCopies";
import { PART_CEILING } from "./repositoryDocParts";
import {
  buildRepositoryPages,
  REPOSITORY_DOCS,
  type RepositoryDoc,
} from "./repositoryDocs";

const BLOB = "https://github.com/MapCairn/mapcairn/blob/main/";

/**
 * Pages outside the generated folder that a generated page may link: the
 * visual design page, which `generateDesignTokens.ts` writes and the sidebar lists.
 */
const OTHER_GENERATED_PAGES = ["../design-visual.md"];

/** Each link between generated pages (`page -> target`) whose target is not a page made. */
function linksToMissingPages(files: ReadonlyMap<string, string>): string[] {
  const missing: string[] = [];
  for (const [name, text] of files) {
    for (const [, target = ""] of text.matchAll(
      /\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g,
    )) {
      const resolved = posix.join(posix.dirname(name), target);
      const outside =
        target.startsWith("http") ||
        target.includes("guides/") ||
        OTHER_GENERATED_PAGES.includes(target);
      if (!outside && !files.has(resolved)) {
        missing.push(`${name} -> ${target}`);
      }
    }
  }
  return missing;
}

const COPY_CONTEXT: CopyContext = {
  origin: "https://mapcairn.timothybrits.co.za",
  baseUrl: "/docs/",
  version: "0.2.0",
  title: "MapCairn documentation",
  tagline: "Documentation for the MapCairn SDK",
};

const ARCH: RepositoryDoc = {
  source: "ARCHITECTURE.md",
  output: "architecture.md",
  title: "Architecture",
  sidebarLabel: "Architecture",
  description: "The layers.",
  slug: "/architecture",
  intro: "The layers, and how they depend on each other.",
};

const DESIGN: RepositoryDoc = {
  source: "DESIGN.md",
  output: "design.md",
  title: "Design system",
  sidebarLabel: "Design system",
  description: "The tokens.",
  slug: "/design",
  intro: "The tokens, and how to use them.",
};

const ARCH_TEXT = [
  "# Architecture",
  "",
  "Opening words. See [the tokens](DESIGN.md#tokens) and [the design](DESIGN.md).",
  "",
  "### How it builds",
  "",
  "Build text, see [layers](#layers-and-rules) and [how](#how-it-builds).",
  "",
  "## Layers and rules",
  "",
  "Layers are stacked. See [ports](#ports), [a guide](https://mapcairn.timothybrits.co.za/docs/guides/extending/#add-a-basemap) and [a file](packages/web/src/x.ts).",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
  "## Ports",
  "",
  "| Port | Real |",
  "| ---- | ---- |",
  "| `A`  | one  |",
  "| `B`  | two  |",
  "",
  "### The detail",
  "",
  "Detail here, back to [layers](#layers-and-rules) and [the detail](#the-detail).",
  "",
].join("\n");

const DESIGN_TEXT = [
  "# Design system",
  "",
  "## Tokens",
  "",
  "Tokens are values. Back to [architecture](ARCHITECTURE.md#the-detail) or [it](ARCHITECTURE.md#layers-and-rules).",
  "",
].join("\n");

const SOURCES = new Map([
  [ARCH.source, ARCH_TEXT],
  [DESIGN.source, DESIGN_TEXT],
]);

const pages = buildRepositoryPages(SOURCES, [ARCH, DESIGN]);
const page = (name: string): string => pages.files.get(name) ?? "";

describe("buildRepositoryPages", () => {
  it("makes an overview page for each document and a page for each part", () => {
    expect([...pages.files.keys()]).toEqual([
      "architecture.md",
      "architecture/layers-and-rules.md",
      "architecture/ports.md",
      "design.md",
      "design/tokens.md",
    ]);
  });

  it("keeps the old address for the overview and puts each part under it", () => {
    expect(page("architecture.md")).toContain('slug: "/architecture"\n');
    expect(page("design.md")).toContain('slug: "/design"\n');
    expect(page("architecture/ports.md")).toContain(
      'slug: "/architecture/ports"\n',
    );
  });

  it("is the same every time", () => {
    expect([...buildRepositoryPages(SOURCES, [ARCH, DESIGN]).files]).toEqual([
      ...pages.files,
    ]);
  });

  it("refuses a document that was not read, or has no title", () => {
    expect(() => buildRepositoryPages(new Map(), [ARCH])).toThrow(
      /ARCHITECTURE\.md/,
    );
    expect(() =>
      buildRepositoryPages(new Map([[ARCH.source, "Body only.\n"]]), [ARCH]),
    ).toThrow(/ARCHITECTURE\.md: .*title/);
  });
});

describe("the overview page", () => {
  const overview = page("architecture.md");

  it("starts with the front matter the site needs", () => {
    expect(overview.startsWith("---\n")).toBe(true);
    expect(overview).toContain('title: "Architecture"\n');
    expect(overview).toContain('sidebar_label: "Architecture"\n');
    expect(overview).toContain('description: "The layers."\n');
  });

  it("opens with one plain sentence on what the page holds and where it is edited, under the document's title, with no version line", () => {
    const afterTitle = overview.slice(overview.indexOf("# Architecture"));
    expect(afterTitle).toContain(ARCH.intro);
    expect(afterTitle).toContain(`[ARCHITECTURE.md](${BLOB}ARCHITECTURE.md)`);
    expect(afterTitle).not.toContain("%sdkVersion%");
    expect(afterTitle).not.toContain("Checked against");
  });

  it("lists every section with the first sentence of its prose, and no size", () => {
    expect(overview).toContain(
      '- <span id="layers-and-rules"></span>[Layers and rules](architecture/layers-and-rules.md): Layers are stacked.',
    );
    expect(overview).not.toMatch(/\bKB\b/);
  });

  it("gives a section that opens with a table no description, not its rows", () => {
    expect(overview).toContain(
      '- <span id="ports"></span>[Ports](architecture/ports.md)\n',
    );
  });

  it("gives a section that opens with a list, whose first item holds a table, no description", () => {
    const text = buildRepositoryPages(
      new Map([
        [
          ARCH.source,
          "# T\n\n## Tokens\n\n- **Syntax palette:** the colours.\n\n  | Role | Light |\n  | ---- | ----- |\n  | Key | 7.8 |\n\nProse after.\n",
        ],
      ]),
      [ARCH],
    ).files.get("architecture.md");
    expect(text).toContain(
      '- <span id="tokens"></span>[Tokens](architecture/tokens.md)\n',
    );
    expect(text).not.toContain("| Role |");
  });

  it("lists a section cut into parts once, with its parts on a line below", () => {
    const cut = buildRepositoryPages(
      new Map([
        [
          ARCH.source,
          `# T\n\n## Big\n\nBig opens in prose.\n\n| N | W |\n| - | - |\n${Array.from({ length: 20 }, (_, i) => `| \`r${i}\` | ${"y".repeat(30)} |`).join("\n")}\n`,
        ],
      ]),
      [ARCH],
      400,
    ).files;
    const text = cut.get("architecture.md") ?? "";
    expect(text).toMatch(
      /- <span id="big"><\/span>\[Big\]\(architecture\/big-part-1\.md\): Big opens in prose\.\n {2}- In \d+ parts: \[1\]\(architecture\/big-part-1\.md\), \[2\]\(architecture\/big-part-2\.md\)/,
    );
    expect(text).not.toContain("part 2 of");
  });

  it("gives each section's old id on its line, once, so an old link to the section lands there", () => {
    const cut = buildRepositoryPages(
      new Map([
        [
          ARCH.source,
          `# T\n\n## Big\n\n| N | W |\n| - | - |\n${Array.from({ length: 20 }, (_, i) => `| \`r${i}\` | ${"y".repeat(30)} |`).join("\n")}\n`,
        ],
      ]),
      [ARCH],
      400,
    );
    const text = cut.files.get("architecture.md") ?? "";
    expect(text.match(/<span id="big">/g)).toHaveLength(1);
    expect(text).toContain(
      '<span id="big"></span>[Big](architecture/big-part-1.md)',
    );
  });

  it("gives an anchor on a heading that two sections share to the first one", () => {
    const twice = buildRepositoryPages(
      new Map([
        [
          ARCH.source,
          "# T\n\n## A\n\n### Same\n\nx\n\n## B\n\n### Same\n\ny\n\n## C\n\n[link](#same)\n",
        ],
      ]),
      [ARCH],
    );
    expect(twice.files.get("architecture/c.md")).toContain("[link](a.md#same)");
  });

  it("gives a section that is only a table a line with no description", () => {
    const single = buildRepositoryPages(
      new Map([
        [ARCH.source, "# T\n\n## S\n\n| X | Y |\n| - | - |\n| `only` | 1 |\n"],
      ]),
      [ARCH],
    );
    expect(single.files.get("architecture.md")).toContain(
      '- <span id="s"></span>[S](architecture/s.md)\n',
    );
  });

  it("keeps the text before the first section, with its links relinked", () => {
    expect(overview).toContain("## About this document");
    expect(overview).toContain(
      "[the tokens](design/tokens.md) and [the design](design.md)",
    );
    expect(overview).toContain("### How it builds");
    expect(overview).toContain("[layers](architecture/layers-and-rules.md)");
    expect(overview).toContain("[how](architecture.md#how-it-builds)");
  });

  it("has no about section when the document has no text before its first section", () => {
    expect(page("design.md")).not.toContain("About this document");
  });
});

describe("a part page", () => {
  const ports = page("architecture/ports.md");
  const layers = page("architecture/layers-and-rules.md");

  it("has front matter, says where it belongs, and leaves the section's heading to the title", () => {
    expect(ports).toContain('title: "Ports"\n');
    expect(ports).toContain('sidebar_label: "Ports"\n');
    expect(ports).toContain('description: "Ports, in Architecture."\n');
    expect(ports).toContain(
      `Part of [Architecture](../architecture.md), which is built from [ARCHITECTURE.md](${BLOB}ARCHITECTURE.md)`,
    );
    expect(ports).not.toContain("## Ports");
  });

  it("moves the headings below the section's up one level", () => {
    expect(ports).toContain("\n## The detail\n");
    expect(ports).not.toContain("### The detail");
  });

  it("rewrites a link to a heading to the page that holds it, and one to a section to its page", () => {
    expect(ports).toContain("[layers](layers-and-rules.md)");
    expect(ports).toContain("[the detail](ports.md#the-detail)");
    expect(layers).toContain("[ports](ports.md)");
  });

  it("points a link to a guide two folders up and to a file on the repository", () => {
    expect(layers).toContain(
      "[a guide](../../guides/extending.md#add-a-basemap)",
    );
    expect(layers).toContain(`[a file](${BLOB}packages/web/src/x.ts)`);
  });

  it("points a link into the other document at the page that holds the heading", () => {
    const design = page("design/tokens.md");
    expect(design).toContain(
      "[architecture](../architecture/ports.md#the-detail)",
    );
    expect(design).toContain("[it](../architecture/layers-and-rules.md)");
  });

  it("leaves a link inside a code span as written", () => {
    const spanned = buildRepositoryPages(
      new Map([
        [ARCH.source, "# T\n\n## A\n\nUse `[a](packages/x.ts)` here.\n"],
      ]),
      [ARCH],
    );
    expect(spanned.files.get("architecture/a.md")).toContain(
      "`[a](packages/x.ts)`",
    );
  });

  it("marks a ts block no-check, because it is repository documentation and not a site snippet", () => {
    expect(layers).toContain("```ts no-check\nconst a = 1;");
  });

  it("repeats a table's header in a part that starts inside the table", () => {
    const cut = buildRepositoryPages(
      new Map([
        [
          ARCH.source,
          `# T\n\n## Big\n\n| N | W |\n| - | - |\n${Array.from({ length: 20 }, (_, i) => `| \`r${i}\` | ${"y".repeat(30)} |`).join("\n")}\n`,
        ],
      ]),
      [ARCH],
      400,
    );
    const second = cut.files.get("architecture/big-part-2.md") ?? "";
    expect(second).toContain("| N | W |\n| - | - |\n| `r");
    expect(second).toContain('title: "Big (part 2 of ');
    expect(second).toContain('sidebar_label: "Big (2 of ');
  });
});

describe("the sidebar entries", () => {
  it("make a category for each document, linked to its overview and listing its parts in order", () => {
    expect(pages.sidebar).toEqual([
      {
        type: "category",
        label: "Architecture",
        link: { type: "doc", id: "generated/architecture" },
        items: [
          "generated/architecture/layers-and-rules",
          "generated/architecture/ports",
        ],
      },
      {
        type: "category",
        label: "Design system",
        link: { type: "doc", id: "generated/design" },
        items: ["generated/design/tokens"],
      },
    ]);
  });
});

describe("the documents rendered on the site", () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const real = buildRepositoryPages(
    new Map(
      REPOSITORY_DOCS.map((doc) => [
        doc.source,
        readFileSync(`${root}${doc.source}`, "utf8"),
      ]),
    ),
  );

  it("name two files of the repository and give each page a title and description", () => {
    expect(REPOSITORY_DOCS.map((doc) => doc.source)).toEqual([
      "ARCHITECTURE.md",
      "DESIGN.md",
    ]);
    for (const doc of REPOSITORY_DOCS) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.description.length).toBeGreaterThan(0);
      expect(doc.intro).not.toMatch(/^This page is for |By the end you/);
    }
  });

  it("are in the sidebar, with the page of each part, and no other generated page is", () => {
    const listed = new Set(sidebarDocIds(sidebar));
    const generated = [...real.files.keys()].map(
      (name) => `generated/${name.replace(/\.md$/, "")}`,
    );
    for (const id of generated) {
      expect(listed.has(id)).toBe(true);
    }
    expect(
      [...listed].filter((id) => id.startsWith("generated/")).sort(),
    ).toEqual(generated.sort());
  });

  it("keep the built Markdown copy of every part within the ceiling and its allowance, with room to spare", () => {
    const sources = [...real.files]
      .filter(([name]) => name.endsWith(".md"))
      .map(([name, text]) =>
        parseDocSource(`generated/${name.replace(/\.md$/, "")}`, text),
      );
    const guides = new Set(
      [...real.files.values()].flatMap((text) =>
        [...text.matchAll(/\]\(\.\.\/(?:\.\.\/)?guides\/([\w-]+)\.md/g)].map(
          (match) => match[1] ?? "",
        ),
      ),
    );
    const stubs = [...guides].map((name) =>
      parseDocSource(
        `guides/${name}`,
        `---\ntitle: ${name}\ndescription: A guide.\n---\n`,
      ),
    );
    const largest = Math.max(
      ...sources
        .filter((source) => source.id.split("/").length === 3)
        .map((source) =>
          Buffer.byteLength(
            copyText(source, [...sources, ...stubs], COPY_CONTEXT),
          ),
        ),
    );
    const margin = PART_CEILING + PART_COPY_ALLOWANCE - largest;
    expect(margin).toBeGreaterThan(PART_COPY_ALLOWANCE / 2);
  });

  it("describe a section in each overview as a short plain sentence, never a table, code or a size", () => {
    for (const doc of REPOSITORY_DOCS) {
      const overview = real.files.get(doc.output) ?? "";
      const lines = overview
        .split("\n")
        .filter((line) => line.startsWith("- <span id="));
      expect(lines.length).toBeGreaterThan(5);
      for (const line of lines) {
        const description = line.split("): ")[1] ?? "";
        expect(description, line).not.toMatch(/[|`]|^Table rows?\b/);
        expect(description.length, line).toBeLessThanOrEqual(120);
      }
      expect(overview).not.toMatch(/\(\d+\.\d KB\)/);
    }
  });

  it("have a link from each overview to every one of its parts", () => {
    for (const doc of REPOSITORY_DOCS) {
      const overview = real.files.get(doc.output) ?? "";
      const folder = doc.output.replace(/\.md$/, "");
      const parts = [...real.files.keys()].filter((name) =>
        name.startsWith(`${folder}/`),
      );
      expect(parts.length).toBeGreaterThan(5);
      for (const part of parts) {
        expect(overview).toContain(`](${part})`);
      }
    }
  });

  it("link the visual design page from the Design system overview", () => {
    expect(real.files.get("design.md")).toContain("](../design-visual.md)");
  });

  it("leave no link between the documents pointing at a page that was not made", () => {
    expect(linksToMissingPages(real.files)).toEqual([]);
  });

  it("find a link to a page that is not made, such as a mistyped one", () => {
    const files = new Map([
      ["design.md", "See [it](../design-visul.md) and [that](tokens/x.md)."],
      ["design/tokens.md", "Back to [overview](../design.md)."],
    ]);
    expect(linksToMissingPages(files)).toEqual([
      "design.md -> ../design-visul.md",
      "design.md -> tokens/x.md",
    ]);
  });

  it("allow a link out of the generated folder only to the visual design page, which the sidebar lists", () => {
    expect(OTHER_GENERATED_PAGES).toEqual(["../design-visual.md"]);
    expect(sidebarDocIds(sidebar)).toContain("design-visual");
  });
});
