// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  buildReport,
  parseRegistryAnswer,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/check.mjs";

const NAMES = [
  "@mapcairn/core",
  "@mapcairn/map",
  "@mapcairn/react",
  "@mapcairn/theme",
];

type Facts = Record<string, unknown>;

function versions(version: string): Record<string, string> {
  return Object.fromEntries(NAMES.map((name) => [name, version]));
}

/** A prepared release candidate that is ready, which each test then spoils in one place. */
function ready(overrides: Facts = {}): Facts {
  return {
    sdk: {
      versions: versions("0.1.0-rc.1"),
      consistent: true,
      version: "0.1.0-rc.1",
      rangeProblems: [],
    },
    privatePackages: [],
    changelog: { hasSection: true, findings: [] },
    tags: ["v0.0.1"],
    tarballs: NAMES.map((name) => ({
      name,
      files: 40,
      size: 212_000,
      problems: [],
    })),
    registry: Object.fromEntries(
      NAMES.map((name) => [name, { exists: false }]),
    ),
    signedIn: false,
    tokenInEnvironment: false,
    ...overrides,
  };
}

function report(overrides: Facts = {}) {
  const result = buildReport(ready(overrides));
  return { ...result, text: result.lines.join("\n") as string };
}

describe("buildReport", () => {
  it("is headed by the tag it prepares and says what is left for the maintainer when nothing is on npm", () => {
    const { text, blockers } = report();
    expect(text).toContain("Release readiness for v0.1.0-rc.1");
    expect(text).toContain(
      "Versions: core, map, react and theme are all 0.1.0-rc.1; internal ranges match.",
    );
    expect(text).toContain("Notes: CHANGELOG.md has a section for 0.1.0-rc.1");
    expect(text).toContain("Tarballs: 4 packed, contents as expected");
    expect(text).toContain("core 212 kB");
    expect(text).toContain("none of the four packages is on npm yet");
    expect(text).toMatch(/Left for you: .*merge the Release pull request/);
    expect(text).toMatch(/Left for you: .*by hand/);
    expect(blockers).toEqual([]);
  });

  it("asks only for the merge and the approval once the packages exist on npm", () => {
    const registry = Object.fromEntries(
      NAMES.map((name) => [
        name,
        { exists: true, latest: "0.1.0-rc.1", provenance: true },
      ]),
    );
    const { text, blockers } = report({ registry });
    expect(text).toContain("all four packages exist");
    expect(text).toContain("provenance");
    expect(text).toMatch(
      /Left for you: .*merge the Release pull request, then approve the staged packages on npmjs\.com/,
    );
    expect(text).not.toContain("by hand");
    expect(blockers).toEqual([]);
  });

  it("says when the latest version on npm has no provenance", () => {
    const registry = Object.fromEntries(
      NAMES.map((name) => [
        name,
        { exists: true, latest: "0.1.0-rc.1", provenance: false },
      ]),
    );
    expect(report({ registry }).text).toContain("no provenance");
  });

  it("blocks on a package that is on npm when the others are not", () => {
    const registry = Object.fromEntries(
      NAMES.map((name) => [
        name,
        name === "@mapcairn/core"
          ? { exists: true, latest: "0.1.0-rc.1", provenance: false }
          : { exists: false },
      ]),
    );
    const { text, blockers } = report({ registry });
    expect(text).toContain("only @mapcairn/core is on npm");
    expect(blockers.join("\n")).toContain("only @mapcairn/core is on npm");
  });

  it("says the registry could not be read, and does not guess", () => {
    const { text, blockers } = report({ registry: null });
    expect(text).toContain("npm: the registry could not be read");
    expect(blockers).toEqual([]);
    expect(text).not.toContain("by hand");
  });

  it("blocks when the four versions differ and names them", () => {
    const { text, blockers } = report({
      sdk: {
        versions: { ...versions("0.1.0-rc.1"), "@mapcairn/theme": "0.0.0" },
        consistent: false,
        version: null,
        rangeProblems: [],
      },
    });
    expect(text).toContain("Release readiness\n");
    expect(text).toContain("do not share one version");
    expect(text).toContain("theme 0.0.0");
    expect(blockers.length).toBeGreaterThan(0);
    expect(text).toMatch(/Left for you: .*Fix the problems above/);
  });

  it("blocks on an internal range that does not match", () => {
    const { text, blockers } = report({
      sdk: {
        versions: versions("0.1.0-rc.1"),
        consistent: true,
        version: "0.1.0-rc.1",
        rangeProblems: [
          "packages/web/package.json: dependencies @mapcairn/core is ^0.0.0, expected 0.1.0-rc.1",
        ],
      },
    });
    expect(text).toContain("packages/web/package.json");
    expect(blockers.length).toBe(1);
  });

  it("blocks on a package that is still private, and names the pairing with the README status line", () => {
    const { text, blockers } = report({ privatePackages: NAMES });
    expect(text).toContain("still private");
    expect(text).toContain("npm skips a private package");
    expect(text).toContain("Status");
    expect(text).toContain("rc.1 Release pull request");
    expect(blockers.join("\n")).toContain("still private");
  });

  it("treats private packages at 0.0.0 as expected, and says nothing is prepared", () => {
    const { text, blockers } = report({
      sdk: {
        versions: versions("0.0.0"),
        consistent: true,
        version: "0.0.0",
        rangeProblems: [],
      },
      privatePackages: NAMES,
      changelog: { hasSection: false, findings: [] },
      tarballs: null,
    });
    expect(text).toContain("Release readiness: nothing is prepared");
    expect(text).toContain("private, as expected");
    expect(text).toMatch(/Left for you: .*release skill/);
    expect(blockers).toEqual([]);
  });

  it("blocks when the changelog has no section for the version", () => {
    const { text, blockers } = report({
      changelog: { hasSection: false, findings: [] },
    });
    expect(text).toContain("CHANGELOG.md has no section for 0.1.0-rc.1");
    expect(blockers.length).toBe(1);
  });

  it("blocks when the changelog fails the notes check", () => {
    const { text, blockers } = report({
      changelog: {
        hasSection: true,
        findings: ["CHANGELOG.md:12: A line that starts with a commit prefix."],
      },
    });
    expect(text).toContain("CHANGELOG.md:12");
    expect(blockers.length).toBe(1);
  });

  it("blocks when the tag already exists", () => {
    const { text, blockers } = report({ tags: ["v0.1.0-rc.1"] });
    expect(text).toContain("v0.1.0-rc.1 is already tagged");
    expect(blockers.length).toBe(1);
  });

  it("blocks on a tarball problem and prints it", () => {
    const { text, blockers } = report({
      tarballs: [
        {
          name: "@mapcairn/core",
          files: 3,
          size: 10,
          problems: ["dist/.env: a dotfile"],
        },
      ],
    });
    expect(text).toContain("@mapcairn/core: dist/.env: a dotfile");
    expect(blockers.length).toBe(1);
  });

  it("warns, without blocking, when someone is signed in on this machine or a registry token is set", () => {
    const { text, blockers, warnings } = report({
      signedIn: true,
      tokenInEnvironment: true,
    });
    expect(text).toContain("npm is signed in on this machine");
    expect(text).toContain("a registry token is set");
    expect(warnings.length).toBe(2);
    expect(blockers).toEqual([]);
  });

  it("does not name a command the maintainer runs, only the guide that has it", () => {
    const { text } = report();
    expect(text).toContain("docs/guides/releasing.md");
    expect(text).toContain(
      "Trusted publishing: cannot be read without signing in",
    );
  });
});

