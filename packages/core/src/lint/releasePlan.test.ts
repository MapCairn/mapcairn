// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseArguments,
  planRelease,
  repositorySources,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/plan.mjs";

interface FakeCommit {
  hash?: string;
  subject: string;
  body?: string;
}

interface Pull {
  title?: string;
  author?: { login: string; isBot: boolean } | null;
}

const REPORT_BEFORE =
  '```ts\n\n// @public\nexport type Mode = "light" | "dark";\n\n```\n';
const REPORT_AFTER =
  '```ts\n\n// @public\nexport type Mode = "light" | "dark" | "auto";\n\n```\n';

function fakeSources(options: {
  tags?: string[];
  commits?: FakeCommit[];
  pulls?: Record<number, Pull>;
  byHash?: Record<string, number>;
  /** Pull requests in the merged list, by merge commit hash. */
  merged?: Record<string, number>;
  writers?: string[] | null;
  before?: string;
  after?: string;
  deletions?: Array<{ path: string; deletedLines: number }>;
}) {
  const seenTags: Array<string | null> = [];
  const reportTags: Array<string | null> = [];
  const deletionTags: string[] = [];
  const lookedUp: number[] = [];
  const pullRequest = (number: number) => {
    lookedUp.push(number);
    const pull = options.pulls?.[number];
    return pull === undefined
      ? null
      : {
          number,
          title: pull.title ?? `Pull request ${number}`,
          url: `https://example.test/pull/${number}`,
          author:
            pull.author === undefined
              ? { login: "someone", isBot: false }
              : pull.author,
        };
  };
  return {
    seenTags,
    reportTags,
    deletionTags,
    lookedUp,
    sources: {
      tags: () => options.tags ?? [],
      commits: (tag: string | null) => {
        seenTags.push(tag);
        return (options.commits ?? []).map((commit, index) => ({
          hash: commit.hash ?? `hash${index}`,
          subject: commit.subject,
          body: commit.body ?? "",
        }));
      },
      pullRequestOf: (hash: string) => options.byHash?.[hash] ?? null,
      mergedPullRequests: () =>
        new Map(
          Object.entries(options.merged ?? {}).flatMap(([hash, number]) => {
            const info = pullRequest(number);
            return info === null ? [] : [[hash, info] as const];
          }),
        ),
      pullRequest,
      writeAccess: () =>
        options.writers === null ? null : new Set(options.writers ?? []),
      reports: (tag: string | null) => {
        reportTags.push(tag);
        const text =
          tag === null
            ? (options.after ?? REPORT_BEFORE)
            : (options.before ?? REPORT_BEFORE);
        return {
          list: () => ["index.api.md"],
          read: (file: string) =>
            file === "packages/core/api/index.api.md" ? text : null,
        };
      },
      compatibilityDeletions: (tag: string) => {
        deletionTags.push(tag);
        return options.deletions ?? [];
      },
    },
  };
}

