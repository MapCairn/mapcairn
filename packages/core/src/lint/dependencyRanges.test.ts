// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const MANIFESTS = [
  "package.json",
  "packages/core/package.json",
  "packages/map/package.json",
  "packages/react/package.json",
  "packages/theme/package.json",
  "packages/web/package.json",
  "examples/embed/package.json",
];

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
  return MANIFESTS.flatMap((manifest) => {
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
  it("reads every manifest", () => {
    expect(thirdPartyEntries().length).toBeGreaterThan(50);
  });

  it("uses a caret range, except a prerelease, which stays an exact version", () => {
    const wrong = thirdPartyEntries()
      .filter(({ range }) =>
        PRERELEASE.test(range) ? false : !range.startsWith("^"),
      )
      .map(({ manifest, name, range }) => `${manifest}: ${name}@${range}`);
    expect(wrong).toEqual([]);
  });

  it("pins a prerelease exactly, with no range operator", () => {
    const wrong = thirdPartyEntries()
      .filter(({ range }) => /^[\^~]/.test(range) && /-/.test(range))
      .map(({ manifest, name, range }) => `${manifest}: ${name}@${range}`);
    expect(wrong).toEqual([]);
  });
});
