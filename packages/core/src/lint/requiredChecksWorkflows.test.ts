// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
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

/** A workflow's text without comment lines, so a note cannot pass for a setting. */
function read(file: string): string {
  return readFileSync(path.join(WORKFLOWS_DIR, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

interface Job {
  readonly file: string;
  /** The check's name: the job's `name`, else its key. */
  readonly check: string;
  readonly text: string;
  readonly workflow: string;
}

const JOBS: readonly Job[] = readdirSync(WORKFLOWS_DIR)
  .filter((file) => file.endsWith(".yml"))
  .flatMap((file) => {
    const workflow = read(file);
    const ranges = jobRanges(workflow) as Map<
      string,
      { start: number; end: number }
    >;
    return [...ranges].map(([key, range]) => {
      const text = workflow
        .split("\n")
        .slice(range.start - 1, range.end)
        .join("\n");
      const check = /^ {4}name: (.+)$/m.exec(text)?.[1] ?? key;
      return { file, check, text, workflow };
    });
  });

/** The workflow's `on:` block. */
function triggers(workflow: string): string {
  return /^on:\n((?: .*\n|\n)+)/m.exec(workflow)?.[1] ?? "";
}

describe.each(REQUIRED_JOBS)("the required check %s", (check) => {
  const jobs = JOBS.filter((job) => job.check === check);

  it("is reported by exactly one job, so no other run can stand in for it", () => {
    expect(jobs.map((job) => job.file)).toHaveLength(1);
  });

  it("is never skipped by a job condition, which GitHub would count as a pass", () => {
    const conditions = jobs.flatMap(
      (job) => job.text.match(/^ {4}if: .+$/gm) ?? [],
    );
    // `always()` makes `e2e` report after a failed shard instead of skipping.
    expect(conditions).toEqual(
      check === "e2e" ? ["    if: ${{ always() }}"] : [],
    );
  });

  it("belongs to a workflow no path filter can leave without a result", () => {
    for (const job of jobs) {
      expect(triggers(job.workflow)).not.toMatch(/^\s+paths(?:-ignore)?:/m);
    }
  });

  it("runs on an edit only when it does all its work again", () => {
    for (const job of jobs) {
      expect(/\bedited\b/.test(triggers(job.workflow))).toBe(
        REDONE_ON_AN_EDIT.includes(check),
      );
      expect(job.text).not.toContain("github.event.action");
    }
  });
});

describe("the CI workflow, which runs again on an edit", () => {
  it("keeps the edit run out of the group that would cancel the run for the commit", () => {
    const group =
      /concurrency:\n\s+group: (.+)\n\s+cancel-in-progress: true/.exec(
        read("ci.yml"),
      )?.[1];
    expect(group).toContain("github.event.action == 'edited' && '-edited'");
  });
});
