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
    if (!/id-token["']?\s*:\s*["']?write\b/.test(line)) {
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
    const flow =
      'permissions: { id-token: write }\njobs:\n  a:\n    permissions: { contents: read, id-token: write }\n  b:\n    permissions: {"id-token": write}\n';
    expect(idTokenWriters(flow)).toEqual(["(workflow)", "a", "b"]);
    const quoted = "jobs:\n  a:\n    permissions:\n      'id-token': 'write'\n";
    expect(idTokenWriters(quoted)).toEqual(["a"]);
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

/** The lines of the `npm` job of a workflow, or none. */
function npmJobLines(text: string): string[] {
  const clean = withoutComments(text);
  const range = (
    jobRanges(clean) as Map<string, { start: number; end: number }>
  ).get(NPM_JOB);
  return range === undefined
    ? []
    : clean.split("\n").slice(range.start - 1, range.end);
}

/** The job's own `if:` (four spaces in), with the lines of a folded condition below it. */
function jobCondition(lines: string[]): string {
  const index = lines.findIndex((line) => /^ {4}if:/.test(line));
  if (index === -1) {
    return "";
  }
  const rest: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= 4) {
      break;
    }
    rest.push(line);
  }
  return [lines[index], ...rest].join("\n");
}

/** Why the `npm` job of a workflow is not as the plan describes it. */
function npmJobProblems(text: string): string[] {
  const lines = npmJobLines(text);
  if (lines.length === 0) {
    return ["has no npm job"];
  }
  const job = lines.join("\n");
  const problems: string[] = [];
  if (!/^ {4}environment:\s*npm\b/m.test(job)) {
    problems.push("does not run in the npm environment");
  }
  if (!/refs\/heads\/main/.test(jobCondition(lines))) {
    problems.push("does not run only on main");
  }
  if (!/id-token["']?\s*:\s*["']?write\b/.test(job)) {
    problems.push("has no id-token: write");
  }
  if (!/contents["']?\s*:\s*["']?read\b/.test(job)) {
    problems.push("does not read contents only");
  }
  return problems;
}

/** The shape the plan gives the job, with its condition folded over several lines. */
const PLAN_NPM_JOB = [
  "jobs:",
  "  verify:",
  "    runs-on: ubuntu-latest",
  "  npm:",
  "    runs-on: ubuntu-latest",
  "    environment: npm",
  "    if: >-",
  "      always() &&",
  "      github.ref == 'refs/heads/main' &&",
  "      needs.verify.result == 'success'",
  "    permissions:",
  "      id-token: write",
  "      contents: read",
  "    steps:",
  "      - run: npm stage publish ./core.tgz --tag latest",
  "",
].join("\n");

describe("release.yml", () => {
  const file = path.join(REPO, RELEASE_WORKFLOW);

  it("has an npm job as the plan describes it, once the workflow exists", () => {
    if (!existsSync(file)) {
      // Built in #433; until then the guard allows no workflow to publish.
      return;
    }
    expect(npmJobProblems(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("accepts the plan's job, with a condition folded over several lines or on one", () => {
    expect(npmJobProblems(PLAN_NPM_JOB)).toEqual([]);
    const oneLine = PLAN_NPM_JOB.replace(
      / {4}if: >-\n(?: {6}.*\n){3}/,
      "    if: github.ref == 'refs/heads/main'\n",
    );
    expect(npmJobProblems(oneLine)).toEqual([]);
  });

  it("fails a job without the environment, the condition on main, the token or read-only contents", () => {
    expect(npmJobProblems("jobs:\n  verify:\n    steps: []\n")).toEqual([
      "has no npm job",
    ]);
    expect(
      npmJobProblems(PLAN_NPM_JOB.replace("    environment: npm\n", "")),
    ).toEqual(["does not run in the npm environment"]);
    expect(
      npmJobProblems(
        PLAN_NPM_JOB.replace("github.ref == 'refs/heads/main' &&", "true &&"),
      ),
    ).toEqual(["does not run only on main"]);
    expect(
      npmJobProblems(PLAN_NPM_JOB.replace("      id-token: write\n", "")),
    ).toEqual(["has no id-token: write"]);
    expect(
      npmJobProblems(PLAN_NPM_JOB.replace("contents: read", "contents: write")),
    ).toEqual(["does not read contents only"]);
  });

  it("does not take a step's condition for the job's", () => {
    const stepOnly = PLAN_NPM_JOB.replace(
      / {4}if: >-\n(?: {6}.*\n){3}/,
      "",
    ).replace(
      "      - run:",
      "      - if: github.ref == 'refs/heads/main'\n        run:",
    );
    expect(npmJobProblems(stepOnly)).toEqual(["does not run only on main"]);
  });
});
