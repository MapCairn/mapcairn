// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  jobRanges,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";

/*
 * Required checks (issue 995). A check is known by its job's name, the latest
 * run for the head wins, and GitHub counts a job skipped by `if:` as passed.
 * So a run that does not do a required job's work, such as one for a title or
 * description edit, must create no check of that name at all: a skipped job,
 * or one with its steps skipped, would replace a failed or unfinished result
 * with a pass.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const WORKFLOWS_DIR = path.join(REPO, ".github/workflows");

/**
 * The checks the `main-pull-requests` ruleset requires that a workflow job
 * reports. `CLA` is a commit status a script sets, not a job.
 */
const REQUIRED_JOBS = [
  "build",
  "e2e",
  "SDK packages",
  "Dependency review",
  "TruffleHog (pull request)",
];

/**
 * The required jobs that may run on an edit, because they do all their work
 * again: `build` holds the checks of the title and description.
 */
const REDONE_ON_AN_EDIT = ["build"];

/** The one condition a job with `needs:` may have, so it never skips. */
const ALWAYS = "    if: ${{ always() }}";

type Workflows = Readonly<Record<string, string>>;

/** Each workflow file in a folder, comment lines removed. */
function loadWorkflows(folder: string): Workflows {
  return Object.fromEntries(
    readdirSync(folder)
      .filter((file) => /\.ya?ml$/.test(file))
      .map((file) => [
        file,
        readFileSync(path.join(folder, file), "utf8")
          .split(/\r?\n/)
          .filter((line) => !/^\s*#/.test(line))
          .join("\n"),
      ]),
  );
}

interface Job {
  readonly file: string;
  /** The check's name: the job's `name`, else its key. */
  readonly check: string;
  readonly text: string;
  readonly workflow: string;
}

function jobsOf(file: string, workflow: string): Job[] {
  const ranges = jobRanges(workflow) as Map<
    string,
    { start: number; end: number }
  >;
  return [...ranges].map(([key, range]) => {
    const text = workflow
      .split("\n")
      .slice(range.start - 1, range.end)
      .join("\n");
    const check = /^ {4}name: (.+)$/m.exec(text)?.[1].trimEnd() ?? key;
    return { file, check, text, workflow };
  });
}

/** The lines under a bare top-level `key:`, or none when there is no such key. */
function section(workflow: string, key: string): string[] {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`${key}:`);
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\S/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).filter(
    (line) => line.trim() !== "",
  );
}

/** The workflow's `on:` block. */
function triggers(workflow: string): string {
  return section(workflow, "on").join("\n");
}

function indent(line: string): number {
  return line.length - line.trimStart().length;
}