describe("planRelease", () => {
  it("plans the first release when there is no tag, and compares no API reports", () => {
    const { sources } = fakeSources({
      commits: [{ subject: "feat(map): add a thing (#1)" }],
      pulls: { 1: {} },
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan).toMatchObject({
      lastTag: null,
      version: "0.1.0",
      tag: "v0.1.0",
      prerelease: false,
      bump: "first",
      apiChanges: [],
    });
    expect(plan.notices).toContain(
      "There is no earlier release, so the API reports are not compared.",
    );
  });

  it("marks a prerelease version", () => {
    const { sources } = fakeSources({});
    expect(planRelease({ pre: "rc", sources })).toMatchObject({
      version: "0.1.0-rc.1",
      prerelease: true,
    });
  });

  it("lists pull requests with title, number, link and author, and leaves out release commits", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [
        { subject: "feat(map): add multi-select (#7)" },
        { subject: "chore(release): v0.1.0 (#6)" },
        { subject: "fix(core): stop a crash", hash: "abc" },
      ],
      pulls: { 7: { title: "Add multi-select" }, 9: { title: "Stop a crash" } },
      byHash: { abc: 9 },
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.version).toBe("0.1.1");
    expect(plan.pullRequests).toEqual([
      expect.objectContaining({
        number: 7,
        title: "Add multi-select",
        url: "https://example.test/pull/7",
        author: "someone",
        type: "feat",
      }),
      expect.objectContaining({
        number: 9,
        title: "Stop a crash",
        type: "fix",
      }),
    ]);
  });

  it("reads a pull request from the merged list without a call for each commit", () => {
    const { sources, lookedUp } = fakeSources({
      tags: ["v0.1.0"],
      commits: [{ subject: "fix: a (#999)", hash: "aaa" }],
      pulls: {
        12: { title: "From the list", author: { login: "octo", isBot: false } },
      },
      merged: { aaa: 12 },
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.pullRequests[0]).toMatchObject({
      number: 12,
      title: "From the list",
      author: "octo",
    });
    expect(plan.contributorsToThank).toEqual([
      { login: "octo", pullRequests: [12] },
    ]);
    expect(lookedUp).toEqual([12]);
  });

  it("finds the pull request by commit when the number in the subject is an issue", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [{ subject: "fix: a (#50)", hash: "bbb" }],
      pulls: {
        51: {
          title: "The real pull request",
          author: { login: "octo", isBot: false },
        },
      },
      byHash: { bbb: 51 },
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.pullRequests[0]).toMatchObject({
      number: 51,
      title: "The real pull request",
      author: "octo",
    });
    expect(plan.contributorsToThank).toEqual([
      { login: "octo", pullRequests: [51] },
    ]);
    expect(plan.notices.join(" ")).not.toContain("Could not read");
  });

  it("falls back to the commit subject and a notice when a pull request cannot be read", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [
        { subject: "fix: a thing (#5)" },
        { subject: "fix: no number" },
      ],
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.pullRequests[0]).toMatchObject({
      number: 5,
      title: "fix: a thing (#5)",
      author: null,
    });
    expect(plan.pullRequests[1]).toMatchObject({ number: null });
    expect(plan.notices).toContain("Could not read pull request #5.");
  });

  it("names the pull requests that are marked as breaking", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [
        { subject: "feat(core)!: change a thing (#3)" },
        { subject: "fix: other", body: "BREAKING CHANGE: yes", hash: "h" },
      ],
      pulls: { 3: {}, 4: {} },
      byHash: { h: 4 },
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.version).toBe("0.2.0");
    expect(plan.breakingPullRequests).toEqual([3, 4]);
  });

  it("counts everything since the last release tag when the last tag is a prerelease", () => {
    const { sources, seenTags } = fakeSources({
      tags: ["v0.1.0-rc.1", "v0.1.0-rc.2"],
      commits: [{ subject: "docs: words" }],
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan).toMatchObject({
      version: "0.1.0",
      bump: "prerelease",
      notesSince: null,
    });
    expect(seenTags).toEqual([null, "v0.1.0-rc.2"]);
    expect(plan.notices.join(" ")).toContain(
      "the last tag that is not a prerelease",
    );
  });

  it("compares the API reports and lists the pull requests against the last candidate for a stable plan with no stable tag", () => {
    const { sources, seenTags } = fakeSources({
      tags: ["v0.1.0-rc.1", "v0.1.0-rc.2"],
      commits: [{ subject: "feat(core): widen a type (#2)" }],
      pulls: { 2: { title: "Widen a type" } },
      after: REPORT_AFTER,
    });
    const plan = planRelease({ pre: null, sources });
    expect(seenTags).toEqual([null, "v0.1.0-rc.2"]);
    expect(plan.notesSince).toBeNull();
    expect(plan.apiChanges).toEqual([]);
    expect(plan.sinceLastCandidate.base).toBe("v0.1.0-rc.2");
    expect(plan.sinceLastCandidate.apiChanges).toHaveLength(1);
    expect(plan.sinceLastCandidate.pullRequests).toMatchObject([
      { number: 2, title: "Widen a type" },
    ]);
  });

  it("compares the candidate part with the candidate as the before side", () => {
    const { sources, reportTags, deletionTags } = fakeSources({
      tags: ["v0.1.0-rc.1", "v0.1.0-rc.2"],
      after: REPORT_AFTER,
      deletions: [
        {
          path: "packages/core/src/urlHash/sharedLinks.test.ts",
          deletedLines: 2,
        },
      ],
    });
    const plan = planRelease({ pre: null, sources });
    expect(reportTags).toEqual(["v0.1.0-rc.2", null]);
    expect(deletionTags).toEqual(["v0.1.0-rc.2"]);
    expect(plan.sinceLastCandidate.compatibilityChanges).toMatchObject([
      {
        path: "packages/core/src/urlHash/sharedLinks.test.ts",
        likelyBreaking: true,
      },
    ]);
  });

  it("points the notices at sinceLastCandidate and counts its likely breaking changes", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0-rc.1"],
      before: REPORT_AFTER,
      after: REPORT_BEFORE,
    });
    const notices = planRelease({ pre: null, sources }).notices.join("\n");
    expect(notices).toContain(
      "There is no stable release yet, so the notes part compares no API reports; sinceLastCandidate compares them against v0.1.0-rc.1.",
    );
    expect(notices).toContain(
      "sinceLastCandidate covers the changes since v0.1.0-rc.1",
    );
    expect(notices).toContain("1 likely breaking API change since v0.1.0-rc.1");
    expect(notices).not.toContain("There is no earlier release");
  });

  it("looks a pull request up once and reports an unreadable one once when both lists hold it", () => {
    const { sources, lookedUp } = fakeSources({
      tags: ["v0.1.0-rc.1"],
      commits: [
        { subject: "fix(core): lost (#8)" },
        { subject: "fix(core): seen (#9)" },
      ],
      pulls: { 9: {} },
    });
    const plan = planRelease({ pre: null, sources });
    expect(
      plan.notices.filter(
        (notice: string) => notice === "Could not read pull request #8.",
      ),
    ).toHaveLength(1);
    expect(lookedUp.filter((number) => number === 9)).toHaveLength(1);
    expect(plan.sinceLastCandidate.pullRequests).toHaveLength(2);
  });

  it("keeps the notes base at the last stable tag and adds the candidate base beside it", () => {
    const { sources, seenTags } = fakeSources({
      tags: ["v0.1.0", "v0.2.0-rc.1"],
      commits: [{ subject: "fix(core): a thing (#2)" }],
      pulls: { 2: {} },
    });
    const plan = planRelease({ pre: null, sources });
    expect(seenTags).toEqual(["v0.1.0", "v0.2.0-rc.1"]);
    expect(plan).toMatchObject({
      notesSince: "v0.1.0",
      version: "0.2.0",
      sinceLastCandidate: { base: "v0.2.0-rc.1" },
    });
  });

  it("has no candidate part when the last tag is a stable release or a candidate is planned", () => {
    const stable = fakeSources({ tags: ["v0.1.0"] });
    expect(
      planRelease({ pre: null, sources: stable.sources }).sinceLastCandidate,
    ).toBeNull();
    const candidate = fakeSources({ tags: ["v0.1.0-rc.1"] });
    expect(
      planRelease({ pre: "rc", sources: candidate.sources }).sinceLastCandidate,
    ).toBeNull();
  });

  it("reads the commits since the last tag that is not a prerelease", () => {
    const { sources, seenTags } = fakeSources({
      tags: ["v0.1.0", "v0.2.0-rc.1"],
    });
    const plan = planRelease({ pre: "rc", sources });
    expect(seenTags).toEqual(["v0.1.0"]);
    expect(plan).toMatchObject({
      lastTag: "v0.2.0-rc.1",
      notesSince: "v0.1.0",
      version: "0.2.0-rc.2",
    });
  });

  it("gives no version when nothing since the last tag asks for a release", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [{ subject: "docs: words (#2)" }],
      pulls: { 2: {} },
    });
    expect(planRelease({ pre: null, sources })).toMatchObject({
      version: null,
      tag: null,
      prerelease: false,
      bump: "none",
    });
  });

  it("lets a likely breaking API change raise the version and shows the change", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [{ subject: "feat(core): widen a type (#2)" }],
      pulls: { 2: {} },
      after: REPORT_AFTER,
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.version).toBe("0.2.0");
    expect(plan.apiChanges).toEqual([
      expect.objectContaining({
        package: "@mapcairn/core",
        entry: "index",
        kind: "union-member-added",
        likelyBreaking: true,
      }),
    ]);
  });

  it("flags removed lines in the compatibility files as likely breaking", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [{ subject: "fix: a (#2)" }],
      pulls: { 2: {} },
      deletions: [
        {
          path: "packages/core/src/urlHash/sharedLinks.test.ts",
          deletedLines: 1,
        },
      ],
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.version).toBe("0.2.0");
    expect(plan.compatibilityChanges).toEqual([
      expect.objectContaining({
        likelyBreaking: true,
        detail: expect.stringContaining("lost 1 line,"),
      }),
    ]);
  });

  it("thanks people outside the project by login, once each, and nobody else", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [
        { subject: "fix: a (#1)" },
        { subject: "fix: b (#2)" },
        { subject: "fix: c (#3)" },
        { subject: "fix: d (#4)" },
        { subject: "fix: e (#5)" },
        { subject: "fix: f (#6)" },
      ],
      writers: ["maintainer"],
      pulls: {
        1: { author: { login: "Octo", isBot: false } },
        2: { author: { login: "maintainer", isBot: false } },
        3: { author: { login: "dependabot[bot]", isBot: true } },
        4: { author: { login: "octo", isBot: false } },
        5: { author: { login: "some-app", isBot: true } },
        6: { author: null },
      },
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.contributorsToThank).toEqual([
      { login: "Octo", pullRequests: [1] },
      { login: "octo", pullRequests: [4] },
    ]);
  });

  it("lists nobody to thank, with a notice, when the write-access list cannot be read", () => {
    const { sources } = fakeSources({
      tags: ["v0.1.0"],
      commits: [{ subject: "fix: a (#1)" }],
      pulls: { 1: { author: { login: "octo", isBot: false } } },
      writers: null,
    });
    const plan = planRelease({ pre: null, sources });
    expect(plan.contributorsToThank).toEqual([]);
    expect(plan.notices.join(" ")).toContain("write access");
  });

  it("names what a person must read for, which no check sees", () => {
    const { sources } = fakeSources({});
    expect(planRelease({ pre: null, sources }).reviewByHand).toHaveLength(2);
  });
});

