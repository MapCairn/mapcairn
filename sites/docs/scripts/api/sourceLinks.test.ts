// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { indexSource } from "./sourceLinks";

const roots: string[] = [];

/** A repository folder with a package's `src`, holding the files given. */
function repository(files: Record<string, string>): {
  root: string;
  src: string;
} {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-source-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, "packages", "pkg", "src", path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, text);
  }
  return { root, src: join(root, "packages", "pkg", "src") };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("indexSource", () => {
  it("finds each kind of exported declaration with its file and line", () => {
    const { root, src } = repository({
      "a.ts": [
        "export function one(): void {}",
        "export const TWO = 2;",
        "export interface Three {}",
        "export type Four = string;",
        "export class Five {}",
        "export abstract class Six {}",
        "export async function seven(): Promise<void> {}",
        "export enum Eight {}",
        "const hidden = 1;",
      ].join("\n"),
    });
    const found = indexSource(root, src);
    expect(found.get("one")).toMatchObject({
      file: "packages/pkg/src/a.ts",
      line: 1,
    });
    expect(found.get("Eight")?.line).toBe(8);
    for (const name of ["TWO", "Three", "Four", "Five", "Six", "seven"]) {
      expect(found.has(name)).toBe(true);
    }
    expect(found.has("hidden")).toBe(false);
  });

  it("reads a nested folder, in .tsx too, and skips tests and declaration files", () => {
    const { root, src } = repository({
      "ui/Panel.tsx": "export function Panel() { return null; }",
      "ui/Panel.test.tsx": "export function fromTest() {}",
      "types.d.ts": "export declare function ambient(): void;",
    });
    const found = indexSource(root, src);
    expect(found.get("Panel")?.file).toBe("packages/pkg/src/ui/Panel.tsx");
    expect(found.has("fromTest")).toBe(false);
    expect(found.has("ambient")).toBe(false);
  });

  it("keeps the first place a name is declared, as for an overload", () => {
    const { root, src } = repository({
      "a.ts":
        "export function f(a: string): void;\nexport function f(a: number): void;\nexport function f(): void {}",
    });
    expect(indexSource(root, src).get("f")?.line).toBe(1);
  });

  it("finds a namespace re-export, which the API model describes without a comment", () => {
    const { root, src } = repository({
      "index.ts":
        '/**\n * Every value as data.\n *\n * @public\n */\nexport * as values from "./values";',
    });
    const place = indexSource(root, src).get("values");
    expect(place?.line).toBe(6);
    expect(place?.comment).toBe("Every value as data.");
  });

  it("takes the comment above a declaration up to its first tag", () => {
    const { root, src } = repository({
      "a.ts":
        "/**\n * Adds.\n * More.\n * @param a - x\n */\nexport function add(a: number) {}\n\nexport function bare() {}",
    });
    const found = indexSource(root, src);
    expect(found.get("add")?.comment).toBe("Adds.\nMore.");
    expect(found.get("bare")?.comment).toBe("");
  });
});
