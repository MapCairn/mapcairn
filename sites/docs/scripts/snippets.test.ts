// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractSnippets,
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

  it(
    "compiles every checked block against the built packages",
    () => {
      expect(typeCheckSnippets(REPO, snippets)).toEqual([]);
    },
    COMPILE_TIMEOUT_MS,
  );
});
