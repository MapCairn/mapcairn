// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findQualityBarChanges,
  isAcknowledged,
  readDiff,
  runFromEnvironment,
  runQualityBarCheck,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/qualityBarCheck.mjs";

/** One hunk of a zero-context diff: `-` lines then `+` lines, at a new-file line. */
function hunk(newStart: number, ...lines: string[]): string {
  const removed = lines.filter((line) => line.startsWith("-")).length;
  const added = lines.filter((line) => line.startsWith("+")).length;
  return [`@@ -${newStart},${removed} +${newStart},${added} @@`, ...lines].join(
    "\n",
  );
}

function fileDiff(file: string, ...hunks: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    ...hunks,
    "",
  ].join("\n");
}

function deletedFile(file: string, ...lines: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    "deleted file mode 100644",
    "index 1111111..0000000",
    `--- a/${file}`,
    "+++ /dev/null",
    `@@ -1,${lines.length} +0,0 @@`,
    ...lines.map((line) => `-${line}`),
    "",
  ].join("\n");
}

function rulesOf(diff: string): string[] {
  return findQualityBarChanges(diff).map(
    (finding: { rule: string }) => finding.rule,
  );
}

describe("findQualityBarChanges: suppressions", () => {
  it.each([
    "// biome-ignore lint/suspicious/noExplicitAny: a reason",
    "// @ts-ignore",
    "  // @ts-expect-error The scripts are JavaScript.",
    "/* eslint-disable no-console */",
    "{/* biome-ignore lint/a11y/useSemanticElements: a reason */}",
  ])("flags the added comment %s with its file and line", (line) => {
    const findings = findQualityBarChanges(
      fileDiff("packages/map/src/a.tsx", hunk(12, `+${line}`)),
    );
    expect(findings).toEqual([
      expect.objectContaining({
        file: "packages/map/src/a.tsx",
        line: 12,
        rule: "suppression",
      }),
    ]);
  });

  it("numbers each added line from the hunk start", () => {
    const findings = findQualityBarChanges(
      fileDiff(
        "packages/map/src/a.ts",
        hunk(40, "+const a = 1;", "+// @ts-ignore"),
      ),
    );
    expect(findings[0].line).toBe(41);
  });

  it("lets a @ts-expect-error stand above the import of a JavaScript script, which has no types", () => {
    const diff = fileDiff(
      "packages/core/src/lint/a.test.ts",
      hunk(
        8,
        "+  // @ts-expect-error The scripts are dependency-free JavaScript.",
        '+} from "../../../../scripts/a.mjs";',
      ),
    );
    expect(rulesOf(diff)).toEqual([]);
  });

  it("still flags a @ts-expect-error above anything else", () => {
    const diff = fileDiff(
      "packages/core/src/a.ts",
      hunk(8, "+  // @ts-expect-error", "+const a: number = 'x';"),
    );
    expect(rulesOf(diff)).toEqual(["suppression"]);
  });

  it("ignores a suppression that is only mentioned, or removed", () => {
    const diff = [
      fileDiff(
        "packages/map/src/a.ts",
        hunk(1, "-// @ts-ignore", '+const note = "use @ts-ignore never";'),
      ),
      fileDiff("docs/a.md", hunk(1, "+// biome-ignore is a comment")),
    ].join("");
    expect(rulesOf(diff)).toEqual([]);
  });
});

describe("findQualityBarChanges: skipped and focused tests", () => {
  it.each([
    'it.skip("a", () => {});',
    'test.skip("a", () => {});',
    'describe.skip("a", () => {});',
    'it.todo("a");',
    'test.fixme("a", () => {});',
    'it.only("a", () => {});',
    'test.describe.only("a", () => {});',
    "test.skip(isMobile, 'not on a phone');",
  ])("flags %s in a test file", (line) => {
    expect(
      rulesOf(fileDiff("packages/web/src/a.test.ts", hunk(3, `+  ${line}`))),
    ).toEqual(["skipped test"]);
  });

  it("does not flag the same text outside a test file or an ordinary test", () => {
    const diff = [
      fileDiff("scripts/a.mjs", hunk(1, "+const x = it.skip();")),
      fileDiff(
        "packages/web/src/b.test.ts",
        hunk(1, '+it("skips it", () => {});'),
      ),
    ].join("");
    expect(rulesOf(diff)).toEqual([]);
  });
});

