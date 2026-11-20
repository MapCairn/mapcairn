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

/** A workflow's lines with comments removed, so checks see only what runs. */
function code(file: string): string {
  return readFileSync(path.join(REPO, ".github/workflows", file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** Every value given to a `version:` input in the workflow. */
function versions(source: string): string[] {
  return [...source.matchAll(/^\s+version:\s*(\S+)\s*$/gm)].map((m) => m[1]);
}

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{40}$/;

describe(".github/workflows/zizmor.yml", () => {
  const source = code("zizmor.yml");
  const actionUses = [
    ...source.matchAll(/uses:\s*zizmorcore\/zizmor-action@(\S+)/g),
  ];

  it("runs the zizmor action pinned by commit SHA in both jobs", () => {
    expect(actionUses).toHaveLength(2);
    for (const use of actionUses) {
      expect(use[1]).toMatch(SHA);
    }
  });

  it("names one exact zizmor version for each run, never latest or missing", () => {
    const found = versions(source);
    expect(found).toHaveLength(actionUses.length);
    for (const version of found) {
      expect(version).toMatch(EXACT_VERSION);
    }
    expect(new Set(found).size).toBe(1);
  });
});

describe(".github/workflows/secret-scan.yml", () => {
  const source = code("secret-scan.yml");

  it("pins the TruffleHog action by commit SHA", () => {
    expect(source).toMatch(
      /uses:\s*trufflesecurity\/trufflehog@[0-9a-f]{40}\b/,
    );
  });

  it("pins the image to an exact tag and digest, never latest or missing", () => {
    const [version, ...rest] = versions(source);
    expect(rest).toEqual([]);
    expect(version).toMatch(/^\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it("keeps the image tag equal to the action's own release", () => {
    const comment =
      /trufflesecurity\/trufflehog@[0-9a-f]{40}\s*#\s*v(\S+)/.exec(
        readFileSync(
          path.join(REPO, ".github/workflows/secret-scan.yml"),
          "utf8",
        ),
      );
    expect(comment).not.toBeNull();
    expect(versions(source)[0]?.split("@")[0]).toBe(comment?.[1]);
  });

  it("still reports verified results only", () => {
    expect(source).toContain("--results=verified");
  });
});
