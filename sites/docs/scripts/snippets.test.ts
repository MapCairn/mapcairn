// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractSnippets,
  sourceFindings,
  typeCheckSnippets,
  unmarkedFindings,
} from "./snippets";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const DOCS = join(REPO, "sites/docs/docs");

/** Each compile reads the SDK's built types and the engine's, which can pass vitest's 5 s default. */
const COMPILE_TIMEOUT_MS = 300_000;

/** A page with front matter, one checked block and one that is not checked. */
const PAGE = [
  "---",
  "title: A page",
  "---",
  "# A page",
  "",
  "```tsx check",
  'import { MapView } from "@mapcairn/sdk";',
  "export const view = MapView;",
  "```",
  "",
  "```ts no-check",
  "this is only an outline",
  "```",
  "",
  "```bash",
  "npm install",
  "```",
  "",
  "```ts",
  "const unmarked = 1;",
  "```",
  "",
].join("\n");

/** Every Markdown page under `dir`, as a path from the docs folder and its text. */
function pagesUnder(dir: string): { page: string; markdown: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "api" ? [] : pagesUnder(path);
    }
    return entry.name.endsWith(".md")
      ? [{ page: relative(DOCS, path), markdown: readFileSync(path, "utf8") }]
      : [];
  });
}

describe("extractSnippets", () => {
  const snippets = extractSnippets("a.md", PAGE);

  it("finds each ts and tsx block with its page, first code line and marker", () => {
    expect(
      snippets.map(({ page, line, language, mark }) => ({
        page,
        line,
        language,
        mark,
      })),
    ).toEqual([
      { page: "a.md", line: 7, language: "tsx", mark: "check" },
      { page: "a.md", line: 12, language: "ts", mark: "no-check" },
      { page: "a.md", line: 20, language: "ts", mark: null },
    ]);
  });

  it("keeps the code as written", () => {
    expect(snippets[0]?.code).toBe(
      'import { MapView } from "@mapcairn/sdk";\nexport const view = MapView;',
    );
  });

  it("ignores blocks in other languages", () => {
    expect(snippets.some(({ code }) => code === "npm install")).toBe(false);
  });
});

describe("unmarkedFindings", () => {
  it("names a ts block that is neither checked nor marked no-check", () => {
    expect(unmarkedFindings(extractSnippets("a.md", PAGE))).toEqual([
      'a.md:19 has a ts block marked neither "check" nor "no-check".',
    ]);
  });
});

