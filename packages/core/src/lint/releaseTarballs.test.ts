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
import { afterEach, describe, expect, it } from "vitest";
import {
  findTarballs,
  parseTarList,
  readTarballFile,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/packCheck.mjs";
import {
  formatSums,
  sha256Of,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/tarballs.mjs";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function temporaryFolder(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-tarballs-test-"));
  folders.push(folder);
  return folder;
}

describe("parseTarList", () => {
  it("drops the package/ prefix and the folders", () => {
    expect(
      parseTarList(
        "package/\npackage/package.json\npackage/dist/\npackage/dist/index.js\r\n",
      ),
    ).toEqual(["package.json", "dist/index.js"]);
  });
});

describe("findTarballs", () => {
  const names = (list: string[]) => findTarballs(list, ["core", "map"]);

  it("maps each package to its one tarball", () => {
    expect(
      names(["mapcairn-core-0.1.0.tgz", "mapcairn-map-0.1.0.tgz", "notes.md"]),
    ).toEqual({
      core: "mapcairn-core-0.1.0.tgz",
      map: "mapcairn-map-0.1.0.tgz",
    });
  });

  it("refuses a missing tarball and more than one for a package", () => {
    expect(() => names(["mapcairn-core-0.1.0.tgz"])).toThrow(/map/);
    expect(() =>
      names([
        "mapcairn-core-0.1.0.tgz",
        "mapcairn-core-0.1.1.tgz",
        "mapcairn-map-0.1.0.tgz",
      ]),
    ).toThrow(/more than one/);
  });

  it("does not take a longer package name for a shorter one", () => {
    expect(() =>
      findTarballs(["mapcairn-core-extra-0.1.0.tgz"], ["core"]),
    ).toThrow(/core/);
  });
});

describe("formatSums", () => {
  it("writes one line for each file in the format sha256sum checks, sorted by name", () => {
    expect(
      formatSums([
        { name: "b.tgz", digest: "b".repeat(64) },
        { name: "a.tgz", digest: "a".repeat(64) },
      ]),
    ).toBe(`${"a".repeat(64)}  a.tgz\n${"b".repeat(64)}  b.tgz\n`);
  });

  it("refuses a name that could be read as an option or a path", () => {
    for (const name of ["-x.tgz", "../a.tgz", "a/b.tgz", "a\nb.tgz"]) {
      expect(() => formatSums([{ name, digest: "a".repeat(64) }])).toThrow(
        /name/,
      );
    }
  });
});

describe("sha256Of and readTarballFile", () => {
  it("hashes a file's bytes", () => {
    const folder = temporaryFolder();
    const file = path.join(folder, "a.txt");
    writeFileSync(file, "abc");
    expect(sha256Of(file)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("reads a file inside a tarball", () => {
    const folder = temporaryFolder();
    mkdirSync(path.join(folder, "package"));
    writeFileSync(path.join(folder, "package", "package.json"), '{"a":1}');
    const tarball = path.join(folder, "x.tgz");
    const made = spawnSync("tar", ["-czf", tarball, "-C", folder, "package"]);
    expect(made.status).toBe(0);
    expect(readTarballFile(tarball, "package.json")).toBe('{"a":1}');
    expect(readTarballFile(tarball, "missing.json")).toBeUndefined();
    expect(readFileSync(tarball).length).toBeGreaterThan(0);
  });
});
