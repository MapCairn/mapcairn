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
 * Cache scope (issue 515). A job that runs third-party code on `main` holds the
 * runner's cache token, and with it can save an entry that a later job on
 * `main` restores. GitHub scopes a cache by branch, not by workflow or job, and
 * the code that writes an entry chooses its key, so neither a key nor a
 * separate workflow isolates anything. What does is `cache-mode`, which limits
 * the token itself. These tests pin where it must be set.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const WORKFLOWS_DIR = path.join(REPO, ".github/workflows");

/** Commands that install third-party code from the registry without the lockfile. */
const THIRD_PARTY_RUNNERS = ["consumer:check", "consumerCheck.mjs"];

interface Job {
  readonly file: string;
  readonly name: string;
  /** The job's lines, comments removed. */
  readonly lines: readonly string[];
  /** The workflow's lines, comments removed. */
  readonly workflow: string;
}

/** A workflow's text without comments, so a note cannot pass for a setting. */
function clean(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

function loadJobs(): Job[] {
  const jobs: Job[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).sort()) {
    if (!file.endsWith(".yml")) {
      continue;
    }
    const workflow = clean(
      readFileSync(path.join(WORKFLOWS_DIR, file), "utf8"),
    );
    const ranges = jobRanges(workflow) as Map<
      string,
      { start: number; end: number }
    >;
    for (const [name, range] of ranges) {
      jobs.push({
        file,
        name,
        lines: workflow.split("\n").slice(range.start - 1, range.end),
        workflow,
      });
    }
  }
  return jobs;
}

const JOBS = loadJobs();

/** The cache mode a job gets: its own, else the workflow's, else GitHub's default. */
function cacheMode(job: Job): string {
  const jobLine = job.lines.find((line) => /^ {4}cache-mode:/.test(line));
  const workflowLine = job.workflow
    .split("\n")
    .find((line) => /^cache-mode:/.test(line));
  const setting = jobLine ?? workflowLine;
  return setting === undefined ? "default" : setting.split(":")[1].trim();
}

function find(file: string, name: string): Job {
  const job = JOBS.find((j) => j.file === file && j.name === name);
  expect(job, `${file} job ${name}`).toBeDefined();
  return job as Job;
}

function runsThirdPartyCode(job: Job): boolean {
  const text = job.lines.join("\n");
  return THIRD_PARTY_RUNNERS.some((command) => text.includes(command));
}

describe("cache scope in the workflows", () => {
  it("finds the two jobs that run the consumer check", () => {
    const found = JOBS.filter(runsThirdPartyCode).map(
      (job) => `${job.file}:${job.name}`,
    );
    expect(found.sort()).toEqual(["ci.yml:sdk-packages", "release.yml:check"]);
  });

  it("cannot save a cache from a job that runs the consumer check", () => {
    for (const job of JOBS.filter(runsThirdPartyCode)) {
      expect(["read", "none"], `${job.file}:${job.name}`).toContain(
        cacheMode(job),
      );
    }
  });

  it("gives no job of release.yml any cache access, in either direction", () => {
    const release = JOBS.filter((job) => job.file === "release.yml");
    expect(release.map((job) => job.name)).toEqual([
      "verify",
      "check",
      "github-release",
      "npm",
    ]);
    for (const job of release) {
      expect(cacheMode(job), job.name).toBe("none");
    }
  });

  it("gives no job that can mint an OIDC token any cache access", () => {
    for (const job of JOBS) {
      if (/^\s+id-token: write/m.test(job.lines.join("\n"))) {
        expect(cacheMode(job), `${job.file}:${job.name}`).toBe("none");
      }
    }
  });

  it("lets no job ask for a write-capable mode", () => {
    for (const job of JOBS) {
      expect(["write", "write-only"], `${job.file}:${job.name}`).not.toContain(
        cacheMode(job),
      );
    }
  });

  it("keeps the setup-node cache off in release.yml", () => {
    const text = JOBS.filter((job) => job.file === "release.yml")
      .flatMap((job) => job.lines)
      .join("\n");
    expect(text).not.toMatch(/^\s+cache:/m);
    expect(text).not.toContain("actions/cache");
  });
});

describe("the other workflows keep their lockfile caches", () => {
  it("still restores a cache in the build and browser jobs, which install only what the lockfile pins", () => {
    for (const [file, name] of [
      ["ci.yml", "build"],
      ["playwright.yml", "shard"],
      ["lighthouse.yml", "lighthouse"],
      ["repeatable-build.yml", "compare"],
    ]) {
      const job = find(file, name);
      expect(runsThirdPartyCode(job), `${file}:${name}`).toBe(false);
      expect(job.lines.join("\n"), `${file}:${name}`).toContain("cache: npm");
    }
  });
});
