// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  buildReport,
  parseEnvironment,
  parseRegistryAnswer,
  parseReviewers,
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
    environment: { state: "ok" },
    reviewers: "present",
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

  it("asks only for the merge and the approval of the deployment once the packages exist on npm", () => {
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
      /Left for you: merge the Release pull request, then approve the deployment of the npm environment in GitHub; the workflow publishes the four packages\./,
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