describe("parseRegistryAnswer", () => {
  it("reads a package the registry has, with provenance", () => {
    const answer = parseRegistryAnswer({
      status: 0,
      stdout: JSON.stringify({
        version: "0.1.0-rc.2",
        dist: { attestations: { url: "https://example.test/a" } },
      }),
      stderr: "",
    });
    expect(answer).toEqual({
      exists: true,
      latest: "0.1.0-rc.2",
      provenance: true,
    });
  });

  it("reads a package without attestations", () => {
    expect(
      parseRegistryAnswer({
        status: 0,
        stdout: JSON.stringify({ version: "0.1.0-rc.1", dist: {} }),
        stderr: "",
      }),
    ).toEqual({ exists: true, latest: "0.1.0-rc.1", provenance: false });
  });

  it("reads a package the registry does not have", () => {
    expect(
      parseRegistryAnswer({
        status: 1,
        stdout: "",
        stderr: "npm error code E404",
      }),
    ).toEqual({ exists: false });
  });

  it("returns null for any other failure", () => {
    expect(
      parseRegistryAnswer({
        status: 1,
        stdout: "",
        stderr: "npm error code ENOTFOUND",
      }),
    ).toBeNull();
    expect(
      parseRegistryAnswer({ status: 0, stdout: "not json", stderr: "" }),
    ).toBeNull();
  });
});
