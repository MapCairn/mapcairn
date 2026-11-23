// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkPullRequestBody,
  runPrBodyCheck,
  skipReason,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/prBodyCheck.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const GOOD_BODY = "## What and why\n\nFixes #12\n\n## Checks\n\n- [x] lint\n";

describe("checkPullRequestBody", () => {
  it("accepts a body with an issue link and a Checks section", () => {
    expect(checkPullRequestBody(GOOD_BODY)).toEqual([]);
  });

  it("accepts Part of, and the other closing keywords, in any case", () => {
    for (const line of [
      "Part of #7",
      "part of #7",
      "Closes #7",
      "resolves #7",
    ]) {
      expect(checkPullRequestBody(`${line}\n## Checks\n`), line).toEqual([]);
    }
  });

  it("accepts a link to an issue in another repository", () => {
    expect(
      checkPullRequestBody("Fixes MapCairn/mapcairn#7\n## Checks\n"),
    ).toEqual([]);
  });

  it("warns about a missing issue link", () => {
    const warnings = checkPullRequestBody("## Checks\n\n- [x] lint\n");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Fixes #");
  });

  it("warns about a missing Checks section", () => {
    const warnings = checkPullRequestBody("Fixes #12\n");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Checks");
  });

  it("does not count the word Checks inside a sentence as a section", () => {
    expect(checkPullRequestBody("Fixes #12\n\nChecks pass.\n")).toHaveLength(1);
  });

  it("warns twice for an empty or missing body", () => {
    expect(checkPullRequestBody("")).toHaveLength(2);
    expect(checkPullRequestBody(null)).toHaveLength(2);
  });

  it("ignores the hint comments of the pull request template", () => {
    const template = readFileSync(
      path.join(REPO, ".github/pull_request_template.md"),
      "utf8",
    );
    const warnings = checkPullRequestBody(template);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Fixes #");
  });

  it("does not count a bare issue reference as a link", () => {
    expect(checkPullRequestBody("See #12\n## Checks\n")).toHaveLength(1);
  });
});

describe("skipReason", () => {
  it("skips Dependabot", () => {
    expect(
      skipReason({ author: "dependabot[bot]", labels: [], title: "bump" }),
    ).toMatch(/dependabot/i);
  });

  it("skips a Release pull request by its label", () => {
    expect(
      skipReason({ author: "someone", labels: ["release"], title: "x" }),
    ).toMatch(/release/i);
  });

  it("skips a Release pull request by its title", () => {
    expect(
      skipReason({
        author: "someone",
        labels: [],
        title: "chore(release): v0.3.0",
      }),
    ).toMatch(/release/i);
  });

  it("does not skip an ordinary pull request", () => {
    expect(
      skipReason({ author: "someone", labels: ["map"], title: "feat: x" }),
    ).toBeNull();
  });
});

describe("runPrBodyCheck", () => {
  function run(input: Record<string, unknown>) {
    const lines: string[] = [];
    const summary: string[] = [];
    const code = runPrBodyCheck({
      author: "someone",
      labels: [],
      title: "feat: x",
      body: GOOD_BODY,
      ...input,
      log: (line: string) => lines.push(line),
      summarise: (text: string) => summary.push(text),
    });
    return { code, lines, summary };
  }

  it("is quiet for a good body", () => {
    expect(run({})).toEqual({ code: 0, lines: [], summary: [] });
  });

  it("annotates and summarises each warning, and still exits 0", () => {
    const { code, lines, summary } = run({ body: "" });
    expect(code).toBe(0);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(
        line.startsWith("::warning title=Pull request description::"),
      ).toBe(true);
    }
    expect(summary.join("\n")).toContain("Fixes #");
    expect(summary.join("\n")).toContain("Checks");
  });

  it("says nothing for a skipped pull request", () => {
    expect(run({ author: "dependabot[bot]", body: "" })).toEqual({
      code: 0,
      lines: [],
      summary: [],
    });
  });
});

describe("the pr-body-check workflow", () => {
  const workflow = readFileSync(
    path.join(REPO, ".github/workflows/pr-body-check.yml"),
    "utf8",
  );

  it("runs on pull_request, never pull_request_target", () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:/m);
    expect(workflow).not.toContain("pull_request_target:");
  });

  it("holds read access to contents and nothing else", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow).not.toMatch(/: write/);
  });

  it("uses only actions pinned by full commit SHA", () => {
    const uses = [...workflow.matchAll(/^\s+uses: (\S+)/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(use).toMatch(/^actions\/checkout@[0-9a-f]{40}$/);
    }
  });

  it("reads pull request text through env, not inline in a script", () => {
    expect(workflow).not.toMatch(/run:[^\n]*\$\{\{/);
    expect(workflow).toContain(
      "PR_BODY: ${{ github.event.pull_request.body }}",
    );
  });
});
