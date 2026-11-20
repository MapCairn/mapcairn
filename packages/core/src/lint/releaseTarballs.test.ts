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
  checkFolder,
  digestProblems,
  formatDigests,
  parseDigests,
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

describe("formatDigests and parseDigests", () => {
  it("write and read one <digest>:<name> entry for each file, sorted by name, on one line", () => {
    const text = formatDigests([
      {
        name: "b.tgz",
        digest:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      {
        name: "a.tgz",
        digest:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ]);
    expect(text).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:a.tgz,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:b.tgz",
    );
    expect(parseDigests(text)).toEqual([
      {
        name: "a.tgz",
        digest:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      {
        name: "b.tgz",
        digest:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ]);
  });

  it("refuses a name that could be read as an option or a path", () => {
    for (const name of [
      "-x.tgz",
      "../a.tgz",
      "a/b.tgz",
      "a\nb.tgz",
      "a,b.tgz",
    ]) {
      expect(() =>
        formatDigests([
          {
            name,
            digest:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ]),
      ).toThrow(/name/);
    }
  });

  it("refuses text that is not a list of digests", () => {
    for (const text of [
      "",
      "abc",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:a.tgz:extra",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:a.tgz,",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:a.tgz",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:../a.tgz",
    ]) {
      expect(() => parseDigests(text), text).toThrow();
    }
  });
});

describe("digestProblems", () => {
  const expected = [
    {
      name: "a.tgz",
      digest:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    {
      name: "b.tgz",
      digest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  ];

  it("passes when the files are exactly the expected ones with the expected digests", () => {
    expect(digestProblems(expected, [...expected].reverse())).toEqual([]);
  });

  it("reports a changed file, a missing file and an extra file, so a swapped or added tarball cannot pass", () => {
    expect(
      digestProblems(expected, [
        {
          name: "a.tgz",
          digest:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        {
          name: "c.tgz",
          digest:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ]),
    ).toEqual([
      "a.tgz has a different digest from the one recorded when it was packed",
      "b.tgz is missing",
      "c.tgz was not packed by the release and must not be released",
    ]);
  });
});

describe("checkFolder", () => {
  it("compares a folder with the recorded digests and the notes digest", () => {
    const folder = temporaryFolder();
    writeFileSync(path.join(folder, "a.tgz"), "one");
    writeFileSync(path.join(folder, "notes.md"), "notes");
    const digests = formatDigests([
      { name: "a.tgz", digest: sha256Of(path.join(folder, "a.tgz")) },
    ]);
    const notes = sha256Of(path.join(folder, "notes.md"));
    expect(checkFolder(folder, digests, notes)).toEqual([]);
    writeFileSync(path.join(folder, "a.tgz"), "two");
    writeFileSync(path.join(folder, "extra.tgz"), "x");
    writeFileSync(path.join(folder, "notes.md"), "changed");
    expect(checkFolder(folder, digests, notes)).toEqual([
      "a.tgz has a different digest from the one recorded when it was packed",
      "extra.tgz was not packed by the release and must not be released",
      "notes.md has a different digest from the one recorded when it was written",
    ]);
  });

  it("treats an empty notes digest as: there must be no notes file", () => {
    const folder = temporaryFolder();
    writeFileSync(path.join(folder, "a.tgz"), "one");
    const digests = formatDigests([
      { name: "a.tgz", digest: sha256Of(path.join(folder, "a.tgz")) },
    ]);
    expect(checkFolder(folder, digests, "")).toEqual([]);
    writeFileSync(path.join(folder, "notes.md"), "smuggled");
    expect(checkFolder(folder, digests, "")).toEqual([
      "notes.md is present, but no notes were recorded",
    ]);
  });

  it("refuses an empty notes digest when the notes are required, so a release cannot be created from unchecked notes", () => {
    const folder = temporaryFolder();
    writeFileSync(path.join(folder, "a.tgz"), "one");
    const digests = formatDigests([
      { name: "a.tgz", digest: sha256Of(path.join(folder, "a.tgz")) },
    ]);
    expect(checkFolder(folder, digests, "", { requireNotes: true })).toEqual([
      "no notes digest was recorded, and the release needs its notes",
    ]);
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
