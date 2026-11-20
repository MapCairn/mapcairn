// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  jobRanges,
  NPM_JOB,
  RELEASE_WORKFLOW,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const WORKFLOWS = ".github/workflows";

/** The jobs that may hold `id-token: write`, by workflow file. */
const ID_TOKEN_JOBS: Record<string, string[]> = {
  "release.yml": ["github-release", NPM_JOB],
  "scorecard.yml": ["analysis"],
};

/** A workflow's text without comments, so a note cannot pass for a setting. */
function withoutComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

/**
 * The jobs (or "(workflow)" for the top level) that hold `id-token: write`.
 */
function idTokenWriters(text: string): string[] {
  const clean = withoutComments(text);
  const ranges = [...jobRanges(clean)] as [
    string,
    { start: number; end: number },
  ][];
  return clean.split("\n").flatMap((line, index) => {
    if (!/^\s*id-token:\s*write\b/.test(line)) {
      return [];
    }
    const lineNumber = index + 1;
    const job = ranges.find(
      ([, range]) => lineNumber >= range.start && lineNumber <= range.end,
    );
    return [job === undefined ? "(workflow)" : job[0]];
  });
}

/** What a workflow's top-level `permissions:` says, one entry for each line below it. */
function topLevelPermissions(text: string): string[] | undefined {
  const lines = withoutComments(text).split("\n");
  const start = lines.findIndex((line) => /^permissions:/.test(line));
  if (start === -1) {
    return undefined;
  }
  const inline = lines[start].replace(/^permissions:\s*/, "").trim();
  const block: string[] = inline === "" ? [] : [inline];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) {
      break;
    }
    if (line.trim() !== "") {
      block.push(line.trim());
    }
  }
  return block;
}

/** Why a workflow breaks the least-privilege rule, or nothing. */
function permissionProblems(text: string): string[] {
  const top = topLevelPermissions(text);
  if (top === undefined) {
    return ["has no top-level permissions"];
  }
  const problems: string[] = [];
  if (top.some((entry) => /write/.test(entry))) {
    problems.push("grants write at the top level");
  }
  if (/permissions:\s*(?:write-all|read-all)\b/.test(withoutComments(text))) {
    problems.push("uses write-all or read-all");
  }
  return problems;
}

function workflowFiles(): string[] {
  return readdirSync(path.join(REPO, WORKFLOWS)).filter((file) =>
    /\.ya?ml$/.test(file),
  );
}

function readWorkflow(file: string): string {
  return readFileSync(path.join(REPO, WORKFLOWS, file), "utf8");
}

describe("id-token: write", () => {
  it("is held only by release.yml (github-release and npm) and by the analysis job of scorecard.yml", () => {
    const problems = workflowFiles().flatMap((file) => {
      const allowed = ID_TOKEN_JOBS[file] ?? [];
      return idTokenWriters(readWorkflow(file))
        .filter((job) => !allowed.includes(job))
        .map((job) => `${file}: ${job}`);
    });
    expect(problems).toEqual([]);
  });

  it("is found at the top of a workflow, in another job and in a flow-style mapping", () => {
    const top = "permissions:\n  id-token: write\njobs:\n  a:\n    steps: []\n";
    expect(idTokenWriters(top)).toEqual(["(workflow)"]);
    const other =
      "permissions: {}\njobs:\n  a:\n    permissions:\n      id-token: write\n";
    expect(idTokenWriters(other)).toEqual(["a"]);
    const inRelease =
      "jobs:\n  npm:\n    permissions:\n      id-token: write\n  verify:\n    permissions:\n      id-token: write\n";
    expect(idTokenWriters(inRelease)).toEqual(["npm", "verify"]);
  });

  it("does not count a comment or a read", () => {
    const text =
      "permissions: {}\njobs:\n  a:\n    permissions:\n      id-token: read # not write\n      # id-token: write\n";
    expect(idTokenWriters(text)).toEqual([]);
  });

  it("is still held by the scorecard analysis job, so the allowance names a job that exists", () => {
    expect(idTokenWriters(readWorkflow("scorecard.yml"))).toEqual(["analysis"]);
  });
});

describe("least privilege", () => {
  it("gives every workflow top-level permissions that grant no write", () => {
    const problems = workflowFiles().flatMap((file) =>
      permissionProblems(readWorkflow(file)).map(
        (problem) => `${file} ${problem}`,
      ),
    );
    expect(problems).toEqual([]);
  });

  it("fails a workflow without permissions, with a write at the top, or with write-all", () => {
    expect(permissionProblems("name: x\njobs: {}\n")).toEqual([
      "has no top-level permissions",
    ]);
    expect(
      permissionProblems("permissions:\n  contents: write\njobs: {}\n"),
    ).toEqual(["grants write at the top level"]);
    expect(permissionProblems("permissions: write-all\njobs: {}\n")).toEqual([
      "grants write at the top level",
      "uses write-all or read-all",
    ]);
    expect(
      permissionProblems(
        "permissions: {}\njobs:\n  a:\n    permissions: write-all\n",
      ),
    ).toEqual(["uses write-all or read-all"]);
  });

  it("passes empty and read-only permissions", () => {
    expect(permissionProblems("permissions: {}\njobs: {}\n")).toEqual([]);
    expect(
      permissionProblems(
        "permissions:\n  contents: read # check out\njobs: {}\n",
      ),
    ).toEqual([]);
  });
});

describe("release.yml", () => {
  const file = path.join(REPO, RELEASE_WORKFLOW);

  it("publishes only from the npm job, in the npm environment, on main, and nowhere else holds the command", () => {
    if (!existsSync(file)) {
      // Built in #433; until then the guard allows no workflow to publish.
      return;
    }
    const text = withoutComments(readFileSync(file, "utf8"));
    const ranges = jobRanges(text) as Map<
      string,
      { start: number; end: number }
    >;
    const range = ranges.get(NPM_JOB);
    expect(range).toBeDefined();
    const lines = text.split("\n").slice((range?.start ?? 1) - 1, range?.end);
    const job = lines.join("\n");
    expect(job).toMatch(/environment:\s*npm\b/);
    expect(job).toMatch(/if:[^\n]*refs\/heads\/main/);
    expect(job).toMatch(/id-token:\s*write/);
    expect(job).toMatch(/contents:\s*read/);
  });
});
