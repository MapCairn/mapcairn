// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { escapesPackage, specifiers } from "./imports.js";

const PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SOURCE = path.join(PACKAGE, "src");

function sourceFiles(): string[] {
  return readdirSync(SOURCE, { recursive: true })
    .map((file) => path.join(SOURCE, String(file)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
}

describe("specifiers", () => {
  it("finds static, side-effect, re-export and dynamic imports", () => {
    const text = [
      'import a from "x";',
      'import "y";',
      'export * from "z";',
      'const m = await import("w");',
      'const r = require("v");',
    ].join("\n");
    expect(specifiers(text)).toEqual(["x", "y", "z", "w", "v"]);
  });
});

describe("escapesPackage", () => {
  const file = path.join(SOURCE, "engine", "a.ts");
  it("flags workspace packages and paths above src", () => {
    expect(escapesPackage("@mapcairn/core", file, SOURCE)).toBe(true);
    expect(escapesPackage("../../../core/src/index.js", file, SOURCE)).toBe(
      true,
    );
  });
  it("allows relative paths inside src and npm packages", () => {
    expect(escapesPackage("./b.js", file, SOURCE)).toBe(false);
    expect(escapesPackage("../node/index.js", file, SOURCE)).toBe(false);
    expect(escapesPackage("robust-predicates", file, SOURCE)).toBe(false);
    expect(escapesPackage("node:fs", file, SOURCE)).toBe(false);
  });
});

describe("independence", () => {
  it("imports nothing from another workspace package", () => {
    const offenders = sourceFiles().flatMap((file) =>
      specifiers(readFileSync(file, "utf8"))
        .filter((specifier) => escapesPackage(specifier, file, SOURCE))
        .map((specifier) => `${path.relative(PACKAGE, file)}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it("declares no workspace package in its manifest", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PACKAGE, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    const declared = ["dependencies", "devDependencies", "peerDependencies"]
      .flatMap((key) => Object.keys(manifest[key] ?? {}))
      .filter((name) => name.startsWith("@mapcairn/"));
    expect(declared).toEqual([]);
  });
});
