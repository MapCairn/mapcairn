// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_APPROVAL_TEXT,
  FORBIDDEN_NAMES,
  FORBIDDEN_NPM_COMMANDS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const NAMES: string[] = FORBIDDEN_NAMES;
const COMMANDS: string[] = FORBIDDEN_NPM_COMMANDS;
const APPROVAL = `gh api *${DEPLOYMENT_APPROVAL_TEXT}*`;

/** Spawning git can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(read(file)) as Record<string, unknown>;
}

/** The deny rules of a settings file with `permissions.deny`. */
function denyRules(file: string): string[] {
  const settings = readJson(file) as { permissions: { deny: string[] } };
  return settings.permissions.deny;
}

describe("the commands an agent never runs", () => {
  it("name each command and every alias npm accepts for it", () => {
    expect(COMMANDS).toHaveLength(11);
    for (const alias of ["adduser", "add-user", "author", "dist-tags"]) {
      expect(NAMES).toContain(alias);
    }
    for (const command of COMMANDS) {
      expect(NAMES).toContain(command);
    }
  });
});

describe("Claude Code, .claude/settings.json", () => {
  const rules = denyRules(".claude/settings.json");

  it.each(["Bash", "PowerShell"])(
    "denies every command in %s, with and without an option before it",
    (shell) => {
      for (const name of NAMES) {
        expect(rules).toContain(`${shell}(npm ${name} *)`);
        expect(rules).toContain(`${shell}(npm * ${name} *)`);
      }
      expect(rules).toContain(`${shell}(${APPROVAL})`);
    },
  );

  it("denies the commands through npx", () => {
    for (const command of COMMANDS) {
      expect(rules).toContain(`Bash(npx * npm ${command} *)`);
    }
  });

  it("holds only a deny list, never a person's own permissions or an allowance for a release", () => {
    const settings = readJson(".claude/settings.json");
    expect(Object.keys(settings)).toEqual(["permissions"]);
    expect(Object.keys(settings.permissions as object)).toEqual(["deny"]);
    expect(rules.filter((rule) => rule.includes("release.yml"))).toEqual([]);
  });
});

describe("Qwen Code, .qwen/settings.json", () => {
  const rules = denyRules(".qwen/settings.json");

  it("denies every command, with and without arguments or an option before it", () => {
    for (const name of NAMES) {
      expect(rules).toContain(`Bash(npm ${name})`);
      expect(rules).toContain(`Bash(npm ${name} *)`);
      expect(rules).toContain(`Bash(npm * ${name} *)`);
    }
    for (const command of COMMANDS) {
      expect(rules).toContain(`Bash(npx * npm ${command} *)`);
    }
    expect(rules).toContain(`Bash(${APPROVAL})`);
  });

  it("holds only a deny list", () => {
    expect(Object.keys(readJson(".qwen/settings.json"))).toEqual([
      "permissions",
    ]);
  });
});

describe("opencode, opencode.json", () => {
  const config = readJson("opencode.json") as {
    permission: { bash: Record<string, string> };
  };
  const bash = config.permission.bash;

  it("denies every command, bare, with arguments and with an option before it", () => {
    for (const name of NAMES) {
      for (const pattern of [
        `npm ${name}`,
        `npm ${name} *`,
        `npm * ${name}`,
        `npm * ${name} *`,
      ]) {
        expect(bash[pattern]).toBe("deny");
      }
    }
    for (const command of COMMANDS) {
      expect(bash[`npx * npm ${command} *`]).toBe("deny");
    }
    expect(bash[APPROVAL]).toBe("deny");
  });

  it("denies and allows nothing else, so a person's own rules still apply", () => {
    expect(Object.keys(config.permission)).toEqual(["bash"]);
    expect(Object.values(bash).every((effect) => effect === "deny")).toBe(true);
  });
});

describe("Cursor command line, .cursor/cli.json", () => {
  const rules = denyRules(".cursor/cli.json");

  it("denies every command and the deployment approval", () => {
    for (const name of NAMES) {
      expect(rules).toContain(`Shell(npm:${name}*)`);
    }
    expect(rules).toContain(`Shell(gh:api*${DEPLOYMENT_APPROVAL_TEXT}*)`);
  });
});

describe("Codex, .codex/rules/publish-guard.rules", () => {
  const text = read(".codex/rules/publish-guard.rules");
  const patterns = [...text.matchAll(/pattern = \[(.*)\],/g)].map(
    (match) => match[1],
  );

  it("forbids every command after npm, and after npx and corepack", () => {
    const programs = [
      '"npm"',
      '"npx", "npm"',
      '"npx", "-y", "npm"',
      '"npx", "--yes", "npm"',
      '"corepack", "npm"',
    ];
    for (const program of programs) {
      const pattern = patterns.find((candidate) =>
        candidate.startsWith(`${program}, [`),
      );
      expect(pattern, program).toBeDefined();
      for (const name of NAMES) {
        expect(pattern).toContain(`"${name}"`);
      }
    }
  });

  it("forbids, never prompts or allows", () => {
    const decisions = [...text.matchAll(/decision = "(\w+)"/g)].map(
      (match) => match[1],
    );
    expect(decisions.length).toBe(patterns.length);
    expect(new Set(decisions)).toEqual(new Set(["forbidden"]));
  });
});

describe("a person's own settings", () => {
  it(
    "keeps .claude/settings.local.json out of the repository",
    () => {
      const ignored = spawnSync(
        "git",
        ["check-ignore", "-q", ".claude/settings.local.json"],
        { cwd: REPO },
      );
      expect(ignored.status).toBe(0);
      const tracked = spawnSync(
        "git",
        ["ls-files", "--error-unmatch", ".claude/settings.local.json"],
        { cwd: REPO },
      );
      expect(tracked.status).not.toBe(0);
    },
    CHILD_TIMEOUT_MS,
  );

  it("is not needed: every list above is complete in the committed file", () => {
    expect(denyRules(".claude/settings.json").length).toBeGreaterThan(
      NAMES.length,
    );
  });
});

describe("the guide", () => {
  const guide = read("docs/guides/working-with-agents.md");

  it.each([
    "Claude Code",
    "opencode",
    "Codex",
    "Qwen Code",
    "GitHub Copilot",
    "Cursor",
    "Antigravity",
  ])("says what %s can and cannot enforce", (tool) => {
    const start = guide.indexOf("## Keeping agents from publishing");
    expect(start).toBeGreaterThan(-1);
    const section = guide.slice(start, guide.indexOf("\n## ", start + 1));
    expect(section).toContain(tool);
  });
});
