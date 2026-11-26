// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  breakingApiChanges,
  escapeAnnotation,
  isMarkedBreaking,
  readReports,
  releasedReports,
  runApiBreakingCheck,
  runFromEnvironment,
  SEVERITY,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/apiBreakingCheck.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

interface Source {
  list: (folder: string) => string[];
  read: (file: string) => string | null;
}

/** A report source holding the given files, keyed by repository path. */
function sourceOf(files: Record<string, string>): Source {
  return {
    list: (folder) =>
      Object.keys(files)
        .filter((file) => file.startsWith(`${folder}/`))
        .map((file) => file.slice(folder.length + 1)),
    read: (file) => files[file] ?? null,
  };
}

function report(...blocks: string[]): string {
  return [
    '## API Report File for "@mapcairn/example"',
    "",
    "```ts",
    "",
    blocks.join("\n\n"),
    "",
    "```",
    "",
  ].join("\n");
}

/**
 * Trimmed copies of the two reports from the pull request that removed
 * `dataCost` from `LayerDefinitionBase` and 11 members from the `MessageKey`
 * union, which API Extractor prints on one line. The member list is cut to a
 * few hundred names, and the 11 removed ones sit among them as they did.
 */
const REMOVED_KEYS = [
  "layer.earth-at-night.dataCost",
  "layer.earthquakes.dataCost",
  "layer.fire-hotspots-viirs.dataCost",
  "layer.fire-hotspots.dataCost",
  "layer.imagery.dataCost",
  "layer.population.dataCost",
  "layer.rainfall-half-hourly.dataCost",
  "layer.rainfall.dataCost",
  "layer.sea-temperature-anomaly.dataCost",
  "layer.world-countries.dataCost",
  "layer.gdacs.dataCost",
];

function messageKeyBlock(withRemoved: boolean): string {
  const kept = Array.from({ length: 300 }, (_, index) => `app.key${index}`);
  const keys = withRemoved
    ? [...kept.slice(0, 150), ...REMOVED_KEYS, ...kept.slice(150)]
    : kept;
  return `// @public\nexport type MessageKey = ${keys.map((key) => `"${key}"`).join(" | ")};`;
}

function layerBaseBlock(withDataCost: boolean): string {
  const cost = withDataCost ? "    readonly dataCost: DefinitionText;\n" : "";
  return `// @public\nexport interface LayerDefinitionBase {\n    readonly attribution: readonly LayerAttribution[];\n${cost}    readonly description: DefinitionText;\n}`;
}

const CORE = "packages/core/api/index.api.md";

const REMOVAL_BEFORE = sourceOf({
  [CORE]: report(layerBaseBlock(true), messageKeyBlock(true)),
});
const REMOVAL_AFTER = sourceOf({
  [CORE]: report(layerBaseBlock(false), messageKeyBlock(false)),
});

/** The theme report before and after the pull request that added `syntaxPalette`. */
const THEME = "packages/theme/api/index.api.md";
const NAMESPACE_BEFORE = `// @public\nexport namespace tokenValues {\n    export {\n        accent,\n        dataMarker,\n        representativeBackdrops\n    }\n}`;
const NAMESPACE_AFTER = `// @public\nexport namespace tokenValues {\n    export {\n        accent,\n        dataMarker,\n        SyntaxRoles,\n        syntaxPalette,\n        representativeBackdrops\n    }\n}`;
const ADDITIVE_BEFORE = sourceOf({ [THEME]: report(NAMESPACE_BEFORE) });
const ADDITIVE_AFTER = sourceOf({ [THEME]: report(NAMESPACE_AFTER) });

describe("breakingApiChanges", () => {
  it("names a member removed from one very long union line, and the interface member that went with it", () => {
    const names = breakingApiChanges(REMOVAL_BEFORE, REMOVAL_AFTER).map(
      (change: { name: string; kind: string }) =>
        `${change.name}:${change.kind}`,
    );
    expect(names).toEqual([
      "LayerDefinitionBase:changed",
      "MessageKey:union-member-removed",
    ]);
  });

  it("counts every one of the 11 removed members", () => {
    const [, union] = breakingApiChanges(REMOVAL_BEFORE, REMOVAL_AFTER);
    expect(union.detail).toContain("lost 11 members");
  });

  it("finds nothing in an additive change", () => {
    expect(breakingApiChanges(ADDITIVE_BEFORE, ADDITIVE_AFTER)).toEqual([]);
  });

  it("finds nothing when no report changed", () => {
    expect(breakingApiChanges(REMOVAL_BEFORE, REMOVAL_BEFORE)).toEqual([]);
  });
});