describe("sourceFindings", () => {
  const SPDX = [
    "// SPDX-License-Identifier: AGPL-3.0-only",
    "// Copyright MapCairn contributors",
  ];
  const SOURCE = [
    ...SPDX,
    "const a = 1;",
    "const b = 2;",
    "export { a, b };",
    "",
  ];

  const SOURCE_INFO = 'source="examples/x/main.ts"';
  const WHOLE_INFO = `whole ${SOURCE_INFO}`;

  /** A scratch repository holding `examples/x/main.ts`, and a page quoting it. */
  function check(quoted: string[], info = SOURCE_INFO, source = SOURCE) {
    const repo = mkdtempSync(join(tmpdir(), "mapcairn-docs-source-"));
    try {
      mkdirSync(join(repo, "examples/x"), { recursive: true });
      writeFileSync(join(repo, "examples/x/main.ts"), source.join("\n"));
      const snippets = extractSnippets(
        "guides/quote.md",
        ["# Quote", "", `\`\`\`ts no-check ${info}`, ...quoted, "```", ""].join(
          "\n",
        ),
      );
      return sourceFindings(repo, snippets);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }

  it("reads the source path off the fence", () => {
    const [snippet] = extractSnippets(
      "a.md",
      [
        '```ts no-check source="examples/x/main.ts"',
        "const a = 1;",
        "```",
      ].join("\n"),
    );
    expect(snippet?.source).toBe("examples/x/main.ts");
    expect(extractSnippets("a.md", PAGE)[0]?.source).toBeNull();
  });

  it("checks a block in a language other than ts and tsx when it names a source, and never compiles or demands a mark of it", () => {
    const snippets = extractSnippets(
      "a.md",
      ['```html source="examples/x/index.html"', "<p>Hi</p>", "```"].join("\n"),
    );
    expect(snippets).toHaveLength(1);
    expect(snippets[0]?.language).toBe("html");
    expect(unmarkedFindings(snippets)).toEqual([]);
  });

  it("passes a whole block that matches the file exactly", () => {
    expect(check(SOURCE.slice(0, -1), WHOLE_INFO)).toEqual([]);
  });

  it("passes a whole block without the file's two-line licence header", () => {
    expect(check(SOURCE.slice(2, -1), WHOLE_INFO)).toEqual([]);
  });

  it("fails a whole block when its source gains a line and leaves an unmarked block unchanged", () => {
    const quoted = SOURCE.slice(2, -1);
    const changed = [...SOURCE.slice(0, -1), "const c = 3;", ""];
    expect(check(quoted, WHOLE_INFO, changed)).toEqual([
      expect.stringMatching(/^guides\/quote\.md:3 .*examples\/x\/main\.ts/),
    ]);
    expect(check(quoted, SOURCE_INFO, changed)).toEqual([]);
  });

  it("fails a whole block that omits lines other than the licence header", () => {
    expect(
      check(["const a = 1;"], WHOLE_INFO, ["// one", "// two", "const a = 1;"]),
    ).toHaveLength(1);
  });

  it("passes a block of whole lines from the middle of the file", () => {
    expect(check(["const b = 2;"])).toEqual([]);
  });

  it("fails a block whose text is not in the file, naming the page and line", () => {
    expect(check(["const a = 99;"])).toEqual([
      expect.stringMatching(/^guides\/quote\.md:3 .*examples\/x\/main\.ts/),
    ]);
  });

  it("fails a block that joins two lines the file keeps apart", () => {
    expect(check(["const a = 1;", "export { a, b };"])).toHaveLength(1);
  });

  it("fails a block that names a file that does not exist", () => {
    expect(check(["const a = 1;"], 'source="examples/x/missing.ts"')).toEqual([
      expect.stringMatching(/missing\.ts/),
    ]);
  });

  it("fails an empty block", () => {
    expect(check([])).toHaveLength(1);
    expect(check([], WHOLE_INFO)).toHaveLength(1);
  });
});

describe("typeCheckSnippets", () => {
  it(
    "passes a snippet that compiles against the built packages",
    () => {
      const [good] = extractSnippets("a.md", PAGE);
      expect(typeCheckSnippets(REPO, good ? [good] : [])).toEqual([]);
    },
    COMPILE_TIMEOUT_MS,
  );

  it(
    "fails a snippet with a wrong import, naming the page and line",
    () => {
      const broken = extractSnippets(
        "guides/broken.md",
        [
          "# Broken",
          "",
          "```tsx check",
          'import { NoSuchExport } from "@mapcairn/sdk";',
          "export const value = NoSuchExport;",
          "```",
        ].join("\n"),
      );
      const findings = typeCheckSnippets(REPO, broken);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toMatch(/^guides\/broken\.md:4 .*NoSuchExport/);
    },
    COMPILE_TIMEOUT_MS,
  );

  it(
    "reports an error against its own line in the page",
    () => {
      const broken = extractSnippets(
        "b.md",
        [
          "",
          "",
          "```ts check",
          "const a = 1;",
          "const b: string = a;",
          "```",
        ].join("\n"),
      );
      expect(typeCheckSnippets(REPO, broken)[0]).toMatch(/^b\.md:5 /);
    },
    COMPILE_TIMEOUT_MS,
  );
});

describe("the documentation's own snippets", () => {
  const snippets = pagesUnder(DOCS).flatMap(({ page, markdown }) =>
    extractSnippets(page, markdown),
  );

  it("marks every ts and tsx block", () => {
    expect(unmarkedFindings(snippets)).toEqual([]);
  });

  it("quotes the examples' source as it is", () => {
    expect(sourceFindings(REPO, snippets)).toEqual([]);
  });

  it(
    "compiles every checked block against the built packages",
    () => {
      expect(typeCheckSnippets(REPO, snippets)).toEqual([]);
    },
    COMPILE_TIMEOUT_MS,
  );
});
