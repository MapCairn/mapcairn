// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  breakingApiChanges,
  isMarkedBreaking,
  runApiBreakingCheck,
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
  it("is a warning until the classifier is precise enough to fail a pull request", () => {
    expect(SEVERITY).toBe("warning");
  });

  it("annotates a warning and passes, with the default severity", () => {
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
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("::warning");
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