describe("findQualityBarChanges: deleted tests", () => {
  it("flags a deleted test file once, whatever it held", () => {
    const findings = findQualityBarChanges(
      deletedFile(
        "packages/core/src/a.test.ts",
        'it("a", () => {',
        "  expect(1).toBe(1);",
        "});",
      ),
    );
    expect(findings).toEqual([
      expect.objectContaining({
        file: "packages/core/src/a.test.ts",
        rule: "deleted test file",
      }),
    ]);
  });

  it("flags a deleted Playwright spec", () => {
    expect(
      rulesOf(deletedFile("packages/web/e2e/a.spec.ts", "test('a', () => {})")),
    ).toEqual(["deleted test file"]);
  });

  it("does not flag a deleted file that is not a test", () => {
    expect(
      rulesOf(deletedFile("packages/core/src/a.ts", "export {};")),
    ).toEqual([]);
  });

  it("flags a removed test case with no replacement in the file", () => {
    const findings = findQualityBarChanges(
      fileDiff(
        "packages/core/src/a.test.ts",
        hunk(
          10,
          '-  it("keeps the order", () => {',
          '-  test.each([1])("x", f)',
        ),
      ),
    );
    expect(findings.map((f: { rule: string }) => f.rule)).toEqual([
      "deleted test case",
      "deleted test case",
    ]);
    expect(findings[0].line).toBe(10);
  });

  it("accepts a renamed or rewritten case, which has an added one", () => {
    const diff = fileDiff(
      "packages/core/src/a.test.ts",
      hunk(
        10,
        '-  it("keeps the order", () => {',
        '+  it("keeps the input order", () => {',
      ),
    );
    expect(rulesOf(diff)).toEqual([]);
  });

  it("ignores a removed `it(` in a file that is not a test", () => {
    expect(
      rulesOf(fileDiff("scripts/a.mjs", hunk(1, '-  it("a", () => {'))),
    ).toEqual([]);
  });
});

describe("findQualityBarChanges: fewer assertions", () => {
  it("flags a test file that loses an expect call it does not replace", () => {
    const findings = findQualityBarChanges(
      fileDiff(
        "packages/core/src/a.test.ts",
        hunk(
          20,
          "-  expect(a).toBe(1);",
          "-  expect(b).toBe(2);",
          "+  expect(a).toBe(1);",
        ),
      ),
    );
    expect(findings).toEqual([
      expect.objectContaining({ rule: "fewer assertions", line: 20 }),
    ]);
  });

  it("counts every call on a line", () => {
    const diff = fileDiff(
      "packages/core/src/a.test.ts",
      hunk(5, "-expect(a); expect(b);", "+expect(a);"),
    );
    expect(rulesOf(diff)).toEqual(["fewer assertions"]);
  });

  it("is quiet when the assertions stay or grow", () => {
    const diff = fileDiff(
      "packages/core/src/a.test.ts",
      hunk(
        20,
        "-  expect(a).toBe(1);",
        "+  expect(a).toBe(2);",
        "+  expect(b).toBe(2);",
      ),
    );
    expect(rulesOf(diff)).toEqual([]);
  });

  it("leaves the assertions of a removed case to the deleted-case finding", () => {
    const diff = fileDiff(
      "packages/core/src/a.test.ts",
      hunk(20, '-it("a", () => {', "-  expect(a).toBe(1);", "-});"),
    );
    expect(rulesOf(diff)).toEqual(["deleted test case"]);
  });
});

