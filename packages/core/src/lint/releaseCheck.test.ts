// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  buildReport,
  parseAdminBypass,
  parseEnvironment,
  parseIdentity,
  parseRegistryAnswer,
  parseReviewers,
  readIdentity,
  readReleasedAsTagged,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/check.mjs";

const NAMES = [
  "@mapcairn/core",
  "@mapcairn/map",
  "@mapcairn/react",
  "@mapcairn/theme",
  "@mapcairn/adapter-maplibre",
  "@mapcairn/sdk",
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
    releasedAsTagged: false,
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
    environment: { state: "ok" },
    reviewers: "present",
    adminBypass: false,
    identity: "limited",
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
      "Versions: core, react, theme, map, adapter-maplibre and sdk are all 0.1.0-rc.1; internal ranges match.",
    );
    expect(text).toContain("Notes: CHANGELOG.md has a section for 0.1.0-rc.1");
    expect(text).toContain("Tarballs: 6 packed, contents as expected");
    expect(text).toContain("core 212 kB");
    expect(text).toContain("none of the SDK packages is on npm yet");
    expect(text).toMatch(/Left for you: .*merge the Release pull request/);
    expect(text).toMatch(/Left for you: .*by hand/);
    expect(blockers).toEqual([]);
  });

  it("asks only for the merge and the approval of the deployment once the packages exist on npm", () => {
    const registry = Object.fromEntries(
      NAMES.map((name) => [
        name,
        { exists: true, latest: "0.1.0-rc.1", provenance: true },
      ]),
    );
    const { text, blockers } = report({ registry });
    expect(text).toContain("all the SDK packages exist");
    expect(text).toContain("provenance");
    expect(text).toMatch(
      /Left for you: merge the Release pull request, then approve the deployment of the npm environment in GitHub; the workflow publishes the packages\./,
    );
    expect(text).not.toContain("npmjs.com");
    expect(text).not.toContain("staged");
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

  it("names the adapter and the umbrella as the two packages to upload by hand when the four others are on npm", () => {
    const registry = Object.fromEntries(
      NAMES.map((name) => [
        name,
        name === "@mapcairn/sdk" || name === "@mapcairn/adapter-maplibre"
          ? { exists: false }
          : { exists: true, latest: "0.1.0-rc.2", provenance: true },
      ]),
    );
    const { text, blockers } = report({ registry });
    expect(text).toContain(
      "not on npm yet: @mapcairn/adapter-maplibre, @mapcairn/sdk.",
    );
    expect(text).toMatch(
      /Left for you: .*two-factor authentication.*disallow tokens.*Re-run failed jobs.*link their trusted publishers when the next Release pull request is ready/,
    );
    expect(text).toMatch(/Left for you: .*Re-run failed jobs/);
    expect(blockers).toEqual([]);
  });

  it("reports the registry per package when only some are on npm, without blocking, and says what the run will do", () => {
    const registry = Object.fromEntries(
      NAMES.map((name) => [
        name,
        name === "@mapcairn/core" || name === "@mapcairn/react"
          ? { exists: true, latest: "0.1.0-rc.1", provenance: true }
          : { exists: false },
      ]),
    );
    const { text, blockers } = report({ registry });
    expect(text).toContain("on npm: @mapcairn/core, @mapcairn/react");
    expect(text).toContain("not on npm yet: @mapcairn/theme, @mapcairn/map");
    expect(text).toMatch(/Left for you: .*approve the deployment/);
    expect(text).toMatch(/Left for you: .*by hand/);
    expect(text).toMatch(/Left for you: .*Re-run failed jobs/);
    expect(blockers).toEqual([]);
  });

  it("says the registry could not be read, and does not guess", () => {
    const { text, blockers } = report({ registry: null });
    expect(text).toContain("npm: the registry could not be read");
    expect(blockers).toEqual([]);
    expect(text).not.toContain("by hand");
  });

  it("blocks when the versions differ and names them", () => {
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

  it("blocks when the tag already exists and the release notes were changed since it, as on a Release branch that did not bump the version", () => {
    const { text, blockers } = report({
      tags: ["v0.1.0-rc.1"],
      releasedAsTagged: false,
    });
    expect(text).toContain("v0.1.0-rc.1 is already tagged");
    expect(blockers.length).toBe(1);
  });

  describe("between releases, when the current version is tagged and CHANGELOG.md is as it was at the tag", () => {
    const between = () =>
      report({ tags: ["v0.1.0-rc.1"], releasedAsTagged: true });

    it("is a notice and no blocker, so the exit is 0", () => {
      const { text, blockers } = between();
      expect(text).toContain(
        "Tag: v0.1.0-rc.1 is already released; the next release needs a new version.",
      );
      expect(text).not.toContain("is already tagged");
      expect(blockers).toEqual([]);
    });

    it("says in Left for you that nothing is needed yet, and does not say to fix problems", () => {
      const { text } = between();
      expect(text).toMatch(
        /Left for you: nothing yet\. v0\.1\.0-rc\.1 is already released/,
      );
      expect(text).not.toContain("Fix the problems");
    });

    it("still blocks, with the usual line, when something else is wrong", () => {
      const { text, blockers } = report({
        tags: ["v0.1.0-rc.1"],
        releasedAsTagged: true,
        environment: { state: "missing" },
      });
      expect(blockers.join("\n")).toContain("npm environment");
      expect(text).toMatch(/Left for you: Fix the problems above first\./);
    });
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
        dist: {
          attestations: {
            url: "https://example.test/a",
            provenance: { predicateType: "https://slsa.dev/provenance/v1" },
          },
        },
      }),
      stderr: "",
    });
    expect(answer).toEqual({
      exists: true,
      latest: "0.1.0-rc.2",
      provenance: true,
    });
  });

  it("does not count an attestation that is not SLSA provenance", () => {
    for (const attestations of [
      { url: "https://example.test/a" },
      { provenance: { predicateType: "https://example.test/other" } },
      { provenance: {} },
    ]) {
      expect(
        parseRegistryAnswer({
          status: 0,
          stdout: JSON.stringify({
            version: "0.1.0",
            dist: { attestations },
          }),
          stderr: "",
        }),
      ).toEqual({ exists: true, latest: "0.1.0", provenance: false });
    }
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

describe("the npm environment in the report", () => {
  it("is a line, and no blocker, when deployments are limited to main", () => {
    const { text, blockers } = report();
    expect(text).toContain(
      "npm environment: exists, and deployments are limited to main",
    );
    expect(blockers).toEqual([]);
  });

  it("blocks on a missing environment, and says to create it before the first rehearsal", () => {
    const { text, blockers } = report({ environment: { state: "missing" } });
    expect(text).toContain("before the first rehearsal");
    expect(blockers.join("\n")).toContain("npm environment");
  });

  it("blocks on an environment that is not limited to main", () => {
    const { blockers } = report({
      environment: { state: "unprotected", detail: "it allows every branch" },
    });
    expect(blockers.join("\n")).toContain("it allows every branch");
  });

  it("says it could not check, without blocking", () => {
    const { text, blockers } = report({ environment: { state: "unknown" } });
    expect(text).toContain("could not be checked");
    expect(blockers).toEqual([]);
  });
});

describe("the npm environment's required reviewers in the report", () => {
  it("is a line, and no warning, when someone has to approve the deployment", () => {
    const { text, warnings, blockers } = report();
    expect(text).toContain(
      "npm environment reviewers: a required reviewer approves each deployment.",
    );
    expect(text).not.toContain("Warning");
    expect(warnings).toEqual([]);
    expect(blockers).toEqual([]);
  });

  it("warns in Left for you, without blocking, when nobody has to approve, because a merge then publishes", () => {
    const { text, warnings, blockers } = report({ reviewers: "none" });
    expect(text).toMatch(
      /Left for you: .*Warning: the npm environment has no required reviewer: a merge of a Release pull request publishes without a second approval\./,
    );
    expect(warnings.join("\n")).toContain("no required reviewer");
    expect(blockers).toEqual([]);
  });

  it("keeps the warning when there is a blocker, so it is not lost behind it", () => {
    const { text } = report({ reviewers: "none", tags: ["v0.1.0-rc.1"] });
    expect(text).toMatch(
      /Left for you: Fix the problems above first\..*Warning/,
    );
  });

  it("says it could not check, in Left for you, without blocking", () => {
    const { text, blockers } = report({ reviewers: "unknown" });
    expect(text).toMatch(
      /Left for you: .*Could not check whether the npm environment has a required reviewer/,
    );
    expect(blockers).toEqual([]);
  });
});

describe("the reviewer rule when a merge would publish", () => {
  const onNpm = Object.fromEntries(
    NAMES.map((name) => [
      name,
      { exists: true, latest: "0.1.0-rc.1", provenance: false },
    ]),
  );

  it("blocks when nobody has to approve and all the packages are on npm, because a merge then publishes", () => {
    const { text, blockers } = report({ reviewers: "none", registry: onNpm });
    expect(blockers.join("\n")).toContain("no required reviewer");
    expect(blockers.join("\n")).toContain(
      "publishes without a second approval",
    );
    expect(text).toMatch(/Left for you: Fix the problems above first\./);
  });

  it("stays a warning when the answer is unknown, even with every package on npm", () => {
    const { blockers, text } = report({
      reviewers: "unknown",
      registry: onNpm,
    });
    expect(blockers).toEqual([]);
    expect(text).toContain("Could not check whether");
  });

  it("blocks when nobody has to approve and some packages are on npm, because a merge then publishes those", () => {
    const some = { ...onNpm, "@mapcairn/map": { exists: false } };
    const { blockers } = report({ reviewers: "none", registry: some });
    expect(blockers.join("\n")).toContain(
      "publishes without a second approval",
    );
  });

  it("blocks when nobody has to approve and the registry could not be read, since a merge may then publish", () => {
    const { blockers } = report({ reviewers: "none", registry: null });
    expect(blockers.join("\n")).toContain("no required reviewer");
    expect(blockers.join("\n")).toContain("could not be read");
  });

  it("does not block while the first publish is by hand, since the npm job publishes nothing", () => {
    expect(report({ reviewers: "none" }).blockers).toEqual([]);
  });
});

describe("admins who can bypass the npm environment", () => {
  it("warns, and says what it means, when admins can bypass", () => {
    const { text, warnings, blockers } = report({ adminBypass: true });
    expect(text).toMatch(
      /Left for you: .*Warning: .*administrators can bypass/,
    );
    expect(warnings.join("\n")).toContain("administrators can bypass");
    expect(blockers).toEqual([]);
  });

  it("says nothing when they cannot, or when it could not be read", () => {
    expect(report({ adminBypass: false }).warnings).toEqual([]);
    expect(report({ adminBypass: null }).warnings).toEqual([]);
  });
});

describe("parseAdminBypass", () => {
  it("reads can_admins_bypass, and is null when the answer cannot be read", () => {
    const ok = (value: unknown) => ({
      ok: true,
      stdout: JSON.stringify(value),
      stderr: "",
    });
    expect(parseAdminBypass(ok({ can_admins_bypass: true }))).toBe(true);
    expect(parseAdminBypass(ok({ can_admins_bypass: false }))).toBe(false);
    expect(parseAdminBypass(ok({}))).toBeNull();
    expect(parseAdminBypass({ ok: false, stdout: "", stderr: "x" })).toBeNull();
    expect(parseAdminBypass({ ok: true, stdout: "no", stderr: "" })).toBeNull();
  });
});

describe("parseReviewers", () => {
  const ok = (value: unknown) => ({
    ok: true,
    stdout: JSON.stringify(value),
    stderr: "",
  });
  const reviewerRule = {
    type: "required_reviewers",
    prevent_self_review: false,
    reviewers: [{ type: "User", reviewer: { login: "someone" } }],
  };

  it("is present when a required-reviewers rule names someone", () => {
    expect(
      parseReviewers(
        ok({ protection_rules: [{ type: "branch_policy" }, reviewerRule] }),
      ),
    ).toBe("present");
  });

  it.each([
    [[{ type: "branch_policy" }]],
    [[{ type: "wait_timer", wait_timer: 5 }]],
    [[{ type: "required_reviewers", reviewers: [] }]],
    [[{ type: "wait_timer", reviewers: [{ type: "User" }] }]],
    [[]],
  ])("is none for the rules %j", (rules) => {
    expect(parseReviewers(ok({ protection_rules: rules }))).toBe("none");
  });

  it("is unknown, and does not throw, when the rules are not a list", () => {
    expect(parseReviewers(ok({ protection_rules: "none" }))).toBe("unknown");
    expect(parseReviewers(ok({ protection_rules: { a: 1 } }))).toBe("unknown");
  });

  it("is none when the answer has no rules at all", () => {
    expect(parseReviewers(ok({ name: "npm" }))).toBe("none");
  });

  it("is unknown when the answer could not be read or is not JSON", () => {
    expect(parseReviewers({ ok: false, stdout: "", stderr: "HTTP 403" })).toBe(
      "unknown",
    );
    expect(
      parseReviewers({ ok: false, stdout: "", stderr: "HTTP 404 Not Found" }),
    ).toBe("unknown");
    expect(parseReviewers({ ok: true, stdout: "nope", stderr: "" })).toBe(
      "unknown",
    );
  });
});

describe("parseEnvironment", () => {
  const ok = (value: unknown) => ({
    ok: true,
    stdout: JSON.stringify(value),
    stderr: "",
  });
  const environment = ok({
    name: "npm",
    deployment_branch_policy: {
      custom_branch_policies: true,
      protected_branches: false,
    },
  });

  it("is ok for exactly one branch policy, main", () => {
    expect(
      parseEnvironment(
        environment,
        ok({ branch_policies: [{ name: "main", type: "branch" }] }),
      ),
    ).toEqual({ state: "ok" });
  });

  it.each([
    [
      [
        { name: "main", type: "branch" },
        { name: "dev", type: "branch" },
      ],
    ],
    [[{ name: "v*", type: "tag" }]],
    [[{ name: "main*", type: "branch" }]],
    [[]],
  ])("is unprotected for the policies %j", (policies) => {
    expect(
      parseEnvironment(environment, ok({ branch_policies: policies })).state,
    ).toBe("unprotected");
  });

  it("is unprotected when every branch may deploy or only protected branches", () => {
    expect(
      parseEnvironment(ok({ deployment_branch_policy: null }), ok({})).state,
    ).toBe("unprotected");
    expect(
      parseEnvironment(
        ok({
          deployment_branch_policy: {
            custom_branch_policies: false,
            protected_branches: true,
          },
        }),
        ok({}),
      ).state,
    ).toBe("unprotected");
  });

  it("is a blocker, not unknown, when protected branches may deploy and the policies cannot be read", () => {
    const protectedOnly = ok({
      deployment_branch_policy: {
        custom_branch_policies: false,
        protected_branches: true,
      },
    });
    expect(
      parseEnvironment(protectedOnly, {
        ok: false,
        stdout: "",
        stderr: "HTTP 403",
      }).state,
    ).toBe("unprotected");
  });

  it("is missing on a not-found answer and unknown on any other failure", () => {
    expect(
      parseEnvironment(
        { ok: false, stdout: "", stderr: "gh: Not Found (HTTP 404)" },
        ok({}),
      ).state,
    ).toBe("missing");
    expect(
      parseEnvironment({ ok: false, stdout: "", stderr: "HTTP 403" }, ok({}))
        .state,
    ).toBe("unknown");
    expect(
      parseEnvironment(environment, {
        ok: false,
        stdout: "",
        stderr: "timeout",
      }).state,
    ).toBe("unknown");
    expect(
      parseEnvironment({ ok: true, stdout: "not json", stderr: "" }, ok({}))
        .state,
    ).toBe("unknown");
  });
});

describe("the GitHub identity of the session", () => {
  it("warns, without blocking, when the session has administrator access, and says to use a limited token", () => {
    const { text, warnings, blockers } = report({ identity: "administrator" });
    expect(text).toContain("GitHub identity: administrator access");
    expect(text).toContain("limited fine-grained token");
    expect(warnings.join("\n")).toContain("administrator access");
    expect(blockers).toEqual([]);
  });

  it("says a limited identity is fine and warns about nothing", () => {
    const { text, warnings } = report({ identity: "limited" });
    expect(text).toContain("GitHub identity: no administrator access");
    expect(warnings).toEqual([]);
  });

  it("notes, without warning, when the identity could not be checked", () => {
    const { text, warnings, blockers } = report({ identity: "unknown" });
    expect(text).toContain("GitHub identity: could not be checked");
    expect(warnings).toEqual([]);
    expect(blockers).toEqual([]);
  });
});

describe("parseIdentity", () => {
  const answer = (ok: boolean, stdout = "", stderr = "") => ({
    ok,
    stdout,
    stderr,
  });

  it("reads a branch-protection answer as administrator access", () => {
    expect(parseIdentity(answer(true, "{}"))).toBe("administrator");
  });

  it("reads 'Branch not protected' as administrator access, because only an administrator sees it", () => {
    expect(
      parseIdentity(answer(false, "", "gh: Branch not protected (HTTP 404)")),
    ).toBe("administrator");
  });

  it("reads a refusal for lack of permission as a limited identity", () => {
    expect(
      parseIdentity(
        answer(
          false,
          "",
          "gh: Resource not accessible by personal access token (HTTP 403)",
        ),
      ),
    ).toBe("limited");
    expect(
      parseIdentity(answer(false, "", "gh: Must have admin rights (HTTP 403)")),
    ).toBe("limited");
  });

  it("says unknown when gh is missing, signed out or the answer is something else", () => {
    expect(parseIdentity(answer(false))).toBe("unknown");
    expect(
      parseIdentity(
        answer(false, "", "To get started with GitHub CLI, run: gh auth login"),
      ),
    ).toBe("unknown");
    expect(parseIdentity(answer(false, "", "gh: Not Found (HTTP 404)"))).toBe(
      "unknown",
    );
  });
});

describe("readIdentity", () => {
  it("probes the branch protection of main on the project repository, read-only", () => {
    const calls: Array<[string, string[], string]> = [];
    const identity = readIdentity("/work", (command, args, cwd) => {
      calls.push([command, args, cwd]);
      return {
        ok: false,
        stdout: "",
        stderr:
          "gh: Resource not accessible by personal access token (HTTP 403)",
      };
    });
    expect(calls).toEqual([
      [
        "gh",
        ["api", "repos/MapCairn/mapcairn/branches/main/protection"],
        "/work",
      ],
    ]);
    expect(identity).toBe("limited");
  });
});

describe("readReleasedAsTagged", () => {
  const ok = { ok: true, stdout: "", stderr: "" };
  const no = { ok: false, stdout: "", stderr: "" };

  it("is true when the version is tagged, the tag is an ancestor of HEAD and CHANGELOG.md has not changed since it", () => {
    const calls: string[][] = [];
    const released = readReleasedAsTagged({
      root: "/work",
      version: "0.1.0-rc.3",
      tags: ["v0.1.0-rc.2", "v0.1.0-rc.3"],
      runGit: (args: string[]) => {
        calls.push(args);
        return ok;
      },
    });
    expect(released).toBe(true);
    expect(calls).toEqual([
      ["merge-base", "--is-ancestor", "v0.1.0-rc.3", "HEAD"],
      ["diff", "--quiet", "v0.1.0-rc.3", "HEAD", "--", "CHANGELOG.md"],
    ]);
  });

  it("is false when the version is not tagged, without asking git", () => {
    const runGit = () => {
      throw new Error("git must not be called");
    };
    expect(
      readReleasedAsTagged({
        root: "/work",
        version: "0.1.0-rc.3",
        tags: ["v0.1.0-rc.2"],
        runGit,
      }),
    ).toBe(false);
    expect(
      readReleasedAsTagged({ root: "/work", version: null, tags: [], runGit }),
    ).toBe(false);
  });

  it("is false when the tag is not an ancestor of HEAD, or CHANGELOG.md changed since it", () => {
    const input = {
      root: "/work",
      version: "0.1.0-rc.3",
      tags: ["v0.1.0-rc.3"],
    };
    expect(readReleasedAsTagged({ ...input, runGit: () => no })).toBe(false);
    expect(
      readReleasedAsTagged({
        ...input,
        runGit: (args: string[]) => (args[0] === "diff" ? no : ok),
      }),
    ).toBe(false);
  });
});
