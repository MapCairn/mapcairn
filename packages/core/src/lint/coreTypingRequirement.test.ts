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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The declarations of `@mapcairn/core` name the platform types `Blob` and
 * `AbortSignal` and declare neither, so a project needs them from its `lib`
 * (`dom`) or from `@types/node`. The README says so. These tests emit the
 * declarations the package publishes and check them the way an outside
 * project would, with `skipLibCheck` off and no ambient types, so the README
 * cannot drift from what a consumer sees.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const TSC = path.join(REPO, "node_modules", "typescript", "lib", "tsc.js");
const CORE_README = path.join(REPO, "packages", "core", "README.md");

/**
 * The scratch folder sits under `node_modules` so the declarations resolve
 * `@types/geojson` the way an installed package does.
 */
const CACHE = path.join(REPO, "node_modules", ".cache");

/** The platform types the declarations use and do not declare. */
const GLOBALS = ["AbortSignal", "Blob"];

let work = "";
let declarations = "";

/** Runs the repository's `tsc` on a config and returns its diagnostic lines. */
function tsc(config: Record<string, unknown>, name: string): string[] {
  const file = path.join(work, name);
  writeFileSync(file, JSON.stringify(config));
  const run = spawnSync(process.execPath, [TSC, "-p", file], {
    encoding: "utf8",
  });
  return run.stdout.split("\n").filter((line) => line.includes("error TS"));
}

/** Type-checks the emitted declarations the way a consumer's project does. */
function checkAs(lib: string[], types: string[]): string[] {
  return tsc(
    {
      compilerOptions: {
        strict: true,
        target: "es2022",
        lib,
        types,
        typeRoots: [path.join(REPO, "node_modules", "@types")],
        module: "esnext",
        moduleResolution: "bundler",
        noEmit: true,
        skipLibCheck: false,
      },
      files: [path.join(declarations, "index.d.ts")],
    },
    `check-${lib.join("-")}-${types.join("-")}.json`,
  );
}

beforeAll(() => {
  mkdirSync(CACHE, { recursive: true });
  work = mkdtempSync(path.join(CACHE, "core-typing-"));
  declarations = path.join(work, "declarations");
  const emitted = tsc(
    {
      compilerOptions: {
        strict: true,
        target: "es2022",
        lib: ["es2022", "dom"],
        types: [],
        module: "esnext",
        moduleResolution: "bundler",
        declaration: true,
        emitDeclarationOnly: true,
        outDir: declarations,
        rootDir: path.join(REPO, "packages", "core", "src"),
        skipLibCheck: true,
        resolveJsonModule: true,
        esModuleInterop: true,
      },
      files: [path.join(REPO, "packages", "core", "src", "index.ts")],
    },
    "emit.json",
  );
  expect(emitted).toEqual([]);
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("the declarations of @mapcairn/core", () => {
  it("fail in a project with neither the dom library nor @types/node, naming only Blob and AbortSignal", () => {
    const errors = checkAs(["es2022"], []);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error).toMatch(/TS2304: Cannot find name '(Blob|AbortSignal)'/);
    }
    for (const name of GLOBALS) {
      expect(errors.join("\n")).toContain(`'${name}'`);
    }
  });

  it("compile with the dom library", () => {
    expect(checkAs(["es2022", "dom"], [])).toEqual([]);
  });

  it("compile with @types/node and no dom library", () => {
    expect(checkAs(["es2022"], ["node"])).toEqual([]);
  });
});

describe("the README of @mapcairn/core", () => {
  const readme = readFileSync(CORE_README, "utf8");

  it("names the platform types and the two ways to provide them", () => {
    for (const name of GLOBALS) {
      expect(readme).toContain(`\`${name}\``);
    }
    expect(readme).toContain('`"dom"`');
    expect(readme).toContain("`@types/node`");
  });
});