describe("findQualityBarChanges: lowered bars", () => {
  const vitest = "vitest.config.ts";

  it("flags a lowered coverage threshold at the added line", () => {
    const findings = findQualityBarChanges(
      fileDiff(
        vitest,
        hunk(34, "-          branches: 95,", "+          branches: 90,"),
      ),
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: vitest, line: 34, rule: "lowered bar" }),
    ]);
    expect(findings[0].message).toContain("branches");
    expect(findings[0].message).toContain("95");
    expect(findings[0].message).toContain("90");
  });

  it("is quiet for a raised threshold", () => {
    expect(
      rulesOf(
        fileDiff(
          vitest,
          hunk(34, "-          branches: 90,", "+          branches: 95,"),
        ),
      ),
    ).toEqual([]);
  });

  it("pairs the same key by order, so one lowered group is found among several", () => {
    const findings = findQualityBarChanges(
      fileDiff(
        vitest,
        hunk(30, "-  lines: 95,", "+  lines: 95,"),
        hunk(40, "-  lines: 95,", "+  lines: 80,"),
      ),
    );
    expect(findings).toEqual([expect.objectContaining({ line: 40 })]);
  });

  it("flags a threshold that is removed", () => {
    expect(
      rulesOf(fileDiff(vitest, hunk(34, "-          branches: 95,"))),
    ).toEqual(["lowered bar"]);
  });

  it("flags a lowered Lighthouse minimum score", () => {
    const line = (score: string) =>
      `        "categories:accessibility": ["error", { "minScore": ${score} }],`;
    expect(
      rulesOf(
        fileDiff(
          "packages/web/lighthouserc.json",
          hunk(14, `-${line("1")}`, `+${line("0.9")}`),
        ),
      ),
    ).toEqual(["lowered bar"]);
    expect(
      rulesOf(
        fileDiff(
          "sites/docs/lighthouserc.json",
          hunk(14, `-${line("0.9")}`, `+${line("1")}`),
        ),
      ),
    ).toEqual([]);
  });

  it("flags a raised size ceiling, with or without digit separators", () => {
    expect(
      rulesOf(
        fileDiff(
          "scripts/release/packCheck.mjs",
          hunk(40, "-  core: 1_000_000,", "+  core: 1_500_000,"),
        ),
      ),
    ).toEqual(["lowered bar"]);
    expect(
      rulesOf(
        fileDiff(
          "scripts/release/consumerCheck.mjs",
          hunk(
            40,
            '-  "client via the subpath": 402_000,',
            '+  "client via the subpath": 400_000,',
          ),
        ),
      ),
    ).toEqual([]);
    expect(
      rulesOf(
        fileDiff(
          "sites/docs/scripts/verifyBuild.ts",
          hunk(
            46,
            "-export const SCRIPT_BUDGET_BYTES = 160_000;",
            "+export const SCRIPT_BUDGET_BYTES = 170_000;",
          ),
        ),
      ),
    ).toEqual(["lowered bar"]);
  });

  it("ignores numbers in a file that is not a known bar", () => {
    expect(
      rulesOf(
        fileDiff(
          "packages/web/src/a.ts",
          hunk(1, "-  lines: 95,", "+  lines: 10,"),
        ),
      ),
    ).toEqual([]);
  });
});

