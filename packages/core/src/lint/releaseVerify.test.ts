// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  decideDispatch,
  decidePush,
  privateSdkManifests,
  ReleaseRefused,
  readRegistryState,
  tarballVersionProblems,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/verifyRelease.mjs";

const SHA = "a".repeat(40);
const SDK_MANIFESTS = [
  "packages/core/package.json",
  "packages/map/package.json",
  "packages/react/package.json",
  "packages/theme/package.json",
];

interface PushSources {
  subject: string;
  head: string;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  tags: string[];
  pullRequest: {
    merged: boolean;
    base: string;
    mergeCommit: string | null;
    labels: string[];
  } | null;
}

/** Everything a real release push has, which each test then breaks in one place. */
function releasePush(overrides: Partial<PushSources> = {}) {
  const before = Object.fromEntries(
    SDK_MANIFESTS.map((file) => [file, "0.0.0"]),
  );
  const after = Object.fromEntries(
    SDK_MANIFESTS.map((file) => [file, "0.1.0-rc.1"]),
  );
  const sources: PushSources = {
    subject: "chore(release): v0.1.0-rc.1 (#500)",
    head: SHA,
    before,
    after,
    tags: [],
    pullRequest: {
      merged: true,
      base: "main",
      mergeCommit: SHA,
      labels: ["release"],
    },
    ...overrides,
  };
  return {
    headSubject: () => sources.subject,
    headSha: () => sources.head,
    manifestVersions: (ref: string) =>
      ref === "HEAD" ? sources.after : sources.before,
    tagExists: (tag: string) => sources.tags.includes(tag),
    pullRequest: (number: number) =>
      number === 500 ? sources.pullRequest : null,
  };
}

