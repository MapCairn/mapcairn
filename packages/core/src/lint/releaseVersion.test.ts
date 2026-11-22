// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  compareVersions,
  formatVersion,
  internalRange,
  parseVersion,
  previousTag,
  releaseTags,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/semver.mjs";
import {
  bumpFor,
  nextVersion,
  parseCommit,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/versionRules.mjs";

function version(text: string) {
  const parsed = parseVersion(text);
  if (parsed === null) {
    throw new Error(`${text} is not a version`);
  }
  return parsed;
}

function commit(subject: string, body = "") {
  return parseCommit(subject, body);
}

describe("versions", () => {
  it("reads and writes releases and prereleases", () => {
    expect(formatVersion(version("0.1.0"))).toBe("0.1.0");
    expect(formatVersion(version("1.2.3-rc.4"))).toBe("1.2.3-rc.4");
  });

  it("rejects anything that is not a version this project releases", () => {
    for (const text of ["v0.1.0", "1.2", "1.2.3-rc", "1.2.3+build", "01.2.x"]) {
      expect(parseVersion(text)).toBeNull();
    }
  });

  it("rejects leading zeros, oversized numbers, a trailing newline and a v prefix", () => {
    for (const text of [
      "00.1.0",
      "0.01.0",
      "0.1.00",
      "1.2.3-rc.01",
      "0.1.0\n",
      "\n0.1.0",
      " 0.1.0",
      "v0.1.0",
      "1234567890.0.0",
      "0.99999999999999999999.0",
      "1.2.3-rc.12345678901",
    ]) {
      expect(parseVersion(text), JSON.stringify(text)).toBeNull();
    }
    expect(parseVersion("0.0.0")).not.toBeNull();
    expect(parseVersion("10.20.30-rc.10")).not.toBeNull();
  });

  it("orders versions as semver does, with a prerelease before its release", () => {
    const ordered = [
      "0.1.0-rc.1",
      "0.1.0-rc.2",
      "0.1.0",
      "0.1.1",
      "0.2.0",
      "1.0.0",
    ];
    const shuffled = [...ordered].reverse().map(version);
    shuffled.sort(compareVersions);
    expect(shuffled.map(formatVersion)).toEqual(ordered);
    expect(compareVersions(version("0.1.0"), version("0.1.0"))).toBe(0);
    expect(
      compareVersions(version("1.0.0-beta.1"), version("1.0.0-rc.1")),
    ).toBeLessThan(0);
    expect(
      compareVersions(version("1.0.0-rc.1"), version("1.0.0-beta.1")),
    ).toBeGreaterThan(0);
  });

  it("gives an internal range the exact version, for a release and a prerelease alike", () => {
    expect(internalRange(version("0.1.0"))).toBe("0.1.0");
    expect(internalRange(version("0.1.0-rc.1"))).toBe("0.1.0-rc.1");
  });

  it("finds release tags in version order and ignores other tags", () => {
    const tags = releaseTags([
      "v0.2.0",
      "latest",
      "v0.1.0-rc.1",
      "v0.1.0",
      "vnext",
      "v0.10.0",
    ]);
    expect(tags.map((entry: { tag: string }) => entry.tag)).toEqual([
      "v0.1.0-rc.1",
      "v0.1.0",
      "v0.2.0",
      "v0.10.0",
    ]);
  });

  it("finds the tag before a version, skipping candidates when the version is a release", () => {
    const tags = releaseTags(["v0.1.0", "v0.2.0-rc.1", "v0.2.0-rc.2"]);
    expect(previousTag(tags, version("0.2.0"))?.tag).toBe("v0.1.0");
    expect(previousTag(tags, version("0.2.0-rc.2"))?.tag).toBe("v0.2.0-rc.1");
    expect(previousTag(tags, version("0.1.0"))).toBeNull();
  });
});

describe("parseCommit", () => {
  it("reads type, scope, description and the pull request tail", () => {
    expect(commit("feat(map): add multi-select (#412)")).toMatchObject({
      type: "feat",
      scope: "map",
      description: "add multi-select",
      breaking: false,
      pullRequest: 412,
    });
  });

  it("reads a breaking change from the bang and from the footer", () => {
    expect(commit("feat(core)!: drop the old port").breaking).toBe(true);
    expect(
      commit(
        "fix: change a default",
        "Some text.\n\nBREAKING CHANGE: a default moved",
      ).breaking,
    ).toBe(true);
    expect(
      commit("fix: change a default", "BREAKING-CHANGE: yes").breaking,
    ).toBe(true);
    expect(
      commit("fix: small", "The words breaking change inside a sentence.")
        .breaking,
    ).toBe(false);
  });

  it("copes with a subject that is not a Conventional Commit", () => {
    expect(commit("Merge branch main")).toMatchObject({
      type: null,
      description: "Merge branch main",
      pullRequest: null,
    });
  });
});

describe("bumpFor", () => {
  it.each([
    ["feat: a", 0, "patch"],
    ["fix: a", 0, "patch"],
    ["perf: a", 0, "patch"],
    ["feat!: a", 0, "minor"],
    ["refactor: a", 0, null],
    ["docs: a", 0, null],
    ["chore: a", 0, null],
    ["not conventional", 0, null],
    ["feat: a", 1, "minor"],
    ["fix: a", 1, "patch"],
    ["fix!: a", 1, "major"],
    ["build: a", 1, null],
  ])("%s on major %i asks for %s", (subject, major, expected) => {
    expect(bumpFor(commit(subject), major)).toBe(expected);
  });
});

describe("nextVersion", () => {
  const none = { apiBreaking: false, pre: null };

  it("gives 0.1.0 when there is no tag, and 0.1.0-rc.1 with a prerelease", () => {
    expect(nextVersion({ last: null, commits: [], ...none })).toMatchObject({
      version: "0.1.0",
      bump: "first",
    });
    expect(
      nextVersion({ last: null, commits: [], apiBreaking: false, pre: "rc" })
        .version,
    ).toBe("0.1.0-rc.1");
  });

  it("raises a patch for a feature, a fix or a performance change on 0.x", () => {
    for (const subject of ["feat: a", "fix: a", "perf: a"]) {
      expect(
        nextVersion({
          last: version("0.1.0"),
          commits: [commit(subject)],
          ...none,
        }).version,
      ).toBe("0.1.1");
    }
  });

  it("raises a minor for a breaking change on 0.x and a major after 1.0.0", () => {
    const breaking = [commit("fix!: a"), commit("feat: b")];
    expect(
      nextVersion({ last: version("0.4.2"), commits: breaking, ...none }),
    ).toMatchObject({ version: "0.5.0", bump: "minor" });
    expect(
      nextVersion({ last: version("1.4.2"), commits: breaking, ...none }),
    ).toMatchObject({ version: "2.0.0", bump: "major" });
  });

  it("raises a minor for a feature after 1.0.0", () => {
    expect(
      nextVersion({
        last: version("1.4.2"),
        commits: [commit("feat: a"), commit("fix: b")],
        ...none,
      }).version,
    ).toBe("1.5.0");
  });

  it("gives no release when no commit asks for one", () => {
    const result = nextVersion({
      last: version("0.1.0"),
      commits: [commit("docs: a"), commit("chore: b")],
      ...none,
    });
    expect(result).toMatchObject({ version: null, bump: "none" });
    expect(
      nextVersion({
        last: version("0.1.0"),
        commits: [],
        apiBreaking: false,
        pre: "rc",
      }).version,
    ).toBeNull();
  });

  it("treats a likely breaking API change as a breaking change", () => {
    const result = nextVersion({
      last: version("0.1.0"),
      commits: [commit("docs: a")],
      apiBreaking: true,
      pre: null,
    });
    expect(result).toMatchObject({ version: "0.2.0", bump: "minor" });
    expect(result.reason).toContain("API reports");
    expect(
      nextVersion({
        last: version("2.0.0"),
        commits: [],
        apiBreaking: true,
        pre: null,
      }).version,
    ).toBe("3.0.0");
  });

  it("names a breaking commit as the reason when both sources agree", () => {
    const result = nextVersion({
      last: version("1.0.0"),
      commits: [commit("feat!: a")],
      apiBreaking: true,
      pre: null,
    });
    expect(result.reason).toContain("commit is marked as breaking");
  });

  it("starts a prerelease of the bumped version", () => {
    expect(
      nextVersion({
        last: version("0.1.0"),
        commits: [commit("feat: a")],
        apiBreaking: false,
        pre: "rc",
      }).version,
    ).toBe("0.1.1-rc.1");
  });

  it("releases the base of a prerelease tag whatever the commits are", () => {
    for (const commits of [[], [commit("docs: a")], [commit("feat!: a")]]) {
      expect(
        nextVersion({ last: version("0.1.0-rc.2"), commits, ...none }),
      ).toMatchObject({ version: "0.1.0", bump: "prerelease" });
    }
  });

  it("warns in the reason when another prerelease word sorts before the last tag", () => {
    const lower = nextVersion({
      last: version("0.1.0-rc.2"),
      commits: [],
      apiBreaking: false,
      pre: "beta",
    });
    expect(lower.version).toBe("0.1.0-beta.1");
    expect(lower.reason).toContain("sorts before 0.1.0-rc.2");
    expect(lower.reason).toContain("release:apply");
    const higher = nextVersion({
      last: version("0.1.0-beta.2"),
      commits: [],
      apiBreaking: false,
      pre: "rc",
    });
    expect(higher.version).toBe("0.1.0-rc.1");
    expect(higher.reason).not.toContain("sorts before");
  });

  it("counts the next candidate with a prerelease identifier, and starts again for a new one", () => {
    expect(
      nextVersion({
        last: version("0.1.0-rc.2"),
        commits: [],
        apiBreaking: false,
        pre: "rc",
      }).version,
    ).toBe("0.1.0-rc.3");
    expect(
      nextVersion({
        last: version("0.1.0-rc.2"),
        commits: [],
        apiBreaking: false,
        pre: "beta",
      }).version,
    ).toBe("0.1.0-beta.1");
  });
});
