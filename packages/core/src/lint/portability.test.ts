// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findProblems,
  isChecked,
  isSystemSpecificScript,
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
    ["a forward-slash drive path", "open C:/Users/x"],
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

  it("ignores a segment of a web address", () => {
    expect(
      findProblems(
        "see https://example.com/home/page and http://a.test/Users/list",
      ),
    ).toEqual([]);
  });

  it("still reads the text around a web address", () => {
    expect(findProblems("https://example.com then lsof -i")).toHaveLength(1);
  });

  it("does not take a URL scheme for a drive", () => {
    expect(findProblems("ftp:/x and a:b")).toEqual([]);
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

describe("isSystemSpecificScript", () => {
  it.each([
    "scripts/run.sh",
    "scripts/agents/stop.ps1",
    "scripts/a.cmd",
    "scripts/a.bat",
    "scripts/tools/x.py",
  ])("refuses %s", (file) => {
    expect(isSystemSpecificScript(file)).toBe(true);
  });

  it.each(["scripts/a.mjs", "docs/run.sh", "scripts/shell.md"])(
    "allows %s",
    (file) => {
      expect(isSystemSpecificScript(file)).toBe(false);
    },
  );
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

describe("scripts/portability-check.mjs in a small repository", () => {
  const git = (cwd: string, ...args: string[]) =>
    spawnSync("git", args, { cwd, timeout: CHILD_TIMEOUT_MS });
  const check = (cwd: string) =>
    spawnSync(process.execPath, [SCRIPT], {
      cwd,
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });

  function repository(): string {
    const root = mkdtempSync(path.join(tmpdir(), "mapcairn-portability-"));
    git(root, "init", "-q");
    mkdirSync(path.join(root, "scripts"));
    return root;
  }

  it("skips a tracked file that is missing from the working tree", () => {
    const root = repository();
    try {
      writeFileSync(path.join(root, "AGENTS.md"), "cd /Users/x\n");
      git(root, "add", "-A");
      rmSync(path.join(root, "AGENTS.md"));
      const result = check(root);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on a shell script under scripts/ and on a bad line", () => {
    const root = repository();
    try {
      writeFileSync(path.join(root, "scripts", "run.sh"), "echo hi\n");
      writeFileSync(path.join(root, "AGENTS.md"), "ok\ncd /Users/x\n");
      git(root, "add", "-A");
      const result = check(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("scripts/run.sh: use a Node script");
      expect(result.stderr).toContain("AGENTS.md:2: a macOS home path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
