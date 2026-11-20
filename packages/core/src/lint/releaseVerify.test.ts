// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  decideDispatch,
  decidePush,
  distTagFor,
  packageState,
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
    tags: () => sources.tags,
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
        tags: () => [],
      }),
    ).toMatchObject({ release: true, version: "0.0.0", prerelease: false });
  });

  it("refuses a rehearsal of a version the manifests do not carry", () => {
    expect(() =>
      decideDispatch({
        mode: "rehearse",
        version: "0.1.0",
        manifestVersions: () => manifests("0.0.0"),
        tags: () => [],
      }),
    ).toThrow(ReleaseRefused);
  });

  it("publishes an existing release only when its tag exists", () => {
    expect(
      decideDispatch({
        mode: "publish-existing",
        version: "0.1.0-rc.1",
        manifestVersions: () => manifests("0.1.0-rc.1"),
        tags: () => ["v0.1.0-rc.1"],
      }),
    ).toMatchObject({ release: true, version: "0.1.0-rc.1", prerelease: true });
    expect(() =>
      decideDispatch({
        mode: "publish-existing",
        version: "0.1.0-rc.1",
        manifestVersions: () => manifests("0.1.0-rc.1"),
        tags: () => [],
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
          tags: () => [],
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
        tags: () => ["v0.1.0"],
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

  it("requires exactly one tarball for each package, named mapcairn-<short>-<version>.tgz", () => {
    const all = {
      "mapcairn-core-0.1.0.tgz": { name: "@mapcairn/core", version: "0.1.0" },
      "mapcairn-map-0.1.0.tgz": { name: "@mapcairn/map", version: "0.1.0" },
      "mapcairn-react-0.1.0.tgz": { name: "@mapcairn/react", version: "0.1.0" },
      "mapcairn-theme-0.1.0.tgz": { name: "@mapcairn/theme", version: "0.1.0" },
    };
    expect(
      tarballVersionProblems("0.1.0", {
        ...all,
        "mapcairn-core-0.1.0 (1).tgz": {
          name: "@mapcairn/core",
          version: "0.1.0",
        },
      }),
    ).toEqual([
      "mapcairn-core-0.1.0 (1).tgz should be named mapcairn-core-0.1.0.tgz",
      "more than one tarball for @mapcairn/core",
    ]);
    expect(
      tarballVersionProblems("0.1.0", {
        ...all,
        "mapcairn-core-0.1.0.tgz": { name: "@mapcairn/map", version: "0.1.0" },
        "mapcairn-map-0.1.0.tgz": { name: "@mapcairn/map", version: "0.1.0" },
      }),
    ).toContain(
      "mapcairn-core-0.1.0.tgz should be named mapcairn-map-0.1.0.tgz",
    );
  });
});

describe("packageState", () => {
  it("is published when the registry returns that version", () => {
    expect(
      packageState({ status: 0, stdout: "0.1.0\n", stderr: "" }, "0.1.0"),
    ).toBe("published");
  });

  it("is missing on a not-found answer", () => {
    expect(
      packageState(
        { status: 1, stdout: "", stderr: "npm error code E404" },
        "0.1.0",
      ),
    ).toBe("missing");
  });

  it("throws, with the error text, on any other failure or an unexpected answer", () => {
    expect(() =>
      packageState(
        { status: 1, stdout: "", stderr: "npm error code ECONNRESET" },
        "0.1.0",
      ),
    ).toThrow(/ECONNRESET/);
    expect(() =>
      packageState({ status: 0, stdout: "0.2.0\n", stderr: "" }, "0.1.0"),
    ).toThrow(/0\.2\.0/);
    expect(() =>
      packageState({ status: 0, stdout: "", stderr: "" }, "0.1.0"),
    ).toThrow();
  });
});

describe("distTagFor", () => {
  it("puts a prerelease under next", () => {
    expect(distTagFor("0.1.0-rc.2", ["v0.1.0-rc.1"])).toBe("next");
  });

  it("puts a prerelease older than the newest prerelease under previous", () => {
    expect(distTagFor("0.1.0-rc.1", ["v0.1.0-rc.2"])).toBe("previous");
    expect(distTagFor("0.1.0-rc.2", ["v0.1.0-rc.2", "v0.1.0-rc.1"])).toBe(
      "next",
    );
    expect(distTagFor("0.1.0-rc.3", ["v0.1.0-rc.2"])).toBe("next");
  });

  it("keeps latest for a release when only a newer prerelease is tagged", () => {
    expect(distTagFor("0.1.0", ["v0.2.0-rc.1"])).toBe("latest");
  });

  it("puts the newest stable release under latest", () => {
    expect(distTagFor("0.2.0", ["v0.1.0", "v0.1.1-rc.1"])).toBe("latest");
    expect(distTagFor("0.1.0", [])).toBe("latest");
  });

  it("never puts an older stable release under latest", () => {
    expect(distTagFor("0.1.1", ["v0.1.0", "v0.2.0"])).toBe("previous");
  });
});

describe("a release older than an existing tag", () => {
  it("is refused on a push", () => {
    const decision = decidePush(releasePush({ tags: ["v0.1.0", "v0.2.0"] }));
    expect(decision.release).toBe(false);
    expect(decision.reason).toMatch(/not newer than v0\.2\.0/);
  });

  it("is refused when it equals the highest tag's version before the prerelease", () => {
    const decision = decidePush(releasePush({ tags: ["v0.1.0"] }));
    expect(decision.release).toBe(false);
  });

  it("fails, and does not skip, a release-shaped push whose pull request cannot be read", () => {
    const sources = releasePush();
    expect(() => decidePush({ ...sources, pullRequest: () => null })).toThrow(
      ReleaseRefused,
    );
    expect(() => decidePush({ ...sources, pullRequest: () => null })).toThrow(
      /pull request #500 could not be read/,
    );
  });

  it("reports the dist-tag with the decision", () => {
    expect(decidePush(releasePush())).toMatchObject({ distTag: "next" });
  });

  it("refuses a subject whose version has a leading zero", () => {
    const decision = decidePush(
      releasePush({ subject: "chore(release): v00.1.0 (#500)" }),
    );
    expect(decision.release).toBe(false);
  });

  it("gives a publish-existing run of an older stable release a dist-tag that is not latest", () => {
    expect(
      decideDispatch({
        mode: "publish-existing",
        version: "0.1.1",
        manifestVersions: () => ({}),
        tags: () => ["v0.1.1", "v0.2.0"],
      }),
    ).toMatchObject({ distTag: "previous" });
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
