// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  findDeadReferences,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/docs-refs.mjs";

const FILES = new Set([
  "README.md",
  "docs/guides/extending.md",
  "packages/web/src/app/root.tsx",
  "scripts/agents/port.mjs",
]);
const CONTEXT = {
  exists: (p: string) =>
    FILES.has(p) || [...FILES].some((f) => f.startsWith(`${p}/`)),
  isInside: (p: string) => [...FILES].some((f) => f.endsWith(`/${p}`)),
  topLevel: new Set(["docs", "packages", "scripts", "README.md"]),
  scripts: {
    root: new Set(["lint", "test:e2e"]),
    workspaces: new Map([["@mapcairn/web", new Set(["dev", "e2e"])]]),
  },
};

function dead(text: string, file = "README.md"): string[] {
  return findDeadReferences(file, text, CONTEXT).map(
    (d: { line: number; ref: string }) => `${d.line} ${d.ref}`,
  );
}

describe("findDeadReferences", () => {
  it("accepts a path, a directory, a link and a script that exist", () => {
    const text = [
      "See `packages/web/src/app/root.tsx` and `scripts/agents/`.",
      "Run `npm run lint`, then [the guide](docs/guides/extending.md#top).",
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

  it("accepts a path written relative to a package", () => {
    expect(dead("`src/app/root.tsx` `src/app/gone.tsx`")).toEqual([
      "1 src/app/gone.tsx",
    ]);
  });

  it("reports a link that does not resolve, relative to the file", () => {
    expect(dead("[x](extending.md)", "docs/guides/other.md")).toEqual([]);
    expect(dead("[x](missing.md)", "docs/guides/other.md")).toEqual([
      "1 missing.md",
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

  it("ignores placeholders, urls, routes, scopes and generated folders", () => {
    const text =
      "`path/to/file.test.ts` `https://example.com/a/b` `/map` `@mapcairn/core` `packages/web/dist/x.js` `docs/<name>.md` `text/html`";
    expect(dead(text)).toEqual([]);
  });
});
