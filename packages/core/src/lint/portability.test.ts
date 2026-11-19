// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findProblems,
  isChecked,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/portability-check.mjs";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/portability-check.mjs",
);

/** Spawning Node can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;

describe("findProblems", () => {
  it.each([
    ["a macOS home path", "cd /Users/someone/code"],
    ["a Linux home path", "cat /home/someone/notes"],
    ["a Windows drive path", String.raw`copy C:\Work\file.txt`],
    ["a path in /tmp", "write it to /tmp/out.json"],
    ["lsof", "run lsof -nP -iTCP:5190"],
    ["pgrep", "pgrep -f vite"],
    ["pkill", "pkill node"],
    ["readlink -f", "readlink -f ."],
    ["date -d", "date -d yesterday"],
    ["sed -i", "sed -i s/a/b/ file"],
    ["mktemp", "mktemp -d"],
    ["python3", "python3 script.py"],
  ])("reports %s", (_name, line) => {
    const problems = findProblems(`first line\n${line}\n`);
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(2);
  });

  it("accepts portable text", () => {
    expect(
      findProblems(
        "Run `npm run dev` and `node scripts/agents/port.mjs 5190`.\nUse a path like `packages/web/src`, or `~/.claude/CLAUDE.md`.\n",
      ),
    ).toEqual([]);
  });

  it("does not match a longer word", () => {
    expect(findProblems("the pgrepper and a lsofa and /tmpfile")).toEqual([]);
  });
});

describe("isChecked", () => {
  it.each([
    "scripts/agents/sync.mjs",
    ".claude/skills/land-pr/SKILL.md",
    ".claude/agents/implementer.md",
    "docs/guides/working-with-agents.md",
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "lefthook.yml",
  ])("checks %s", (file) => {
    expect(isChecked(file)).toBe(true);
  });

  it.each([
    "scripts/portability-check.mjs",
    "packages/core/src/lint/portability.test.ts",
    "package-lock.json",
    "scripts/generateBasemapThumbnails.png",
    "README.md",
  ])("leaves out %s", (file) => {
    expect(isChecked(file)).toBe(false);
  });
});

describe("scripts/portability-check.mjs, run as a command", () => {
  it("passes on this repository", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
