// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { declaredLicence, isPermissive, productionTree } from "./licences.js";

const PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("isPermissive", () => {
  it.each([
    "MIT",
    "ISC",
    "BSD-3-Clause",
    "BSD-2-Clause",
    "Apache-2.0",
    "Unlicense",
    "CC0-1.0",
    "0BSD",
    "(MIT OR Apache-2.0)",
    "(MIT AND BSD-3-Clause)",
  ])("accepts %s", (expression) => {
    expect(isPermissive(expression)).toBe(true);
  });

  it.each([
    "AGPL-3.0-only",
    "AGPL-3.0-or-later",
    "GPL-2.0-only",
    "GPL-3.0-or-later",
    "LGPL-2.1",
    "(MIT OR GPL-3.0-only)",
    "(MIT AND AGPL-3.0-only)",
    "UNLICENSED",
    "SEE LICENSE IN LICENSE.txt",
    "CC-BY-NC-4.0",
    "",
  ])("rejects %s", (expression) => {
    expect(isPermissive(expression)).toBe(false);
  });
});

describe("declaredLicence", () => {
  it("reads a string and the legacy object form", () => {
    expect(declaredLicence({ license: "MIT" })).toBe("MIT");
    expect(declaredLicence({ license: { type: "ISC" } })).toBe("ISC");
    expect(declaredLicence({})).toBeUndefined();
  });
});

describe("productionTree", () => {
  const root = mkdtempSync(path.join(tmpdir(), "geolint-tree-"));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(directory: string, manifest: object): void {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify(manifest),
    );
  }

  it("walks dependencies recursively and ignores devDependencies", () => {
    const pkg = path.join(root, "pkg");
    write(pkg, {
      name: "pkg",
      dependencies: { a: "1.0.0" },
      devDependencies: { dev: "1.0.0" },
    });
    write(path.join(pkg, "node_modules", "a"), {
      name: "a",
      license: "MIT",
      dependencies: { b: "1.0.0" },
    });
    write(path.join(pkg, "node_modules", "b"), {
      name: "b",
      license: "GPL-3.0-only",
    });
    expect(productionTree(pkg)).toEqual([
      { name: "a", licence: "MIT" },
      { name: "b", licence: "GPL-3.0-only" },
    ]);
  });

  it("lists a package that two others depend on once", () => {
    const pkg = path.join(root, "diamond");
    write(pkg, { name: "diamond", dependencies: { a: "1.0.0", b: "1.0.0" } });
    write(path.join(pkg, "node_modules", "a"), {
      name: "a",
      license: "MIT",
      dependencies: { shared: "1.0.0" },
    });
    write(path.join(pkg, "node_modules", "b"), {
      name: "b",
      license: "MIT",
      dependencies: { shared: "1.0.0" },
    });
    write(path.join(pkg, "node_modules", "shared"), {
      name: "shared",
      license: "ISC",
    });
    expect(productionTree(pkg).map((entry) => entry.name)).toEqual([
      "a",
      "b",
      "shared",
    ]);
  });

  it("throws when a declared dependency is not installed", () => {
    const pkg = path.join(root, "missing");
    write(pkg, { name: "missing", dependencies: { nowhere: "1.0.0" } });
    expect(() => productionTree(pkg)).toThrow(
      /nowhere is declared but not installed/,
    );
  });
});

describe("geolint's own dependency tree", () => {
  it("holds only permissive licences and no GPL family code", () => {
    const offenders = productionTree(PACKAGE).filter(
      (entry) => entry.licence === undefined || !isPermissive(entry.licence),
    );
    expect(offenders).toEqual([]);
  });
});