describe("isAcknowledged", () => {
  const finding = { file: "vitest.config.ts", line: 3, rule: "lowered bar" };

  it("accepts a body that names the file, by path or by name", () => {
    expect(
      isAcknowledged(finding, "I lowered vitest.config.ts because x"),
    ).toBe(true);
    expect(
      isAcknowledged(
        { ...finding, file: "packages/web/src/a.test.ts" },
        "Removed a.test.ts, replaced by b.",
      ),
    ).toBe(true);
  });

  it("accepts a body with a Quality bar section for every finding", () => {
    expect(isAcknowledged(finding, "## Quality bar\n\nSee below.")).toBe(true);
    expect(isAcknowledged(finding, "A sentence on the quality bar.")).toBe(
      true,
    );
  });

  it("does not accept a body that names neither", () => {
    expect(isAcknowledged(finding, "Fixes #1\n## Checks\nall green")).toBe(
      false,
    );
    expect(isAcknowledged(finding, "")).toBe(false);
  });

  it("does not take a longer file name for the file", () => {
    expect(
      isAcknowledged(
        { ...finding, file: "a.ts" },
        "Changed data.ts and beta.ts.",
      ),
    ).toBe(false);
  });
});

describe("runQualityBarCheck", () => {
  const SUPPRESSION = fileDiff(
    "packages/map/src/a.ts",
    hunk(7, "+// @ts-ignore"),
  );

  function run(input: Record<string, unknown>) {
    const lines: string[] = [];
    const summary: string[] = [];
    const code = runQualityBarCheck({
      author: "someone",
      labels: [],
      title: "feat: x",
      body: "Fixes #1",
      diff: SUPPRESSION,
      ...input,
      log: (line: string) => lines.push(line),
      summarise: (text: string) => summary.push(text),
    });
    return { code, lines, summary };
  }

  it("warns with the file and line and asks for a reason, and exits 0", () => {
    const { code, lines, summary } = run({});
    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^::warning file=packages\/map\/src\/a\.ts,line=7,title=Quality bar::/,
    );
    expect(lines[0]).toContain("say why in the pull request");
    expect(summary.join("")).toContain("packages/map/src/a.ts:7");
  });

  it("reports an acknowledged finding as a notice, not a warning", () => {
    const { code, lines } = run({
      body: "## Quality bar\n\nA ts-ignore, because.",
    });
    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^::notice /);
    expect(lines[0]).toContain("acknowledged");
  });

  it("is quiet for a clean diff", () => {
    expect(run({ diff: fileDiff("a.ts", hunk(1, "+const a = 1;")) })).toEqual({
      code: 0,
      lines: [],
      summary: [],
    });
  });

  it("skips Dependabot and Release pull requests", () => {
    expect(run({ author: "dependabot[bot]" }).lines).toEqual([]);
    expect(run({ labels: ["release"] }).lines).toEqual([]);
    expect(run({ title: "chore(release): v1.0.0" }).lines).toEqual([]);
  });

  it("escapes characters that would end an annotation", () => {
    const { lines } = run({
      diff: fileDiff("a,b:c.ts", hunk(1, "+// @ts-ignore")),
    });
    expect(lines[0]).toContain("file=a%2Cb%3Ac.ts,");
  });
});

describe("readDiff and runFromEnvironment", () => {
  function repository(): string {
    const root = mkdtempSync(path.join(tmpdir(), "quality-bar-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "a@example.com");
    git("config", "user.name", "A");
    git("config", "commit.gpgsign", "false");
    writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    writeFileSync(
      path.join(root, "a.ts"),
      "// @ts-ignore\nexport const a = 2;\n",
    );
    git("commit", "-q", "-am", "change");
    return root;
  }

  it("reads the zero-context diff from the base branch to HEAD", () => {
    const diff = readDiff("main", repository());
    expect(diff).toContain("+// @ts-ignore");
    expect(rulesOf(diff)).toEqual(["suppression"]);
  });

  it("returns null when the base branch cannot be found", () => {
    expect(readDiff("no-such-branch", repository())).toBeNull();
  });

  it("skips with a warning, and passes, when the base is unavailable", () => {
    const lines: string[] = [];
    const code = runFromEnvironment(
      { BASE_REF: "no-such-branch", PR_TITLE: "fix: x" },
      (line: string) => lines.push(line),
      () => undefined,
    );
    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("::warning title=Quality bar check skipped::");
  });
});
