// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildContext,
  findDeadReferences,
  main,
  parseArguments,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/docs-refs.mjs";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/agents/docs-refs.mjs",
);
const CHILD_TIMEOUT_MS = 30_000;

const CONTENTS: Record<string, string> = {
  "README.md": "",
  "docs/guides/releasing.md": "",
  "docs/guides/sibling.md": "",
  "packages/web/src/app/root.tsx": "",
  "scripts/agents/port.mjs": "",
  "package.json": JSON.stringify({ scripts: { lint: "x", "test:e2e": "x" } }),
  "packages/web/package.json": JSON.stringify({
    name: "@mapcairn/web",
    scripts: { dev: "x", e2e: "x" },
  }),
  "sites/docs/package.json": JSON.stringify({
    name: "@mapcairn/docs",
    scripts: { build: "x" },
  }),
};
const CONTEXT = buildContext(Object.keys(CONTENTS), (p: string) => CONTENTS[p]);

function dead(text: string, file = "README.md"): string[] {
  return findDeadReferences(file, text, CONTEXT).map(
    (d: { line: number; ref: string }) => `${d.line} ${d.ref}`,
  );
}

describe("findDeadReferences", () => {
  it("accepts a path, a directory, a link and a script that exist", () => {
    const text = [
      "See `packages/web/src/app/root.tsx` and `scripts/agents/`.",
      "Run `npm run lint`, then [the guide](docs/guides/releasing.md#top).",
      "Run `node scripts/agents/port.mjs 5173` and `npm run dev -w @mapcairn/web`.",
    ].join("\n");
    expect(dead(text)).toEqual([]);
  });

  it("reports a missing path with its line, also inside a command", () => {
    const text =
      "ok\nSee `packages/web/src/app/nope.tsx:12`.\nRun `node scripts/agents/gone.mjs`.";
    expect(dead(text)).toEqual([
      "2 packages/web/src/app/nope.tsx",
      "3 scripts/agents/gone.mjs",
    ]);
  });

  it("resolves a link and a path relative to the document's folder", () => {
    expect(dead("[x](releasing.md)", "docs/guides/other.md")).toEqual([]);
    expect(dead("[x](missing.md)", "docs/guides/other.md")).toEqual([
      "1 missing.md",
    ]);
    expect(dead("`../guides/sibling.md`", "docs/guides/x.md")).toEqual([]);
    expect(dead("[x](README.md)", "docs/guides/x.md")).toEqual(["1 README.md"]);
    expect(
      dead("[x](/README.md) [y](../../README.md)", "docs/guides/x.md"),
    ).toEqual([]);
    expect(dead("`docs/sibling.md`", "docs/guides/x.md")).toEqual([
      "1 docs/sibling.md",
    ]);
  });

  it("checks a root document by its exact name", () => {
    expect(dead("`README.md`")).toEqual([]);
    expect(dead("`MISSING.md`")).toEqual(["1 MISSING.md"]);
  });

  it("matches letter case exactly", () => {
    expect(dead("`docs/Guides/releasing.md`")).toEqual([
      "1 docs/Guides/releasing.md",
    ]);
    expect(dead("`scripts/Agents/port.mjs`")).toEqual([
      "1 scripts/Agents/port.mjs",
    ]);
  });

  it("accepts a path written relative to a package", () => {
    expect(dead("`src/app/root.tsx` `src/app/gone.tsx`")).toEqual([
      "1 src/app/gone.tsx",
    ]);
  });

  it("reports an npm script that the root or the named workspace lacks", () => {
    const text = [
      "`npm run lint`",
      "`npm run nothing`",
      "`npm run e2e -w @mapcairn/web`",
      "`npm run lint -w @mapcairn/web`",
    ].join("\n");
    expect(dead(text)).toEqual([
      "2 npm run nothing",
      "4 npm run lint -w @mapcairn/web",
    ]);
  });

  it("checks an npm script named for a site workspace", () => {
    const text = [
      "`npm run build -w @mapcairn/docs`",
      "`npm run nothing -w @mapcairn/docs`",
    ].join("\n");
    expect(dead(text)).toEqual(["2 npm run nothing -w @mapcairn/docs"]);
  });

  it("checks fenced code blocks line by line", () => {
    const text = [
      "```bash",
      "npm run lint",
      "npm run nonexist",
      "node scripts/agents/gone.mjs",
      "```",
      "`npm run lint`",
    ].join("\n");
    expect(dead(text)).toEqual([
      "3 npm run nonexist",
      "4 scripts/agents/gone.mjs",
    ]);
  });

  it("reads Windows separators as forward slashes", () => {
    expect(
      dead("`docs\\guides\\releasing.md` `docs\\guides\\gone.md`"),
    ).toEqual(["1 docs/guides/gone.md"]);
    expect(dead("[x](docs\\guides\\releasing.md)")).toEqual([]);
  });

  it("ignores placeholders, urls, routes, scopes and generated folders", () => {
    const text =
      "`path/to/file.test.ts` `https://example.com/a/b` `/map` `@mapcairn/core` `packages/web/dist/x.js` `docs/<name>.md` `text/html`";
    expect(dead(text)).toEqual([]);
  });
});

