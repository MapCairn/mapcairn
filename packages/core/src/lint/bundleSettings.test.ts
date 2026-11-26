// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bundleOf,
  copySourceOf,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/bundleSettings.mjs";

let root: string;

function install(name: string): string {
  const folder = path.join(root, "node_modules", name);
  mkdirSync(path.join(folder, "dist"), { recursive: true });
  writeFileSync(
    path.join(folder, "package.json"),
    JSON.stringify({ name, version: "1.0.0" }),
  );
  writeFileSync(path.join(folder, "dist", "file.mjs"), "x");
  return folder;
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "bundle-settings-")));
  writeFileSync(path.join(root, "package.json"), "{}");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("bundleOf", () => {
  it("reads the entries and the copied files, and none for a package with no bundle", () => {
    expect(
      bundleOf({
        mapcairn: { bundle: { entries: ["a"], copy: { "w.js": "p/x.js" } } },
      }),
    ).toEqual({ entries: ["a"], copy: { "w.js": "p/x.js" } });
    expect(bundleOf({ mapcairn: { bundle: {} } })).toEqual({
      entries: [],
      copy: {},
    });
    expect(bundleOf({})).toBeUndefined();
  });
});

describe("copySourceOf", () => {
  const require = () => createRequire(path.join(root, "package.json"));

  it("finds a file inside an installed package", () => {
    const folder = install("plain");
    expect(copySourceOf("plain/dist/file.mjs", require())).toEqual({
      packageFolder: folder,
      file: path.join(folder, "dist", "file.mjs"),
    });
  });

  it("finds a file inside a scoped package, taking the scope as part of its name", () => {
    const folder = install("@scope/name");
    expect(copySourceOf("@scope/name/dist/file.mjs", require())).toEqual({
      packageFolder: folder,
      file: path.join(folder, "dist", "file.mjs"),
    });
  });

  it("refuses a source that names no file inside a package", () => {
    install("plain");
    install("@scope/name");
    expect(() => copySourceOf("plain", require())).toThrow(
      /does not name a file/,
    );
    expect(() => copySourceOf("@scope/name", require())).toThrow(
      /does not name a file/,
    );
    expect(() => copySourceOf("plain/../other/x.js", require())).toThrow(
      /does not name a file/,
    );
  });
});
