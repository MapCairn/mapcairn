// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  jobRanges,
  RELEASE_WORKFLOW,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const TEXT = readFileSync(path.join(REPO, RELEASE_WORKFLOW), "utf8");

/** The workflow without comments, so a note cannot pass for a setting. */
const CLEAN = TEXT.split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
  .join("\n");

const RANGES = jobRanges(CLEAN) as Map<string, { start: number; end: number }>;

/** The lines of one job, without comments. */
function job(name: string): string[] {
  const range = RANGES.get(name);
  if (range === undefined) {
    return [];
  }
  return CLEAN.split("\n").slice(range.start - 1, range.end);
}

/** The permissions a job grants, as `scope: level`. */
function permissionsOf(name: string): string[] {
  const lines = job(name);
  const start = lines.findIndex((line) => /^ {4}permissions:/.test(line));
  if (start === -1) {
    return [];
  }
  const found: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= 4) {
      break;
    }
    if (line.trim() !== "") {
      found.push(line.trim().replace(/\s+/g, " "));
    }
  }
  return found;
}

describe("release.yml", () => {
  it("has the three jobs the trusted publisher record and the plan name", () => {
    expect([...RANGES.keys()]).toEqual(["verify", "github-release", "npm"]);
  });

  it("runs on a push to main that changes the changelog, and on a dispatch that defaults to a rehearsal", () => {
    expect(CLEAN).toMatch(
      /^on:\n {2}push:\n {4}branches: \[main\]\n {4}paths:\n {6}- CHANGELOG\.md\n {2}workflow_dispatch:/m,
    );
    expect(CLEAN).toMatch(/inputs:\n {6}version:/);
    expect(CLEAN).toMatch(/mode:[\s\S]*?default: rehearse/);
    expect(CLEAN).toMatch(/options:\n\s+- rehearse\n\s+- publish-existing/);
  });

  it("grants nothing at the top, and never runs two releases of one version at once or cancels one", () => {
    expect(CLEAN).toMatch(/^permissions: \{\}$/m);
    expect(CLEAN).toMatch(
      /^concurrency:\n {2}group: release-\$\{\{ inputs\.version \|\| github\.sha \}\}\n {2}cancel-in-progress: false$/m,
    );
  });

  it("runs every job only on main", () => {
    for (const name of RANGES.keys()) {
      const condition = job(name)
        .join("\n")
        .match(/^ {4}if:[\s\S]*?(?=^ {4}\S)/m);
      expect(condition?.[0], name).toContain("refs/heads/main");
    }
  });

  it("gives each job the least permissions it needs, and explains each write", () => {
    expect(permissionsOf("verify")).toEqual([
      "contents: read",
      "pull-requests: read",
      "attestations: read",
    ]);
    expect(permissionsOf("github-release")).toEqual([
      "contents: write",
      "id-token: write",
      "attestations: write",
    ]);
    expect(permissionsOf("npm")).toEqual(["id-token: write", "contents: read"]);
    const writes = TEXT.split("\n").filter((line) =>
      /^\s+[\w-]+: write\b/.test(line),
    );
    expect(writes).toHaveLength(4);
    for (const line of writes) {
      expect(line, line).toMatch(/: write\s+#\s*\S/);
    }
  });

  it("pins every action to a full commit SHA and names its version beside it", () => {
    const uses = TEXT.split("\n").filter((line) => /^\s*-?\s*uses:/.test(line));
    expect(uses.length).toBeGreaterThan(5);
    for (const line of uses) {
      expect(line, line).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v\d/);
    }
  });

  it("checks out with the full history and keeps no credential, and caches nothing", () => {
    const checkouts = CLEAN.split("\n").flatMap((line, index, lines) =>
      line.includes("actions/checkout@")
        ? [lines.slice(index, index + 6).join("\n")]
        : [],
    );
    expect(checkouts.length).toBeGreaterThan(0);
    for (const step of checkouts) {
      expect(step).toContain("fetch-depth: 0");
      expect(step).toContain("persist-credentials: false");
    }
    expect(CLEAN).not.toMatch(/^\s+cache:/m);
    const setups = CLEAN.split("\n").flatMap((line, index, lines) =>
      line.includes("actions/setup-node@")
        ? [lines.slice(index, index + 6).join("\n")]
        : [],
    );
    for (const step of setups) {
      expect(step).toContain("package-manager-cache: false");
    }
  });

  it("puts no expression in a shell line, so no input or pull request text can become a command", () => {
    const lines = CLEAN.split("\n");
    const inRun: string[] = [];
    let runIndent = -1;
    for (const line of lines) {
      const start = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);
      if (start !== null) {
        runIndent = start[1].length;
        inRun.push(start[2]);
        continue;
      }
      if (
        runIndent >= 0 &&
        line.trim() !== "" &&
        line.search(/\S/) > runIndent
      ) {
        inRun.push(line);
        continue;
      }
      runIndent = -1;
    }
    expect(inRun.length).toBeGreaterThan(5);
    expect(inRun.filter((line) => line.includes("${{"))).toEqual([]);
  });

  it("creates the GitHub Release only for a push, and attests the tarballs first", () => {
    const lines = job("github-release").join("\n");
    expect(lines).toMatch(/github\.event_name == 'push'/);
    expect(lines).toContain("needs.verify.outputs.release == 'true'");
    expect(lines.indexOf("attest-build-provenance")).toBeGreaterThan(-1);
    expect(lines.indexOf("attest-build-provenance")).toBeLessThan(
      lines.indexOf("gh release create"),
    );
    expect(lines).toContain("--target");
    expect(lines).toContain("--notes-file");
  });

  it("uses the explicit condition that keeps the npm job from being skipped with a skipped dependency", () => {
    const condition = job("npm").join("\n");
    expect(condition).toContain("!cancelled()");
    expect(condition).toContain("needs.verify.result == 'success'");
    expect(condition).toContain("needs.verify.outputs.release == 'true'");
    expect(condition).toContain(
      `contains(fromJSON('["success","skipped"]'), needs.github-release.result)`,
    );
    expect(condition).toContain(
      "needs.verify.outputs.on-npm == 'true' || inputs.mode == 'rehearse'",
    );
  });

  it("verifies a download before it is published again", () => {
    const lines = job("verify").join("\n");
    expect(lines).toContain("gh release download");
    expect(lines).toContain("gh attestation verify");
    expect(lines).toContain(
      "--signer-workflow MapCairn/mapcairn/.github/workflows/release.yml",
    );
    expect(lines).toContain("--source-ref refs/heads/main");
    expect(lines).toContain("--deny-self-hosted-runners");
    expect(lines).toContain("--source-digest");
    expect(lines).toContain("git merge-base --is-ancestor");
  });

  it("reads the changelog for the release notes only on a push", () => {
    const lines = job("verify").join("\n");
    expect(lines).toMatch(/scripts\/release\/notes\.mjs/);
    expect(lines).toMatch(
      /if: github\.event_name == 'push' && steps\.decide\.outputs\.release == 'true'/,
    );
  });
});