describe("an entry point the last release does not have", () => {
  const RELEASED_WITHOUT_IT = sourceOf({});
  const RELEASED_WITH_IT = sourceOf({ [CORE]: "released" });

  it("cannot break anyone, so its likely-breaking change is left out", () => {
    expect(
      breakingApiChanges(REMOVAL_BEFORE, REMOVAL_AFTER, RELEASED_WITHOUT_IT),
    ).toEqual([]);
  });

  it("still counts when the last release has the entry point", () => {
    expect(
      breakingApiChanges(REMOVAL_BEFORE, REMOVAL_AFTER, RELEASED_WITH_IT)
        .length,
    ).toBeGreaterThan(0);
  });

  it("excludes only the entry point the release lacks, when released and unreleased ones change together", () => {
    const SDK_BROWSER = "packages/sdk/api/browser.api.md";
    const body = (cost: boolean) =>
      report(layerBaseBlock(cost), messageKeyBlock(cost));
    const before = sourceOf({ [CORE]: body(true), [SDK_BROWSER]: body(true) });
    const after = sourceOf({ [CORE]: body(false), [SDK_BROWSER]: body(false) });
    const entries = breakingApiChanges(before, after, RELEASED_WITH_IT).map(
      (change: { package: string; entry: string }) =>
        `${change.package}:${change.entry}`,
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries)).toEqual(new Set(["@mapcairn/core:index"]));
  });

  it("still counts a released entry point that the pull request removes", () => {
    const changes = breakingApiChanges(
      REMOVAL_BEFORE,
      sourceOf({}),
      RELEASED_WITH_IT,
    );
    expect(changes.length).toBeGreaterThan(0);
  });

  it("counts everything when there is no release to compare with", () => {
    expect(
      breakingApiChanges(REMOVAL_BEFORE, REMOVAL_AFTER, null).length,
    ).toBeGreaterThan(0);
  });

  it("lets an unmarked pull request pass", () => {
    const code = runApiBreakingCheck({
      author: "someone",
      labels: [],
      title: "feat(sdk): add an event",
      body: "",
      before: REMOVAL_BEFORE,
      after: REMOVAL_AFTER,
      released: RELEASED_WITHOUT_IT,
      log: () => undefined,
      summarise: () => undefined,
    });
    expect(code).toBe(0);
  });
});

describe("isMarkedBreaking", () => {
  it("accepts a ! after the type, with or without a scope", () => {
    expect(isMarkedBreaking("refactor!: remove a field", "")).toBe(true);
    expect(isMarkedBreaking("feat(core)!: rename a port", "")).toBe(true);
  });

  it("accepts a BREAKING CHANGE footer in the description", () => {
    expect(
      isMarkedBreaking(
        "refactor: remove a field",
        "Fixes #1\n\nBREAKING CHANGE: dataCost is gone.",
      ),
    ).toBe(true);
  });

  it("does not accept an unmarked title, nor a ! inside the description text", () => {
    expect(isMarkedBreaking("refactor: remove a field", "")).toBe(false);
    expect(isMarkedBreaking("feat(docs): add a palette", "a ! b")).toBe(false);
  });
});