describe("decidePush", () => {
  it("releases the version a merged, labelled Release pull request set", () => {
    expect(decidePush(releasePush())).toMatchObject({
      release: true,
      version: "0.1.0-rc.1",
      prerelease: true,
    });
  });

  it("treats a stable version as not a prerelease", () => {
    const sources = releasePush({
      subject: "chore(release): v0.1.0 (#500)",
      after: Object.fromEntries(SDK_MANIFESTS.map((file) => [file, "0.1.0"])),
    });
    expect(decidePush(sources)).toMatchObject({
      release: true,
      version: "0.1.0",
      prerelease: false,
    });
  });

  it.each([
    ["an ordinary subject", { subject: "docs: tidy the changelog (#500)" }],
    ["no pull request tail", { subject: "chore(release): v0.1.0-rc.1" }],
    ["another scope", { subject: "chore(deps): v0.1.0-rc.1 (#500)" }],
    [
      "a subject that only starts like one",
      { subject: "chore(release): v0.1.0-rc.1 (#500) and more" },
    ],
    [
      "a version that is not a version",
      { subject: "chore(release): v0.1 (#500)" },
    ],
  ])("is not a release with %s", (_name, overrides) => {
    const decision = decidePush(releasePush(overrides));
    expect(decision.release).toBe(false);
    expect(decision.reason).toMatch(/subject/);
  });

  it("is not a release when one manifest did not take the version", () => {
    const after = Object.fromEntries(
      SDK_MANIFESTS.map((file) => [file, "0.1.0-rc.1"]),
    );
    after["packages/theme/package.json"] = "0.0.0";
    const decision = decidePush(releasePush({ after }));
    expect(decision.release).toBe(false);
    expect(decision.reason).toMatch(/packages\/theme\/package\.json/);
  });

  it("is not a release when a manifest already had the version before the commit", () => {
    const before = Object.fromEntries(
      SDK_MANIFESTS.map((file) => [file, "0.0.0"]),
    );
    before["packages/map/package.json"] = "0.1.0-rc.1";
    const decision = decidePush(releasePush({ before }));
    expect(decision.release).toBe(false);
    expect(decision.reason).toMatch(/packages\/map\/package\.json/);
  });

  it("is not a release when a manifest cannot be read", () => {
    const after = Object.fromEntries(
      SDK_MANIFESTS.map((file) => [file, "0.1.0-rc.1"]),
    );
    after["packages/core/package.json"] = null;
    expect(decidePush(releasePush({ after })).release).toBe(false);
  });

  it("is not a release when the tag exists", () => {
    const decision = decidePush(releasePush({ tags: ["v0.1.0-rc.1"] }));
    expect(decision.release).toBe(false);
    expect(decision.reason).toMatch(/tag v0\.1\.0-rc\.1 already exists/);
  });

  it.each([
    ["no pull request", { pullRequest: null }],
    [
      "an unmerged pull request",
      {
        pullRequest: {
          merged: false,
          base: "main",
          mergeCommit: null,
          labels: ["release"],
        },
      },
    ],
    [
      "a pull request into another branch",
      {
        pullRequest: {
          merged: true,
          base: "next",
          mergeCommit: SHA,
          labels: ["release"],
        },
      },
    ],
    [
      "a pull request without the release label",
      {
        pullRequest: {
          merged: true,
          base: "main",
          mergeCommit: SHA,
          labels: ["documentation"],
        },
      },
    ],
    [
      "a pull request whose merge commit is another commit",
      {
        pullRequest: {
          merged: true,
          base: "main",
          mergeCommit: "b".repeat(40),
          labels: ["release"],
        },
      },
    ],
  ])("is not a release with %s", (_name, overrides) => {
    const decision = decidePush(releasePush(overrides));
    expect(decision.release).toBe(false);
    expect(decision.reason).toMatch(/pull request #500/);
  });
});

describe("decideDispatch", () => {
  const manifests = (version: string | null) =>
    Object.fromEntries(SDK_MANIFESTS.map((file) => [file, version]));

  it("rehearses the version the manifests on main carry", () => {
    expect(
      decideDispatch({
        mode: "rehearse",
        version: "0.0.0",
        manifestVersions: () => manifests("0.0.0"),
        tagExists: () => false,
      }),
    ).toMatchObject({ release: true, version: "0.0.0", prerelease: false });
  });

  it("refuses a rehearsal of a version the manifests do not carry", () => {
    expect(() =>
      decideDispatch({
        mode: "rehearse",
        version: "0.1.0",
        manifestVersions: () => manifests("0.0.0"),
        tagExists: () => false,
      }),
    ).toThrow(ReleaseRefused);
  });

  it("publishes an existing release only when its tag exists", () => {
    expect(
      decideDispatch({
        mode: "publish-existing",
        version: "0.1.0-rc.1",
        manifestVersions: () => manifests("0.1.0-rc.1"),
        tagExists: (tag: string) => tag === "v0.1.0-rc.1",
      }),
    ).toMatchObject({ release: true, version: "0.1.0-rc.1", prerelease: true });
    expect(() =>
      decideDispatch({
        mode: "publish-existing",
        version: "0.1.0-rc.1",
        manifestVersions: () => manifests("0.1.0-rc.1"),
        tagExists: () => false,
      }),
    ).toThrow(/no tag v0\.1\.0-rc\.1/);
  });

  it.each(["", "v0.1.0", "0.1", "0.1.0; echo", "$(id)", "0.1.0-RC.1"])(
    "refuses the version %j before it reaches anything else",
    (version) => {
      expect(() =>
        decideDispatch({
          mode: "rehearse",
          version,
          manifestVersions: () => manifests("0.0.0"),
          tagExists: () => false,
        }),
      ).toThrow(/not a version/);
    },
  );

  it("refuses a mode it does not know", () => {
    expect(() =>
      decideDispatch({
        mode: "publish",
        version: "0.1.0",
        manifestVersions: () => manifests("0.1.0"),
        tagExists: () => true,
      }),
    ).toThrow(/mode/);
  });
});

describe("readRegistryState", () => {
  const found = { status: 0, stdout: "0.1.0-rc.1\n", stderr: "" };
  const missing = {
    status: 1,
    stdout: "",
    stderr: "npm error code E404\nnpm error 404 Not Found",
  };

  it("is on npm when every package is found", () => {
    expect(readRegistryState(() => found)).toEqual({
      onNpm: true,
      missing: [],
    });
  });

  it("names the packages the registry does not have", () => {
    const state = readRegistryState((name: string) =>
      name === "@mapcairn/theme" ? missing : found,
    );
    expect(state).toEqual({ onNpm: false, missing: ["@mapcairn/theme"] });
  });

  it("fails on an answer that is neither found nor not found, so an outage is not read as a first publish", () => {
    expect(() =>
      readRegistryState(() => ({
        status: 1,
        stdout: "",
        stderr: "npm error code ECONNRESET",
      })),
    ).toThrow(/ECONNRESET/);
  });
});

describe("tarballVersionProblems", () => {
  it("passes tarballs whose manifests carry the version", () => {
    expect(
      tarballVersionProblems("0.1.0", {
        "mapcairn-core-0.1.0.tgz": { name: "@mapcairn/core", version: "0.1.0" },
        "mapcairn-map-0.1.0.tgz": { name: "@mapcairn/map", version: "0.1.0" },
        "mapcairn-react-0.1.0.tgz": {
          name: "@mapcairn/react",
          version: "0.1.0",
        },
        "mapcairn-theme-0.1.0.tgz": {
          name: "@mapcairn/theme",
          version: "0.1.0",
        },
      }),
    ).toEqual([]);
  });

  it("reports a wrong version, a missing package and a foreign package", () => {
    const problems = tarballVersionProblems("0.1.0", {
      "mapcairn-core-0.1.0.tgz": { name: "@mapcairn/core", version: "0.0.9" },
      "mapcairn-map-0.1.0.tgz": { name: "@mapcairn/map", version: "0.1.0" },
      "other-0.1.0.tgz": { name: "left-pad", version: "0.1.0" },
    });
    expect(problems).toEqual([
      "mapcairn-core-0.1.0.tgz holds @mapcairn/core 0.0.9, not 0.1.0",
      "other-0.1.0.tgz is not one of the four SDK packages",
      "no tarball for @mapcairn/react",
      "no tarball for @mapcairn/theme",
    ]);
  });
});

describe("privateSdkManifests", () => {
  it("names the manifests that set private", () => {
    expect(
      privateSdkManifests({
        "packages/core/package.json":
          '{ "name": "@mapcairn/core", "private": true }',
        "packages/map/package.json": '{ "name": "@mapcairn/map" }',
        "packages/react/package.json": '{ "private": false }',
      }),
    ).toEqual(["packages/core/package.json"]);
  });

  it("counts a manifest it cannot read as private, so nothing is staged on a guess", () => {
    expect(
      privateSdkManifests({ "packages/core/package.json": "{ not json" }),
    ).toEqual(["packages/core/package.json"]);
  });
});