describe("parseArguments", () => {
  it("accepts no arguments and a prerelease word", () => {
    expect(parseArguments([])).toEqual({ pre: null });
    expect(parseArguments(["--pre", "rc"])).toEqual({ pre: "rc" });
  });

  it("rejects anything else", () => {
    for (const argv of [
      ["--pre"],
      ["--pre", "RC1"],
      ["--other"],
      ["--pre", "rc", "x"],
    ]) {
      expect(parseArguments(argv)).toHaveProperty("error");
    }
  });
});

describe("repositorySources on a git repository", () => {
  const folders: string[] = [];

  afterEach(() => {
    for (const folder of folders.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  function git(root: string, ...args: string[]): string {
    const result = spawnSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  }

  function write(root: string, file: string, text: string): void {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }

  function repository(): string {
    const root = mkdtempSync(path.join(tmpdir(), "mapcairn-plan-"));
    folders.push(root);
    git(root, "init", "-q", "-b", "main");
    write(root, "packages/core/api/index.api.md", REPORT_BEFORE);
    write(root, "packages/core/src/urlHash/sharedLinks.test.ts", "one\ntwo\n");
    write(root, "docs/a.md", "a");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat(core): first (#1)");
    git(root, "tag", "v0.1.0");
    git(root, "tag", "v0.2.0-rc.1");
    git(root, "tag", "not-a-release");
    write(root, "docs/a.md", "b");
    git(root, "commit", "-q", "-am", "docs: not in a package");
    write(root, "packages/core/api/index.api.md", REPORT_AFTER);
    write(root, "packages/core/src/urlHash/sharedLinks.test.ts", "one\n");
    git(
      root,
      "commit",
      "-q",
      "-am",
      "fix(core): second (#2)",
      "-m",
      "BREAKING CHANGE: details",
    );
    return root;
  }

  it("lists tags, and commits that touch the packages since a tag, with their bodies", () => {
    const sources = repositorySources(repository());
    expect(sources.tags().sort()).toEqual(["v0.1.0", "v0.2.0-rc.1"]);
    const since = sources.commits("v0.1.0");
    expect(since).toHaveLength(1);
    expect(since[0].subject).toBe("fix(core): second (#2)");
    expect(since[0].body).toContain("BREAKING CHANGE: details");
    expect(since[0].hash).toMatch(/^[0-9a-f]{40}$/);
    expect(
      sources
        .commits(null)
        .map((commit: { subject: string }) => commit.subject),
    ).toEqual(["fix(core): second (#2)", "feat(core): first (#1)"]);
  });

  it("asks gh once for the merged pull requests and keys them by merge commit", () => {
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      return {
        ok: true,
        stdout: JSON.stringify([
          {
            number: 7,
            title: "Seven",
            url: "u7",
            author: { login: "octo", is_bot: false },
            mergeCommit: { oid: "c7" },
          },
          {
            number: 8,
            title: "Eight",
            url: "u8",
            author: { login: "dependabot", is_bot: true },
            mergeCommit: null,
          },
        ]),
      };
    };
    const merged = repositorySources(repository(), gh).mergedPullRequests();
    expect([...merged.keys()]).toEqual(["c7"]);
    expect(merged.get("c7")).toEqual({
      number: 7,
      title: "Seven",
      url: "u7",
      author: { login: "octo", isBot: false },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        "pr",
        "list",
        "--state",
        "merged",
        "--base",
        "main",
        "--limit",
        "1000",
      ]),
    );
    expect(calls[0].join(" ")).toContain("number,title,url,author,mergeCommit");
  });

  it("gives an empty merged list when gh fails, so each commit is looked up on its own", () => {
    const sources = repositorySources(repository(), () => ({
      ok: false,
      stdout: "",
    }));
    expect(sources.mergedPullRequests().size).toBe(0);
    expect(sources.pullRequest(5)).toBeNull();
    expect(sources.pullRequestOf("abc")).toBeNull();
  });

  it("reads one pull request, caching it, and the pull request of a commit", () => {
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      return args[0] === "api"
        ? { ok: true, stdout: "51\n" }
        : {
            ok: true,
            stdout: JSON.stringify({
              number: 5,
              title: "Five",
              url: "u5",
              author: { login: "octo" },
            }),
          };
    };
    const sources = repositorySources(repository(), gh);
    expect(sources.pullRequest(5)).toEqual({
      number: 5,
      title: "Five",
      url: "u5",
      author: { login: "octo", isBot: false },
    });
    sources.pullRequest(5);
    expect(calls.filter((call) => call[0] === "pr")).toHaveLength(1);
    expect(sources.pullRequestOf("abc")).toBe(51);
    expect(calls.at(-1)?.join(" ")).toContain("commits/abc/pulls");
  });

  it("reads reports at a tag and in the working tree", () => {
    const root = repository();
    const sources = repositorySources(root);
    const old = sources.reports("v0.1.0");
    expect(old.list("packages/core/api")).toEqual(["index.api.md"]);
    expect(old.read("packages/core/api/index.api.md")).toBe(REPORT_BEFORE);
    expect(old.read("packages/core/api/missing.api.md")).toBeNull();
    const now = sources.reports(null);
    expect(now.list("packages/core/api")).toEqual(["index.api.md"]);
    expect(now.list("packages/map/api")).toEqual([]);
    expect(now.read("packages/core/api/index.api.md")).toBe(REPORT_AFTER);
    expect(now.read("packages/map/api/index.api.md")).toBeNull();
  });

  it("finds compatibility files that lost lines since a tag", () => {
    const sources = repositorySources(repository());
    expect(sources.compatibilityDeletions("v0.1.0")).toEqual([
      {
        path: "packages/core/src/urlHash/sharedLinks.test.ts",
        deletedLines: 1,
      },
    ]);
    expect(sources.compatibilityDeletions("HEAD")).toEqual([]);
  });
});
