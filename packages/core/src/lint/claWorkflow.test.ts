// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const workflow = readFileSync(
  path.join(REPO, ".github/workflows/cla.yml"),
  "utf8",
);
const contributing = readFileSync(path.join(REPO, "CONTRIBUTING.md"), "utf8");

/** Lines of the workflow with comments removed, so checks see only what runs. */
const code = workflow
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

/** The text of the github-script `script: |` block. */
const scriptBlock = (() => {
  const start = code.indexOf("script: |");
  expect(start).toBeGreaterThan(-1);
  return code.slice(start + "script: |".length);
})();

describe(".github/workflows/cla.yml", () => {
  it("has no expression anywhere in the script, so no untrusted value is interpolated", () => {
    expect(scriptBlock).not.toContain("${{");
  });

  it("only imports run.mjs from the checked-out workspace and calls run", () => {
    expect(scriptBlock).toContain("process.env.GITHUB_WORKSPACE");
    expect(scriptBlock).toContain('"scripts", "cla", "run.mjs"');
    expect(scriptBlock).toMatch(/await run\(\{ github, context, core \}\)/);
    expect(scriptBlock).not.toMatch(/\beval\b|new Function|child_process/);
  });

  it("has no expression in any run step", () => {
    expect(code).not.toMatch(/^\s*(?:- )?run:/m);
  });

  it("starts with no permissions and gives the one job only what it uses", () => {
    expect(code).toMatch(/^permissions: \{\}$/m);
    const job = code.slice(code.indexOf("\njobs:"));
    const block = /permissions:\n((?: {6}\S.*\n)+)/.exec(job)?.[1] ?? "";
    const keys = [...block.matchAll(/^ {6}([a-z-]+): (\w+)/gm)].map(
      (m) => `${m[1]}: ${m[2]}`,
    );
    expect(keys).toEqual([
      "contents: write",
      "pull-requests: write",
      "statuses: write",
    ]);
  });

  it("checks out only the default branch, with no credentials and only scripts/cla", () => {
    const from = code.indexOf("actions/checkout@");
    const step = code.slice(from, code.indexOf("actions/github-script@"));
    expect(from).toBeGreaterThan(-1);
    expect(step).toContain(
      "ref: ${{ github.event.repository.default_branch }}",
    );
    expect(step).toContain("persist-credentials: false");
    expect(step).toContain("sparse-checkout: scripts/cla");
    expect(code.match(/^\s*ref:/gm)).toHaveLength(1);
  });

  it("never mentions the pull request's head", () => {
    expect(code).not.toMatch(
      /pull_request\.head|github\.head_ref|head\.sha|head\.ref/,
    );
  });

  it("runs the job for pull requests only", () => {
    const condition = /^ {4}if: (.*(?:\n {6}.*)*)/m.exec(code)?.[1] ?? "";
    expect(condition).toContain("github.event.issue.pull_request");
    expect(condition).toContain("github.event_name == 'pull_request_target'");
  });

  it("gives a comment that cannot matter a group of its own, so it cannot displace a waiting run", () => {
    const group = /^ {2}group: (.*)$/m.exec(code)?.[1] ?? "";
    expect(group).toContain("github.run_id");
    expect(group).toContain("github.event.pull_request.number");
    expect(code).toMatch(/cancel-in-progress: false/);
  });

  it("uses exactly two actions, each pinned to a full commit SHA", () => {
    const uses = [...code.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map(
      (m) => m[1],
    );
    expect(uses).toHaveLength(2);
    expect(uses.map((u) => u?.split("@")[0])).toEqual([
      "actions/checkout",
      "actions/github-script",
    ]);
    for (const use of uses) {
      expect(use).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("listens only for pull_request_target and issue_comment events", () => {
    expect(code).toMatch(/^on:\n {2}pull_request_target:/m);
    expect(code).toMatch(/^ {2}issue_comment:/m);
    expect(code).not.toMatch(/^ {2}pull_request:/m);
    expect(code).not.toMatch(/workflow_run|workflow_dispatch/);
  });

  it("warns, in its header and in CONTRIBUTING.md, that CLA must not be required yet", () => {
    expect(workflow).toMatch(/must not be made a required status/i);
    expect(contributing).toMatch(/must not be made a required/i);
    expect(contributing).toMatch(/Dependabot/);
  });
});
