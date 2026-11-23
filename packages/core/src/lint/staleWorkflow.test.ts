// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Stale handling (issue 805). The workflow only labels and comments: it must
 * never close anything, and it must leave planned, milestoned and assigned work
 * alone.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const workflow = readFileSync(
  path.join(REPO, ".github/workflows/stale.yml"),
  "utf8",
);

/** The `with:` inputs of the stale step, comments removed. */
function inputs(): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of workflow.split("\n")) {
    const match = /^ {10}([a-z-]+): (.+?)(?: +#.*)?$/.exec(line);
    if (match) {
      found.set(match[1], match[2].replace(/^"|"$/g, ""));
    }
  }
  return found;
}

describe("the stale workflow", () => {
  it("runs weekly and by hand, and on nothing else", () => {
    expect(workflow).toMatch(/^on:\n {2}schedule:\n {4}- cron: "[^"]+"/m);
    expect(workflow).toMatch(/^ {2}workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^ {2}(push|pull_request\w*|issues):/m);
    expect(workflow.match(/cron:/g)).toHaveLength(1);
  });

  it("pins actions/stale by full commit SHA with its release in a comment", () => {
    expect(workflow).toMatch(
      /uses: actions\/stale@[0-9a-f]{40} # v\d+\.\d+\.\d+/,
    );
  });

  it("never closes anything", () => {
    const set = inputs();
    expect(set.get("days-before-close")).toBe("-1");
    expect(set.has("days-before-issue-close")).toBe(false);
    expect(set.has("days-before-pr-close")).toBe(false);
    expect(set.get("delete-branch") ?? "false").toBe("false");
    expect(set.has("close-issue-message")).toBe(false);
  });

  it("uses the long thresholds, 90 days for issues and 30 for pull requests", () => {
    const set = inputs();
    expect(set.get("days-before-issue-stale")).toBe("90");
    expect(set.get("days-before-pr-stale")).toBe("30");
  });

  it("gives a message for each kind, since the action marks nothing without one", () => {
    const set = inputs();
    expect(set.get("stale-issue-message")).toBeTruthy();
    expect(set.get("stale-pr-message")).toBeTruthy();
  });

  it("exempts planned, milestoned and assigned work", () => {
    const set = inputs();
    expect(set.get("exempt-issue-labels")?.split(",")).toContain("plan");
    expect(set.get("exempt-all-milestones")).toBe("true");
    expect(set.get("exempt-all-assignees")).toBe("true");
  });

  it("exempts only labels that exist in the repository", () => {
    const set = inputs();
    const known = ["plan", "release", "dependencies"];
    for (const key of ["exempt-issue-labels", "exempt-pr-labels"]) {
      for (const label of set.get(key)?.split(",") ?? []) {
        expect(known, `${key}: ${label}`).toContain(label);
      }
    }
  });

  it("handles a small number of items in each run", () => {
    const limit = Number(inputs().get("operations-per-run"));
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(30);
  });

  it("holds no permissions for the workflow and write access only on its one job", () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    const writes = workflow.match(/^\s+[a-z-]+: write/gm) ?? [];
    expect(writes.map((line) => line.trim())).toEqual([
      "issues: write",
      "pull-requests: write",
    ]);
    expect(workflow).toMatch(/^ {4}permissions:\n {6}issues: write/m);
  });

  it("runs no pull request code, and no checkout", () => {
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toContain("pull_request_target");
  });
});
