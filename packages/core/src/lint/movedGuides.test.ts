// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  findMovedGuideReferences,
  isChecked,
  main,
  readMovedGuides,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/moved-guides-check.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const SCRIPT = path.join(REPO, "scripts/moved-guides-check.mjs");
const MOVED = ["extending", "public-api"];
/** Spawning Node can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;

function found(text: string, file = "README.md"): string[] {
  return findMovedGuideReferences(file, text, MOVED).map(
    (reference: { line: number; guide: string }) =>
      `${reference.line} ${reference.guide}`,
  );
}

describe("findMovedGuideReferences", () => {
  it.each([
    ["a code span", "See `docs/guides/extending.md`."],
    ["a relative link", "[x](../../docs/guides/extending.md#top)"],
    [
      "a repository link",
      "[x](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/extending.md)",
    ],
    ["a path without the extension", "Read docs/guides/extending for more."],
    ["a path in a comment", "// see docs/guides/public-api.md, the rules"],
  ])("reports %s", (_name, line) => {
    expect(found(`first\n${line}\n`)).toHaveLength(1);
    expect(found(`first\n${line}\n`)[0]).toMatch(/^2 /);
  });

  it("accepts the guides that stayed, the new place and the site's address", () => {
    const text = [
      "`docs/guides/releasing.md` and `docs/guides/working-with-agents.md`",
      "`sites/docs/docs/guides/extending.md`",
      "https://docs.mapcairn.com/guides/extending/",
      "https://docs.mapcairn.com/guides/extending.md",
      "`docs/guides/extending-things.md`",
    ].join("\n");
    expect(found(text)).toEqual([]);
  });

  it("reads a bare sibling link only inside docs/guides", () => {
    expect(found("[x](extending.md)", "docs/guides/other.md")).toEqual([
      "1 extending",
    ]);
    expect(found("[x](./public-api.md#a)", "docs/guides/other.md")).toEqual([
      "1 public-api",
    ]);
    expect(found("[x](extending.md)", "README.md")).toEqual([]);
  });

  it("reports each moved guide on a line once", () => {
    expect(
      found("`docs/guides/extending.md` and `docs/guides/public-api.md`"),
    ).toEqual(["1 extending", "1 public-api"]);
  });
});

describe("isChecked", () => {
  it.each([
    "README.md",
    "docs/guides/releasing.md",
    "docs/plans/0017-documentation-site.md",
    ".claude/skills/land-pr/SKILL.md",
    "packages/web/src/product/productContent.ts",
    "scripts/release/plan.mjs",
    ".github/dependabot.yml",
  ])("reads %s", (file) => {
    expect(isChecked(file)).toBe(true);
  });

  it.each([
    "CHANGELOG.md",
    "scripts/moved-guides-check.mjs",
    "scripts/movedGuides.json",
    "packages/core/src/lint/movedGuides.test.ts",
    "packages/web/public/favicon.svg",
    "package-lock.json",
  ])("skips %s", (file) => {
    expect(isChecked(file)).toBe(false);
  });
});

describe("main", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  function put(file: string, text: string): void {
    const target = path.join(root as string, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }

  function fixture(files: Record<string, string>): void {
    root = mkdtempSync(path.join(tmpdir(), "moved-guides-"));
    put("scripts/movedGuides.json", JSON.stringify(MOVED));
    for (const [file, text] of Object.entries(files)) {
      put(file, text);
    }
  }

  function run(files: string[]) {
    const output: string[] = [];
    const errors: string[] = [];
    const code = main(
      (_command: string, args: string[]) => {
        if (args[0] === "rev-parse") {
          return `${root}\n`;
        }
        return `${files.join("\0")}\0`;
      },
      (line: string) => output.push(line),
      (line: string) => errors.push(line),
    );
    return { code, output, errors };
  }

  it("reads the moved-guide list from the repository root", () => {
    fixture({});
    expect(readMovedGuides(root)).toEqual(MOVED);
  });

  it("reports references from the tracked text files that still exist", () => {
    fixture({
      "README.md": "See docs/guides/extending.md.\n",
      "docs/guides/other.md": "[x](public-api.md)\n",
      "ignored.svg": "docs/guides/extending.md",
    });
    const result = run([
      "README.md",
      "docs/guides/other.md",
      "ignored.svg",
      "deleted.md",
      "scripts/movedGuides.json",
    ]);

    expect(result.code).toBe(1);
    expect(result.errors[0]).toContain("2 reference(s)");
    expect(result.errors[0]).toContain("README.md:1:");
    expect(result.errors[0]).toContain("docs/guides/other.md:1:");
    expect(result.errors[0]).not.toContain("ignored.svg");
    expect(result.output).toEqual([]);
  });

  it("returns 0 and counts the checked files when none reference a moved guide", () => {
    fixture({ "README.md": "https://docs.mapcairn.com/guides/extending/\n" });
    const result = run(["README.md", "scripts/movedGuides.json"]);

    expect(result).toEqual({
      code: 0,
      output: ["moved guides: 1 files checked, none point at a moved guide"],
      errors: [],
    });
  });
});

describe("the repository", () => {
  it("lists every moved guide as a page of the site and none in docs/guides", () => {
    const moved: string[] = JSON.parse(
      readFileSync(path.join(REPO, "scripts/movedGuides.json"), "utf8"),
    );
    expect(moved.length).toBeGreaterThan(0);
    for (const name of moved) {
      expect(() =>
        readFileSync(
          path.join(REPO, `sites/docs/docs/guides/${name}.md`),
          "utf8",
        ),
      ).not.toThrow();
      expect(() =>
        readFileSync(path.join(REPO, `docs/guides/${name}.md`), "utf8"),
      ).toThrow();
    }
  });

  it(
    "has no reference to a guide that moved",
    () => {
      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: REPO,
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
    CHILD_TIMEOUT_MS,
  );
});
