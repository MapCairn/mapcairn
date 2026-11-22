// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** The root manifest, then every package, example and site under it. */
function manifestPaths(): string[] {
  const workspaces = ["packages", "examples", "sites"].flatMap((folder) =>
    readdirSync(path.join(REPO, folder), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${folder}/${entry.name}/package.json`)
      .filter((manifest) => existsSync(path.join(REPO, manifest))),
  );
  return ["package.json", ...workspaces];
}

const SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type Section = (typeof SECTIONS)[number];

interface Manifest extends Partial<Record<Section, Record<string, string>>> {
  readonly name?: string;
}

/** A semver prerelease carries a hyphen after the core version. */
const PRERELEASE = /^\d+\.\d+\.\d+-/;

interface Entry {
  readonly manifest: string;
  readonly section: Section;
  readonly name: string;
  readonly range: string;
}

/** Every third-party entry of every manifest; MapCairn's own packages are linked, not ranged. */
function thirdPartyEntries(): Entry[] {
  return manifestPaths().flatMap((manifest) => {
    const parsed = JSON.parse(
      readFileSync(path.join(REPO, manifest), "utf8"),
    ) as Manifest;
    return SECTIONS.flatMap((section) =>
      Object.entries(parsed[section] ?? {})
        .filter(([name]) => !name.startsWith("@mapcairn/"))
        .map(([name, range]) => ({ manifest, section, name, range })),
    );
  });
}

describe("third-party dependency ranges", () => {
  it("covers the root and every workspace manifest", () => {
    expect(manifestPaths()).toEqual(
      expect.arrayContaining([
        "package.json",
        "packages/core/package.json",
        "examples/embed/package.json",
        "sites/docs/package.json",
      ]),
    );
  });

  it("uses a caret range, except a prerelease, which stays an exact version", () => {
    const wrong = thirdPartyEntries()
      .filter(({ range }) =>
        PRERELEASE.test(range) ? /^[\^~]/.test(range) : !range.startsWith("^"),
      )
      .map(({ manifest, name, range }) => `${manifest}: ${name}@${range}`);
    expect(wrong).toEqual([]);
  });
});