/** A bare event key, with nothing but a comment after it. */
const EVENT_LINE = /^ {2}[a-z_]+:(?: #.*)?$/;

/**
 * An event's filter: a bare key, alone or with a one-line list of plain or
 * plainly quoted words, or a schedule's `cron`.
 */
const FILTER_LINE =
  /^ {4}(?:- cron: .+|[a-z_-]+:(?: \[(?:"[\w.*/-]+"|\w[\w.*/-]*)(?:, (?:"[\w.*/-]+"|\w[\w.*/-]*))*\])?)$/;

/** What stops the `on:` block being read: only the block mapping form is. */
function unreadableTriggers(workflow: string): string[] {
  const lines = section(workflow, "on");
  if (lines.length === 0) {
    return ["no block `on:` mapping"];
  }
  const found = lines.filter((line, index) => {
    const depth = indent(line);
    if ((index === 0 && depth !== 2) || depth < 2 || depth === 3) {
      return true;
    }
    if (depth === 2) {
      return !EVENT_LINE.test(line);
    }
    return depth === 4 && !FILTER_LINE.test(line);
  });
  return found.map((line) => `trigger line \`${line.trim()}\``);
}

/** Whether a job's name could be a required check once GitHub has read it. */
function unreadableName(value: string): boolean {
  if (/^["'{[&*|>!%@]|\s#/.test(value)) {
    return true;
  }
  const expression = value.indexOf("${{");
  if (expression === -1) {
    return false;
  }
  const literal = value.slice(0, expression);
  return REQUIRED_JOBS.some((check) => check.startsWith(literal));
}

/** What stops the jobs being read: bare keys, one to a line, at one depth. */
function unreadableJobs(workflow: string): string[] {
  const lines = section(workflow, "jobs");
  if (lines.length === 0) {
    return ["no block `jobs:` mapping"];
  }
  const found: string[] = [];
  lines.forEach((line, index) => {
    const depth = indent(line);
    const next = lines[index + 1];
    if (depth < 4 && !/^ {2}[\w-]+:$/.test(line)) {
      found.push(`job line \`${line.trim()}\``);
    }
    if (depth === 2 && (next === undefined || indent(next) !== 4)) {
      found.push(`job body of \`${line.trim()}\``);
    }
    if (depth === 4 && !/^ {4}[\w-]+:(?: .*)?$/.test(line)) {
      found.push(`job key line \`${line.trim()}\``);
    }
    const name = /^ {4}name:(.*)$/.exec(line)?.[1].trim();
    if (name === undefined) {
      return;
    }
    const continues = next !== undefined && indent(next) > 4;
    if (name === "" || continues || unreadableName(name)) {
      found.push(`job name \`${name}\``);
    }
  });
  return indent(lines[0]) === 2 ? found : [...found, "first job key"];
}

/** What stops a workflow being read, so that nothing in it is passed unread. */
function unreadable(workflow: string): string[] {
  const topLevel = workflow
    .split("\n")
    .filter((line) => /^\S/.test(line) && !/^[a-z-]+:(?: .*)?$/.test(line))
    .map((line) => `top-level line \`${line}\``);
  return [
    ...topLevel,
    ...unreadableTriggers(workflow),
    ...unreadableJobs(workflow),
  ];
}

function jobProblems(check: string, job: Job): string[] {
  const found: string[] = [];
  const conditions = job.text.match(/^ {4}if:.*$/gm) ?? [];
  // `always()` makes `e2e` report after a failed shard instead of skipping.
  const allowed = check === "e2e" && conditions.join() === ALWAYS;
  if (conditions.length > 0 && !allowed) {
    found.push("has a condition that can skip it");
  }
  // A job is skipped, which passes, when a job it needs fails.
  if (/^ {4}needs:/m.test(job.text) && !allowed) {
    found.push("needs another job");
  }
  const on = triggers(job.workflow);
  // A list written down the page is not read, so a required workflow has none.
  if (on.split("\n").some((line) => indent(line) > 4)) {
    found.push("has a trigger setting nested too deeply to read");
  }
  if (/^\s+paths(?:-ignore)?:/m.test(on)) {
    found.push("has a path filter");
  }
  if (/\bedited\b/.test(on) !== REDONE_ON_AN_EDIT.includes(check)) {
    found.push("takes the wrong side on the edited trigger");
  }
  if (job.text.includes("github.event.action")) {
    found.push("acts on the event's action");
  }
  return found;
}

/** Every way the workflows could report a required check without its work. */
function problems(workflows: Workflows): string[] {
  const found = Object.entries(workflows).flatMap(([file, workflow]) =>
    unreadable(workflow).map((problem) => `${file}: cannot read ${problem}`),
  );
  const jobs = Object.entries(workflows).flatMap(([file, workflow]) =>
    jobsOf(file, workflow),
  );
  for (const check of REQUIRED_JOBS) {
    const named = jobs.filter((job) => job.check === check);
    if (named.length !== 1) {
      found.push(`${check}: reported by ${named.length} jobs`);
    }
    for (const job of named) {
      found.push(
        ...jobProblems(check, job).map((problem) => `${check}: ${problem}`),
      );
    }
  }
  return found;
}

const REAL = loadWorkflows(WORKFLOWS_DIR);

describe("the workflows that report the required checks", () => {
  it("can all be read, and report each check only for work they did", () => {
    expect(problems(REAL)).toEqual([]);
  });

  it("keep the edit run of CI out of the group that would cancel the run for the commit", () => {
    const group =
      /concurrency:\n\s+group: (.+)\n\s+cancel-in-progress: true/.exec(
        REAL["ci.yml"],
      )?.[1];
    expect(group).toContain("github.event.action == 'edited' && '-edited'");
  });
});

describe("a planted fault in a workflow", () => {
  /** The real workflows with one piece of one file replaced. */
  function planted(file: string, from: string, to: string): Workflows {
    expect(REAL[file], `${file} holds the text to replace`).toContain(from);
    return { ...REAL, [file]: REAL[file].replace(from, () => to) };
  }

  const SDK = "sdk-packages.yml";
  const NAME = "    name: SDK packages\n";
  const KEY = "  sdk-packages:\n";
  const TYPES = "  pull_request:\n    types: [opened, synchronize, reopened]\n";

  const CONDITION = "SDK packages: has a condition that can skip it";
  const NEEDS = "SDK packages: needs another job";
  const JOB_KEY = "cannot read job key line";
  const JOB_NAME = "cannot read job name";
  const JOB_LINE = "cannot read job line";
  const TRIGGER = "cannot read trigger line";
  const NO_ON = "cannot read no block `on:` mapping";

  it.each([
    ["a job condition", NAME, `${NAME}    if: false\n`, CONDITION],
    [
      "a condition on a later line",
      NAME,
      `${NAME}    if:\n      x\n`,
      CONDITION,
    ],
    ["a needed job", NAME, `${NAME}    needs: other\n`, NEEDS],
    [
      "`needs` with `always()`",
      NAME,
      `${NAME}    needs: a\n${ALWAYS}\n`,
      NEEDS,
    ],
    ["a quoted condition key", NAME, `${NAME}    "if": false\n`, JOB_KEY],
    ["a spaced condition key", NAME, `${NAME}    if : false\n`, JOB_KEY],
    ["a merge key", NAME, `${NAME}    <<: *defaults\n`, JOB_KEY],
    ["a quoted job name", NAME, '    name: "SDK packages"\n', JOB_NAME],
    ["a name with a comment", NAME, "    name: SDK packages # a\n", JOB_NAME],
    ["a folded job name", NAME, "    name: SDK\n      packages\n", JOB_NAME],
    ["a block job name", NAME, "    name: >-\n      SDK packages\n", JOB_NAME],
    ["an expression name", NAME, "    name: ${{ vars.NAME }}\n", JOB_NAME],
    ["a quoted job key", KEY, '  "sdk-packages":\n', JOB_LINE],
    ["a job in a flow mapping", KEY, `  extra: {if: 0}\n${KEY}`, JOB_LINE],
    ["job keys at another depth", KEY, `${KEY}      if: 0\n`, "job body"],
    ["jobs in a flow mapping", "jobs:\n", "jobs: {}\nx:\n", "`jobs:` mapping"],
    ["`on` as a list", "on:\n", "on: [pull_request]\nunused:\n", NO_ON],
    ["`on` as one event", "on:\n", "on: pull_request\nunused:\n", NO_ON],
    ["a quoted `on` key", "on:\n", '"on":\n', "cannot read top-level line"],
    ["events as a list", TYPES, "  - pull_request\n", TRIGGER],
    ["a flow mapping event", TYPES, "  pull_request: {types: [a]}\n", TRIGGER],
    ["a quoted event key", TYPES, '  "pull_request":\n', TRIGGER],
    [
      "a quoted filter key",
      TYPES,
      '  pull_request:\n    "paths": [a]\n',
      TRIGGER,
    ],
    ["an alias for the types", TYPES, "  push:\n    types: *all\n", TRIGGER],
    ["an escaped type", "reopened]", '"edit\\x65d"]', TRIGGER],
    ["a filter at an odd depth", TYPES, "  push:\n   paths: [a]\n", TRIGGER],
    ["types down the page", TYPES, `${TYPES}      - a\n`, "nested too deeply"],
    [
      "a path filter",
      TYPES,
      `${TYPES}    paths: [a/**]\n`,
      "has a path filter",
    ],
    [
      "the edited trigger",
      "reopened]",
      "reopened, edited]",
      "the edited trigger",
    ],
  ])("is reported for %s", (_fault, from, to, reason) => {
    expect(problems(planted(SDK, from, to)).join("\n")).toContain(reason);
  });

  it("is reported for `needs` on e2e without `always()`", () => {
    expect(
      problems(planted("playwright.yml", "    if: ${{ always() }}\n", "")),
    ).toContain("e2e: needs another job");
  });

  it.each(["second.yml", "second.yaml"])(
    "is reported for a second job of a required name in %s",
    (file) => {
      const folder = mkdtempSync(path.join(tmpdir(), "required-checks-"));
      try {
        for (const [name, text] of Object.entries(REAL)) {
          writeFileSync(path.join(folder, name), text);
        }
        writeFileSync(
          path.join(folder, file),
          "on:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
        );
        expect(problems(loadWorkflows(folder))).toContain(
          "build: reported by 2 jobs",
        );
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});
