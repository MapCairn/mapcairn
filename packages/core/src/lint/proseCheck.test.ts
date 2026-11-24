// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BANNED_WORDS,
  EVERGREEN_EXEMPTIONS,
  findDatedProse,
  findProseProblems,
  isChecked,
  isEvergreen,
  MAX_BOLD_LEAD_INS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/prose-check.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const SCRIPT = path.join(REPO, "scripts/prose-check.mjs");
/** Spawning Node can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;
const EM_DASH = "—";

interface Problem {
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

function problems(text: string): Problem[] {
  return findProseProblems(text);
}

function rules(text: string): string[] {
  return problems(text).map((problem) => `${problem.line} ${problem.rule}`);
}

describe("the banned words", () => {
  it("are the short list the project agreed", () => {
    expect([...BANNED_WORDS].sort()).toEqual(
      [
        "comprehensive",
        "crucial",
        "delve",
        "effortless",
        "elevate",
        "leverage",
        "powerful",
        "robust",
        "seamless",
        "simply",
        "straightforward",
        "streamline",
        "unlock",
      ].sort(),
    );
  });

  it.each(BANNED_WORDS)("reports %s with its line", (word: string) => {
    expect(rules(`Fine.\n\nA ${word} way.\n`)).toEqual(["3 banned-word"]);
  });

  it.each([
    "Seamless",
    "SEAMLESSLY",
    "leveraged",
    "unlocks",
    "streamlining",
    "elevates",
    "delving",
  ])("reports %s, whatever its case or ending", (word) => {
    expect(rules(`A ${word} thing.`)).toEqual(["1 banned-word"]);
  });

  it("names the word and says what to do", () => {
    expect(problems("It is robust.")[0]?.message).toContain('"robust"');
  });

  it("does not report a longer word that holds one, or one in code", () => {
    const text = [
      "A unlocker and a simplyfied name are other words.",
      "",
      "Use `simply` or `robust()` as a name.",
      "",
      "```ts",
      "const robust = simply();",
      "```",
      "",
    ].join("\n");
    expect(rules(text)).toEqual([]);
  });

  it("reads the front matter, because the description is prose", () => {
    expect(rules("---\ndescription: A robust way.\n---\n\nText.\n")).toEqual([
      "2 banned-word",
    ]);
  });

  it("reports every occurrence, each with its own line", () => {
    expect(rules("It is robust and simply robust.\nAnd powerful.\n")).toEqual([
      "1 banned-word",
      "1 banned-word",
      "1 banned-word",
      "2 banned-word",
    ]);
  });
});

describe("em dashes", () => {
  it("allows one in a paragraph and reports the second", () => {
    expect(rules(`One ${EM_DASH} aside.\n`)).toEqual([]);
    expect(rules(`One ${EM_DASH} aside.\nMore ${EM_DASH} text.\n`)).toEqual([
      "2 em-dashes",
    ]);
  });

  it("counts each paragraph on its own, and a list item or heading is its own paragraph", () => {
    const text = [
      `First ${EM_DASH} one.`,
      "",
      `Second ${EM_DASH} one.`,
      "",
      `- Item ${EM_DASH} one`,
      `- Item ${EM_DASH} two`,
      "",
    ].join("\n");
    expect(rules(text)).toEqual([]);
  });

  it("does not count a dash in a table row, a code span or a code block", () => {
    const text = [
      `| a | ${EM_DASH} |`,
      `| b | ${EM_DASH} |`,
      "",
      `Use \`${EM_DASH}\` and \`${EM_DASH}\` and ${EM_DASH} once.`,
      "",
      "```",
      `${EM_DASH} ${EM_DASH}`,
      "```",
      "",
    ].join("\n");
    expect(rules(text)).toEqual([]);
  });

  it("reports a paragraph once, on the line of its second dash", () => {
    expect(
      rules(
        `Start.\n${EM_DASH}${EM_DASH} ${EM_DASH}\nOne ${EM_DASH} more ${EM_DASH} too.\n`,
      ),
    ).toEqual(["2 em-dashes"]);
  });
});

describe("bold lead-in bullets", () => {
  const bullets = (count: number, marker = "-"): string =>
    Array.from(
      { length: count },
      (_, index) => `${marker} **Term ${index}.** What it means.`,
    ).join("\n");

  it("allows the limit and reports the page above it, on the first bullet over", () => {
    expect(MAX_BOLD_LEAD_INS).toBe(8);
    expect(rules(`${bullets(MAX_BOLD_LEAD_INS)}\n`)).toEqual([]);
    expect(rules(`${bullets(MAX_BOLD_LEAD_INS + 1)}\n`)).toEqual([
      `${MAX_BOLD_LEAD_INS + 1} bold-lead-ins`,
    ]);
  });

  it("counts across the whole page, with any bullet marker and nesting", () => {
    const text = `${bullets(4)}\n\nProse.\n\n${bullets(3, "*")}\n\n  - **Nested.** Text.\n\n1. **Numbered.** Text.\n`;
    expect(rules(text)).toEqual(["14 bold-lead-ins"]);
  });

  it("does not count a bullet that only holds bold text later, or one in a code block", () => {
    const text = [
      "- A plain bullet with **bold** inside.",
      "```",
      bullets(20),
      "```",
    ].join("\n");
    expect(rules(text)).toEqual([]);
  });
});

describe("isChecked", () => {
  it.each([
    "README.md",
    "packages/core/README.md",
    "examples/embed/README.md",
    "sites/docs/docs/get-started.md",
    "sites/docs/docs/guides/licence.md",
    "sites/docs/docs/tasks/add-a-layer.md",
  ])("reads %s", (file) => {
    expect(isChecked(file)).toBe(true);
  });

  it.each([
    "CHANGELOG.md",
    "AGENTS.md",
    "docs/guides/working-with-agents.md",
    "docs/plans/0017-documentation-site.md",
    ".claude/skills/land-pr/SKILL.md",
    "sites/docs/scripts/repositoryDocs.ts",
    "sites/docs/docs/api/core/index.md",
    "sites/docs/docs/generated/design.md",
    "package-lock.json",
  ])("skips %s", (file) => {
    expect(isChecked(file)).toBe(false);
  });
});

describe("dated prose", () => {
  function dated(text: string): string[] {
    return findDatedProse(text).map(
      (problem: Problem) => `${problem.line} ${problem.rule}`,
    );
  }

  it("reports a decision with its day, on the line", () => {
    expect(dated("Fine.\n\nDecided on 2026-11-24: it is an error.\n")).toEqual([
      "3 decided-on",
      "3 iso-date",
    ]);
  });

  it("reports decided on even without a date", () => {
    expect(dated("The maintainer decided on a sweep.\n")).toEqual([
      "1 decided-on",
    ]);
  });

  it.each([
    "as of 2026",
    "since 2026-11-01",
    "until 3 November 2026",
    "measured on November 3",
    "tested on 2026",
  ])("reports %s as a dated claim", (phrase) => {
    expect(dated(`It was fine ${phrase}.\n`)).toContain("1 dated-claim");
  });

  it("does not read since or until without a date", () => {
    expect(dated("Since the build ran, and until it stops.\n")).toEqual([]);
  });

  it("reports an ISO date in prose and a table row", () => {
    expect(dated("Released 2026-11-21.\n\n| a | 2026-01-02 |\n")).toEqual([
      "1 iso-date",
      "3 iso-date",
    ]);
  });

  it("does not read code spans or code blocks", () => {
    const text = "Use `2026-11-11T14:30:00Z`.\n\n```\nmin: 1998-01-01\n```\n";
    expect(dated(text)).toEqual([]);
  });

  it("allows the last-reviewed and last-updated lines", () => {
    expect(
      dated("_Last reviewed: 2026-11-24. Reviewed every year._\n"),
    ).toEqual([]);
    expect(dated("_Last updated: 2026-11-22_\n")).toEqual([]);
  });

  it("reads text that merely mentions the exemption", () => {
    expect(dated("See the Last updated: 2026-11-22 line.\n")).toEqual([
      "1 iso-date",
    ]);
  });
});

describe("isEvergreen", () => {
  it.each([
    "README.md",
    "packages/core/README.md",
    "AGENTS.md",
    "ARCHITECTURE.md",
    "DESIGN.md",
    "ROADMAP.md",
    "docs/assurance-case.md",
    ".github/ACCESSIBILITY.md",
    ".github/CODE_OF_CONDUCT.md",
    ".github/CONTRIBUTING.md",
    ".github/GOVERNANCE.md",
    ".github/SECURITY.md",
    "docs/guides/releasing.md",
    "sites/docs/docs/guides/performance.md",
  ])("holds %s to it", (file) => {
    expect(isEvergreen(file)).toBe(true);
  });

  it.each([
    "CHANGELOG.md",
    "docs/plans/0017-documentation-site.md",
    "sites/docs/docs/changelog/index.md",
    "sites/docs/docs/api/core/index.md",
    "sites/docs/docs/generated/design.md",
    "PRIVACY.md",
    "CLA.md",
    "ATTRIBUTIONS.md",
    ".github/pull_request_template.md",
    "packages/core/src/lint/proseCheck.test.ts",
  ])("leaves %s out", (file) => {
    expect(isEvergreen(file)).toBe(false);
  });

  it("gives a reason beside every exempt document", () => {
    for (const reason of Object.values(EVERGREEN_EXEMPTIONS)) {
      expect(String(reason).length).toBeGreaterThan(10);
    }
  });
});

describe("the repository", () => {
  it(
    "has no prose the check refuses",
    () => {
      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: REPO,
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
    CHILD_TIMEOUT_MS,
  );
});
