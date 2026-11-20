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
import {
  CONFIRM_DELAYS_MS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/verifyRelease.mjs";
import {
  SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";

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
  it("gives the npm job room to wait out the registry for each SDK package", () => {
    const line = job("npm").find((entry) =>
      /^ {4}timeout-minutes:/.test(entry),
    );
    const minutes = Number(line?.split(":")[1]);
    const waitMinutes =
      CONFIRM_DELAYS_MS.reduce((sum: number, ms: number) => sum + ms, 0) /
      60_000;
    // The floor, in minutes:
    //   packages * (wait + reads * readAllowance + publishAllowance) + setup
    // where `wait` is the sum of the registry waits, there is one read before
    // the first wait and one after each (so one more than the waits), each read
    // is allowed 10 s for its round trip, the publish with its provenance 30 s,
    // and setup (checkout, npm, the checks of the files) 10 minutes.
    const reads = CONFIRM_DELAYS_MS.length + 1;
    const readAllowanceMinutes = 10 / 60;
    const publishAllowanceMinutes = 30 / 60;
    const setupMinutes = 10;
    expect(minutes).toBeGreaterThanOrEqual(
      SDK_PACKAGES.length *
        (waitMinutes + reads * readAllowanceMinutes + publishAllowanceMinutes) +
        setupMinutes,
    );
  });

  it("has the jobs the trusted publisher record and the plan name, and a check job between verify and the release", () => {
    expect([...RANGES.keys()]).toEqual([
      "verify",
      "check",
      "github-release",
      "rehearse",
      "npm",
    ]);
  });

  it("names each run by its mode and version, so an approval cannot be mistaken for a rehearsal", () => {
    expect(CLEAN).toMatch(
      /^run-name: Release \$\{\{ inputs\.mode \|\| 'publish' \}\} \$\{\{ inputs\.version \|\| github\.sha \}\}$/m,
    );
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
    expect(permissionsOf("rehearse")).toEqual(["contents: read"]);
    expect(job("check").join("\n")).toMatch(/^ {4}permissions: \{\}$/m);
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
    expect(lines).toContain("--notes-file");
    expect(lines).toContain("--verify-tag");
    expect(lines).not.toContain("--target");
  });

  it("creates the tag at the pushed commit through the API before the release, and accepts an existing tag only at that commit", () => {
    const lines = job("github-release").join("\n");
    expect(lines).toContain(
      'gh api --method POST "repos/$GH_REPO/git/refs" -f ref="refs/tags/v$VERSION" -f sha="$TARGET"',
    );
    expect(lines).toContain('[ "$existing" != "$TARGET" ]');
    expect(lines.indexOf("git/refs")).toBeLessThan(
      lines.indexOf("gh release create"),
    );
  });

  it("packs once and uploads at once, passes the digests as an output, and runs third-party code only in a job with no permission", () => {
    const verify = job("verify").join("\n");
    const order = [
      "scripts/release/tarballs.mjs pack release",
      "scripts/release/tarballs.mjs record release",
      "actions/upload-artifact",
    ].map((text) => verify.indexOf(text));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(verify).toContain("digests: ${{ steps.record.outputs.digests }}");
    expect(verify).toContain(
      "notes-digest: ${{ steps.record.outputs.notes-digest }}",
    );
    for (const text of [
      "packCheck",
      "consumerCheck",
      "npm pack",
      "pack:check",
    ]) {
      expect(verify, text).not.toContain(text);
    }
    const check = job("check").join("\n");
    expect(check).toContain("packCheck.mjs --tarballs release");
    expect(check).toContain("consumerCheck.mjs --tarballs release");
    expect(check).toContain("permissions: {}");
    expect(check).not.toMatch(/GH_TOKEN|github\.token|secrets\./);
    expect(check).not.toContain("upload-artifact");
  });

  it("compares what github-release and npm download with the recorded digests, and with exactly the expected tarballs, before attesting or publishing", () => {
    for (const [name, after] of [
      ["github-release", "attest-build-provenance"],
      ["rehearse", "package-state"],
      ["npm", "package-state"],
    ] as const) {
      const lines = job(name).join("\n");
      const check = lines.search(
        /tarballs\.mjs check(?:-release)? release "\$DIGESTS"/,
      );
      expect(check, name).toBeGreaterThan(-1);
      expect(
        lines.indexOf('verifyRelease.mjs tarballs "$VERSION" release'),
        name,
      ).toBeGreaterThan(-1);
      expect(check, name).toBeLessThan(lines.indexOf(after));
      expect(lines).toContain("DIGESTS: ${{ needs.verify.outputs.digests }}");
    }
    expect(job("github-release").join("\n")).toContain(
      'tarballs.mjs check-release release "$DIGESTS" "$NOTES_DIGEST"',
    );
    for (const name of ["check", "github-release", "rehearse", "npm"]) {
      expect(job(name).join("\n"), name).toContain(
        "NOTES_DIGEST: ${{ needs.verify.outputs.notes-digest }}",
      );
    }
    expect(job("github-release").join("\n")).toContain(
      "needs.check.result == 'success'",
    );
    expect(job("npm").join("\n")).toContain("needs.check.result == 'success'");
  });

  it("writes the release notes before it records their digest, and the digest step runs for every release", () => {
    const verify = job("verify").join("\n");
    expect(verify.indexOf("name: Write the release notes")).toBeGreaterThan(-1);
    expect(verify.indexOf("name: Write the release notes")).toBeLessThan(
      verify.indexOf("tarballs.mjs record release"),
    );
    expect(verify).toMatch(
      /name: Record the digests[\s\S]*?id: record\n\s+if: steps\.decide\.outputs\.release == 'true'/,
    );
  });

  it("downloads the artifact by its name in every job that uses it", () => {
    for (const name of ["check", "github-release", "rehearse", "npm"]) {
      expect(job(name).join("\n"), name).toMatch(
        /actions\/download-artifact@[0-9a-f]{40}\s*\n\s+with:\n\s+name: release-files\n\s+path: release/,
      );
    }
  });

  it("checks the version and name of the tarballs it downloads for publish-existing", () => {
    const verify = job("verify").join("\n");
    expect(verify).toMatch(
      /Verify the attestation[\s\S]*?if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'publish-existing'[\s\S]*?verifyRelease\.mjs tarballs "\$VERSION" release/,
    );
  });

  it("uses the explicit condition that keeps the npm job from being skipped with a skipped dependency", () => {
    const condition = job("npm").join("\n");
    expect(condition).toContain("!cancelled()");
    expect(condition).toContain("needs.verify.result == 'success'");
    expect(condition).toContain("needs.verify.outputs.release == 'true'");
    expect(condition).toContain(
      `contains(fromJSON('["success","skipped"]'), needs.github-release.result)`,
    );
    expect(condition).not.toContain("on-npm");
    expect(condition).toContain("inputs.mode != 'rehearse'");
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