describe("parseArguments", () => {
  it("separates the commit from the files and fixes separators", () => {
    expect(parseArguments(["--ref", "abc", "docs\\a.md", "b.md"])).toEqual({
      ref: "abc",
      files: ["docs/a.md", "b.md"],
    });
    expect(parseArguments(["a.md"])).toEqual({
      ref: undefined,
      files: ["a.md"],
    });
  });
});

describe("main", () => {
  function sourceFor(document: string) {
    return {
      files: ["package.json", "doc.md"],
      read: (file: string) => {
        if (file === "package.json") {
          return JSON.stringify({ scripts: { lint: "x" } });
        }
        if (file === "doc.md") {
          return document;
        }
        throw new Error(`missing ${file}`);
      },
    };
  }

  function runMain(args: string[], source = () => sourceFor("`npm run lint`")) {
    const output: string[] = [];
    const errors: string[] = [];
    const code = main(
      args,
      source,
      (line: string) => output.push(line),
      (line: string) => errors.push(line),
    );
    return { code, output, errors };
  }

  it("returns 0 and reports when every reference resolves", () => {
    expect(runMain(["doc.md"])).toEqual({
      code: 0,
      output: ["no dead references"],
      errors: [],
    });
  });

  it("returns 1, prints fifty dead references and counts the rest", () => {
    const result = runMain(["doc.md"], () =>
      sourceFor("`npm run nothing`\n".repeat(53)),
    );

    expect(result.code).toBe(1);
    expect(result.output[0].split("\n")).toHaveLength(50);
    expect(result.output[1]).toBe("3 more");
    expect(result.errors).toEqual([]);
  });

  it("prints exactly fifty dead references with no count of the rest", () => {
    const result = runMain(["doc.md"], () =>
      sourceFor("`npm run nothing`\n".repeat(50)),
    );

    expect(result.code).toBe(1);
    expect(result.output).toHaveLength(1);
    expect(result.output[0].split("\n")).toHaveLength(50);
  });

  it("returns 2 for usage errors without reading the repository", () => {
    let called = false;
    const result = runMain([], () => {
      called = true;
      return sourceFor("");
    });

    expect(result.code).toBe(2);
    expect(called).toBe(false);
    expect(result.errors[0]).toContain("usage:");
    expect(runMain(["--ref"], () => sourceFor("")).code).toBe(2);
  });

  it("returns 2 with the first line of a read failure", () => {
    const result = runMain(["missing.md"]);

    expect(result.code).toBe(2);
    expect(result.output).toEqual([]);
    expect(result.errors).toEqual(["docs-refs: missing missing.md"]);
  });
});

describe("the command", () => {
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

  function git(...args: string[]): void {
    spawnSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
      {
        cwd: root,
        timeout: CHILD_TIMEOUT_MS,
      },
    );
  }

  function run(...args: string[]) {
    return spawnSync("node", [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });
  }

  function repo(): void {
    root = mkdtempSync(path.join(tmpdir(), "docs-refs-"));
    git("init", "-q");
    put("package.json", JSON.stringify({ scripts: { lint: "x" } }));
    put(
      "packages/a/package.json",
      JSON.stringify({ name: "@x/a", scripts: { build: "x" } }),
    );
    put(
      "doc.md",
      "`npm run lint` `npm run build -w @x/a` `npm run build` `GONE.md`\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "first");
  }

  it("reads workspace scripts and tracked files from the working tree", () => {
    repo();
    const result = run("doc.md");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("doc.md:1 - npm run build");
    expect(result.stdout).not.toContain("npm run build -w");
    put("GONE.md", "");
    expect(run("doc.md").stdout).not.toContain("GONE");
  });

  it("reads the files and documents of a commit with --ref", () => {
    repo();
    put("doc.md", "`LATER.md`\n");
    git("commit", "-q", "-am", "second");
    const first = spawnSync("git", ["rev-parse", "HEAD~1"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim();
    expect(run("--ref", first, "doc.md").stdout).toContain(
      "doc.md:1 - npm run build",
    );
    expect(run("--ref", "HEAD", "doc.md").stdout).toContain("LATER.md");
  });

  it("gives a one-line error and exit 2 for a missing file or no files", () => {
    repo();
    const missing = run("nope.md");
    expect(missing.status).toBe(2);
    expect(missing.stderr.trim().split("\n")).toHaveLength(1);
    expect(run().status).toBe(2);
    expect(run("--ref").status).toBe(2);
  });

  it("prints at most fifty references and counts the rest", () => {
    repo();
    put("many.md", `${"`npm run nothing`\n".repeat(53)}`);
    const result = run("many.md");
    expect(result.stdout.trim().split("\n")).toHaveLength(51);
    expect(result.stdout).toContain("3 more");
  });
});