describe("runApiBreakingCheck", () => {
  it("fails a pull request by default", () => {
    expect(SEVERITY).toBe("error");
  });

  it("fails an unmarked breaking change with the default severity", () => {
    const lines: string[] = [];
    const code = runApiBreakingCheck({
      author: "someone",
      labels: [],
      title: "refactor: remove the data cost",
      body: "",
      before: REMOVAL_BEFORE,
      after: REMOVAL_AFTER,
      log: (line: string) => lines.push(line),
      summarise: () => undefined,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("::error");
  });

  it("passes the same change with the default severity when the description has a BREAKING CHANGE footer", () => {
    const code = runApiBreakingCheck({
      author: "someone",
      labels: [],
      title: "refactor: remove the data cost",
      body: "Removes it.\n\nBREAKING CHANGE: the data cost key is gone.",
      before: REMOVAL_BEFORE,
      after: REMOVAL_AFTER,
      log: () => undefined,
      summarise: () => undefined,
    });
    expect(code).toBe(0);
  });

  it("passes the same change with the default severity when the title carries a !", () => {
    const code = runApiBreakingCheck({
      author: "someone",
      labels: [],
      title: "refactor!: remove the data cost",
      body: "",
      before: REMOVAL_BEFORE,
      after: REMOVAL_AFTER,
      log: () => undefined,
      summarise: () => undefined,
    });
    expect(code).toBe(0);
  });

  function run(
    title: string,
    before: Source,
    after: Source,
    extra: {
      author?: string;
      labels?: string[];
      body?: string;
      severity?: string;
    } = {},
  ) {
    const lines: string[] = [];
    const summary: string[] = [];
    const code = runApiBreakingCheck({
      author: extra.author ?? "someone",
      labels: extra.labels ?? [],
      title,
      body: extra.body ?? "",
      before,
      after,
      log: (line: string) => lines.push(line),
      summarise: (text: string) => summary.push(text),
      severity: extra.severity ?? "error",
    });
    return { code, lines, summary };
  }

  it("fails the real removal under a refactor title, naming what to do", () => {
    const { code, lines } = run(
      "refactor: remove the data cost",
      REMOVAL_BEFORE,
      REMOVAL_AFTER,
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("::error");
    expect(lines.join("\n")).toContain("MessageKey");
    expect(lines.join("\n")).toContain("refactor!:");
  });

  it("passes the same removal when the title carries a !", () => {
    const { code, lines } = run(
      "refactor!: remove the data cost",
      REMOVAL_BEFORE,
      REMOVAL_AFTER,
    );
    expect(code).toBe(0);
    expect(lines).toEqual([]);
  });

  it("passes the same removal when the description ends with a BREAKING CHANGE footer", () => {
    const { code } = run(
      "refactor: remove the data cost",
      REMOVAL_BEFORE,
      REMOVAL_AFTER,
      {
        body: "Fixes #1\n\nBREAKING CHANGE: dataCost is removed.",
      },
    );
    expect(code).toBe(0);
  });

  it("passes the additive change under a feat(docs) title", () => {
    const { code, lines } = run(
      "feat(docs): colour the code blocks",
      ADDITIVE_BEFORE,
      ADDITIVE_AFTER,
    );
    expect(code).toBe(0);
    expect(lines).toEqual([]);
  });

  it("passes when no report changed", () => {
    expect(run("fix: a bug", REMOVAL_BEFORE, REMOVAL_BEFORE).code).toBe(0);
  });

  it("skips Release pull requests, by label and by title, and Dependabot", () => {
    const release = run("chore: x", REMOVAL_BEFORE, REMOVAL_AFTER, {
      labels: ["release"],
    });
    const titled = run("chore(release): 0.3.0", REMOVAL_BEFORE, REMOVAL_AFTER);
    const bot = run("build(deps): bump x", REMOVAL_BEFORE, REMOVAL_AFTER, {
      author: "dependabot[bot]",
    });
    expect([release.code, titled.code, bot.code]).toEqual([0, 0, 0]);
  });

  it("writes the findings to the job summary", () => {
    const { summary } = run(
      "refactor: remove the data cost",
      REMOVAL_BEFORE,
      REMOVAL_AFTER,
    );
    expect(summary.join("")).toContain("LayerDefinitionBase");
  });
});

describe("the step in ci.yml", () => {
  const workflow = readFileSync(
    path.join(REPO, ".github/workflows/ci.yml"),
    "utf8",
  );
  const build = workflow.slice(
    workflow.indexOf("\n  build:\n"),
    workflow.indexOf("\n  signatures:\n"),
  );

  it("runs in the build job, on pull requests, and passes the text through the environment", () => {
    const start = build.indexOf("scripts/apiBreakingCheck.mjs");
    expect(start).toBeGreaterThan(-1);
    const step = build.slice(
      build.lastIndexOf("      - name:", start),
      build.indexOf("\n      - ", start),
    );
    expect(step).toContain("github.event_name == 'pull_request'");
    expect(step).toContain("PR_TITLE: ${{ github.event.pull_request.title }}");
    expect(step).toContain("PR_BODY: ${{ github.event.pull_request.body }}");
    expect(step).toContain("BASE_REF: ${{ github.base_ref }}");
    expect(step.match(/\$\{\{/g)?.length).toBe(
      step.match(/^\s+(?:PR_\w+|BASE_REF): \$\{\{/gm)?.length ?? 0,
    );
  });
});

describe("escapeAnnotation", () => {
  it("escapes the characters a workflow command reads as its own syntax", () => {
    expect(escapeAnnotation("100% a\r\nb")).toBe("100%25 a%0D%0Ab");
  });

  it("keeps report text from adding a line to the log", () => {
    const before = sourceOf({
      [CORE]: report(
        '// @public\nexport interface Fill {\n    readonly pct: "50%";\n    readonly b: string;\n}',
      ),
    });
    const after = sourceOf({
      [CORE]: report(
        "// @public\nexport interface Fill {\n    readonly b: string;\n}",
      ),
    });
    const lines: string[] = [];
    runApiBreakingCheck({
      author: "a",
      labels: [],
      title: "fix: x",
      body: "",
      before,
      after,
      log: (line: string) => lines.push(line),
      summarise: () => undefined,
    });
    expect(lines.join("\n")).toContain("50%25");
    expect(lines.join("\n")).not.toContain('"50%"');
  });
});

describe("readReports", () => {
  function repository(): string {
    const root = mkdtempSync(path.join(tmpdir(), "api-breaking-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "a@example.com");
    git("config", "user.name", "A");
    mkdirSync(path.join(root, "packages/core/api"), { recursive: true });
    writeFileSync(path.join(root, CORE), report(layerBaseBlock(true)));
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    return root;
  }

  it("reads the base and head reports, and sees a package absent in the base", () => {
    const root = repository();
    mkdirSync(path.join(root, "packages/theme/api"), { recursive: true });
    writeFileSync(path.join(root, THEME), report(NAMESPACE_AFTER));
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "theme"], { cwd: root });
    const reports = readReports("main", root);
    expect(reports.before.read(CORE)).toContain("LayerDefinitionBase");
    expect(reports.before.read(THEME)).toBeNull();
    expect(reports.after.read(THEME)).toContain("tokenValues");
  });

  it("reads the reports at the newest release tag, and none when there is no tag", () => {
    const root = repository();
    expect(readReports("main", root).released).toBeNull();
    execFileSync("git", ["tag", "v0.1.0"], { cwd: root });
    mkdirSync(path.join(root, "packages/theme/api"), { recursive: true });
    writeFileSync(path.join(root, THEME), report(NAMESPACE_AFTER));
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "theme"], { cwd: root });
    const { released } = readReports("main", root);
    expect(released.read(CORE)).toContain("LayerDefinitionBase");
    expect(released.read(THEME)).toBeNull();
  });

  it("takes the newest release tag by version, not by name or by date", () => {
    const root = repository();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    const tagWith = (tag: string, text: string) => {
      writeFileSync(path.join(root, CORE), report(text));
      git("add", ".");
      git("commit", "-q", "-m", tag);
      git("tag", tag);
    };
    tagWith("v0.10.0", "// @public\nexport const ten = 10;");
    tagWith("v0.9.0", "// @public\nexport const nine = 9;");
    tagWith("v0.11.0-rc.1", "// @public\nexport const eleven = 11;");
    const { released } = readReports("main", root);
    expect(released.read(CORE)).toContain("eleven");
  });

  it("throws, so the check is skipped with a warning, when the release tag holds no API report", () => {
    const root = repository();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    git("rm", "-q", "-r", "packages");
    writeFileSync(path.join(root, "README.md"), "x");
    git("add", ".");
    git("commit", "-q", "-m", "no reports");
    git("tag", "v1.0.0");
    expect(() => readReports("main", root)).toThrow(/holds no API reports/);
  });

  it("throws when the release tag cannot be listed as a tree", () => {
    const root = repository();
    const blob = execFileSync("git", ["rev-parse", "HEAD:" + CORE], {
      cwd: root,
    })
      .toString()
      .trim();
    execFileSync("git", ["tag", "v1.0.0", blob], { cwd: root });
    expect(() => readReports("main", root)).toThrow(/could not be read/);
    expect(() => releasedReports("v1.0.0", root)).toThrow(/could not be read/);
  });

  it("returns null when the base branch is missing", () => {
    expect(readReports("no-such-branch", repository())).toBeNull();
  });

  it("returns null when the base shares no history with HEAD", () => {
    const root = repository();
    execFileSync("git", ["checkout", "-q", "--orphan", "other"], { cwd: root });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "x"], {
      cwd: root,
    });
    expect(readReports("main", root)).toBeNull();
  });
});

describe("runFromEnvironment", () => {
  it("skips with a warning, and passes, when the base branch cannot be read", () => {
    const lines: string[] = [];
    const code = runFromEnvironment(
      { BASE_REF: "no-such-branch", PR_TITLE: "fix: x" },
      (line: string) => lines.push(line),
      () => undefined,
    );
    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("::warning title=Breaking API check skipped::");
  });
});
