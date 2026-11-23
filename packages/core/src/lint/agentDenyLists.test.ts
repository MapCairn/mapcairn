// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_APPROVAL_TEXTS,
  FORBIDDEN_NAMES,
  FORBIDDEN_NPM_COMMANDS,
  OTHER_PUBLISH_COMMANDS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const NAMES: string[] = FORBIDDEN_NAMES;
const COMMANDS: string[] = FORBIDDEN_NPM_COMMANDS;
const OTHERS: string[][] = OTHER_PUBLISH_COMMANDS;

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

/** Every way an agent might start a command that the lists have to stop. */
function npmCommands(name: string, withNpx: boolean): string[] {
  const direct = [
    `npm ${name}`,
    `npm ${name} @mapcairn/core --dry-run`,
    `npm -w packages/core ${name}`,
    `npm --workspace=core ${name} --tag next`,
  ];
  const throughNpx = [
    `npx npm ${name}`,
    `npx npm ${name} --tag next`,
    `npx -y npm ${name} --tag next`,
  ];
  return withNpx ? [...direct, ...throughNpx] : direct;
}

/** A forbidden command through npx with a pinned or tagged npm. */
function pinnedNpx(name: string): string[] {
  return [
    `npx npm@11 ${name}`,
    `npx npm@latest ${name} --tag next`,
    `npx -y npm@11.19.1 ${name}`,
    `npx --yes npm@latest ${name} @mapcairn/core`,
  ];
}

/** The ways to start npm itself that a deny list for Claude Code has to cover. */
const NPM_LAUNCHERS = [
  "npm",
  "npm -w packages/core",
  "npx npm",
  "npx -y npm",
  "npx npm@11",
  "npx --yes npm@latest",
  "corepack npm",
];

/** Publishes started through another launcher, a workspace runner or a pinned npx. */
const LAUNCHED_PUBLISH = [
  ...pinnedNpx("publish"),
  "pnpm -r publish",
  "pnpm --recursive publish --no-git-checks",
  "pnpm --filter core publish",
  "pnpm exec npm publish",
  "pnpm dlx npm publish",
  "yarn workspaces foreach -A npm publish",
  "yarn --cwd pkg publish",
  "yarn dlx npm publish --tag next",
  "bunx npm publish",
  "bunx npm@latest publish --tag next",
  "corepack npm publish",
  "corepack pnpm publish",
  "corepack yarn npm publish",
];

/** Commands the lists must leave alone, so the release skill and the checks keep working. */
const ALLOWED_COMMANDS = [
  "npx npm@11 whoami",
  "npx npm@11 pack --dry-run",
  "npx --yes npm@latest view @mapcairn/core version",
  "bunx vitest run",
  "pnpm -r build",
  "pnpm run build",
  "yarn --cwd pkg build",
  "yarn install",
  "corepack enable",
  "corepack use pnpm@10",
  "npm pack --dry-run --json",
  "npm install",
  "npm ci --ignore-scripts",
  "npm run build",
  "npm whoami",
  "npm logout",
  "npm view @mapcairn/core version",
  "gh workflow run release.yml -f mode=rehearse",
  "gh run rerun 123 --failed",
  "gh run rerun 123",
  "gh pr merge 489 --squash",
  "gh api repos/MapCairn/mapcairn/pulls",
  "npx --no-install vitest run",
  "pnpm install",
];

const APPROVAL_COMMAND = `gh api repos/MapCairn/mapcairn/actions/runs/1/${DEPLOYMENT_APPROVAL_TEXTS[0]} -X POST`;

/**
 * Other ways to approve a deployment or to start the workflow's publish-existing
 * mode, which publishes. A rehearsal stays allowed (ALLOWED_COMMANDS).
 */
const RELEASE_GATE_COMMANDS = [
  `gh api graphql -f query='mutation { ${DEPLOYMENT_APPROVAL_TEXTS[1]}(input: {}) { clientMutationId } }'`,
  "gh workflow run release.yml -f version=0.1.0 -f mode=publish-existing",
  "gh workflow run release.yml --ref main -f mode=publish-existing -f version=0.1.0",
  "gh api repos/MapCairn/mapcairn/actions/workflows/release.yml/dispatches -f inputs[mode]=publish-existing",
  "gh api repos/MapCairn/mapcairn/actions/workflows/release.yml/dispatches --input inputs.json",
  "gh api -X POST repos/MapCairn/mapcairn/actions/runs/1/rerun",
  "gh api repos/MapCairn/mapcairn/actions/runs/1/rerun-failed-jobs -X POST",
];

/**
 * Whether a wildcard pattern matches a whole command. `*` matches any text.
 * With `bareEnds`, a trailing ` *` also matches the command without
 * arguments, but only when it is the pattern's only `*` (`npm publish *`, not
 * `npm * publish *`), as https://code.claude.com/docs/en/permissions says.
 */
function wildcardMatches(
  pattern: string,
  command: string,
  bareEnds: boolean,
): boolean {
  const escapeText = (text: string) =>
    text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const lone = pattern.split("*").length === 2 && pattern.endsWith(" *");
  const source =
    bareEnds && lone
      ? `${escapeText(pattern.slice(0, -2))}(?: .*)?`
      : pattern.split("*").map(escapeText).join(".*");
  return new RegExp(`^${source}$`).test(command);
}

/** Whether any rule of a list, taken as its inner pattern, matches the command. */
function listDenies(
  patterns: string[],
  command: string,
  bareEnds: boolean,
): boolean {
  return patterns.some((pattern) =>
    wildcardMatches(pattern, command, bareEnds),
  );
}

/** The patterns of `Tool(pattern)` rules for one tool name. */
function innerPatterns(rules: string[], tool: string): string[] {
  return rules
    .filter((rule) => rule.startsWith(`${tool}(`) && rule.endsWith(")"))
    .map((rule) => rule.slice(tool.length + 1, -1));
}

/** Whether a Cursor `Shell(base:arguments)` rule denies the command. */
function cursorDenies(rules: string[], command: string): boolean {
  const [base, ...rest] = command.split(" ");
  return innerPatterns(rules, "Shell").some((pattern) => {
    const [ruleBase, ruleArguments] = pattern.split(":");
    return (
      ruleBase === base &&
      ruleArguments !== undefined &&
      wildcardMatches(ruleArguments, rest.join(" "), false)
    );
  });
}

/** Whether a Codex `prefix_rule` with decision `forbidden` matches the start of the command. */
function codexDenies(text: string, command: string): boolean {
  const words = command.split(" ");
  const patterns = [...text.matchAll(/pattern = (\[.*\]),/g)].map(
    (match) => JSON.parse(match[1]) as (string | string[])[],
  );
  return patterns.some(
    (pattern) =>
      words.length >= pattern.length &&
      pattern.every((element, index) =>
        Array.isArray(element)
          ? element.includes(words[index])
          : element === words[index],
      ),
  );
}

describe("the commands an agent never runs", () => {
  it("name each command and every alias npm accepts for it", () => {
    expect(COMMANDS).toHaveLength(14);
    for (const command of ["profile", "org", "undeprecate"]) {
      expect(COMMANDS).toContain(command);
    }
    for (const alias of ["adduser", "add-user", "author", "dist-tags", "ogr"]) {
      expect(NAMES).toContain(alias);
    }
    for (const command of COMMANDS) {
      expect(NAMES).toContain(command);
    }
  });

  it("add the publish commands of the other package managers", () => {
    expect(OTHERS).toEqual([
      ["pnpm", "publish"],
      ["yarn", "publish"],
      ["yarn", "npm", "publish"],
      ["bun", "publish"],
    ]);
  });
});

describe("Claude Code, .claude/settings.json", () => {
  const rules = denyRules(".claude/settings.json");

  it.each(["Bash", "PowerShell"])(
    "denies every command in %s however it is started",
    (shell) => {
      const patterns = innerPatterns(rules, shell);
      for (const name of NAMES) {
        for (const command of npmCommands(name, false)) {
          expect(
            listDenies(patterns, command, true),
            `${shell}: ${command}`,
          ).toBe(true);
        }
      }
      expect(listDenies(patterns, APPROVAL_COMMAND, true)).toBe(true);
      for (const command of RELEASE_GATE_COMMANDS) {
        expect(listDenies(patterns, command, true), command).toBe(true);
      }
      for (const words of OTHERS) {
        expect(listDenies(patterns, words.join(" "), true)).toBe(true);
        expect(
          listDenies(patterns, `${words.join(" ")} --tag next`, true),
        ).toBe(true);
      }
    },
  );

  it("denies the commands through npx in Bash", () => {
    const patterns = innerPatterns(rules, "Bash");
    for (const name of COMMANDS) {
      for (const command of npmCommands(name, true)) {
        expect(listDenies(patterns, command, true), command).toBe(true);
      }
    }
  });

  it("denies a publish started through a pinned npx, another launcher or a workspace runner", () => {
    for (const shell of ["Bash", "PowerShell"]) {
      const patterns = innerPatterns(rules, shell);
      for (const command of LAUNCHED_PUBLISH) {
        expect(
          listDenies(patterns, command, true),
          `${shell}: ${command}`,
        ).toBe(true);
      }
    }
    const bash = innerPatterns(rules, "Bash");
    for (const name of NAMES) {
      for (const command of [...pinnedNpx(name), `corepack npm ${name}`]) {
        expect(listDenies(bash, command, true), command).toBe(true);
      }
    }
  });

  it("denies every command through every npm launcher in both shells, bare or with arguments", () => {
    const missing: string[] = [];
    for (const shell of ["Bash", "PowerShell"]) {
      const patterns = innerPatterns(rules, shell);
      for (const name of NAMES) {
        for (const launcher of NPM_LAUNCHERS) {
          for (const tail of ["", " @mapcairn/core --tag next"]) {
            const command = `${launcher} ${name}${tail}`;
            if (!listDenies(patterns, command, true)) {
              missing.push(`${shell}(${command})`);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("leaves the release skill's commands and the checks alone", () => {
    for (const shell of ["Bash", "PowerShell"]) {
      for (const command of ALLOWED_COMMANDS) {
        expect(
          listDenies(innerPatterns(rules, shell), command, true),
          command,
        ).toBe(false);
      }
    }
  });

  it("holds only a deny list and the reviewers' write guard, never a person's own permissions or an allowance for a release", () => {
    const settings = readJson(".claude/settings.json");
    expect(Object.keys(settings).sort()).toEqual(["hooks", "permissions"]);
    expect(settings.hooks).toEqual({
      PreToolUse: [
        {
          matcher: "Edit|Write|MultiEdit|NotebookEdit|Bash",
          hooks: [
            {
              type: "command",
              command:
                'node "$CLAUDE_PROJECT_DIR/scripts/agents/guardWrites.mjs"',
            },
          ],
        },
      ],
    });
    expect(Object.keys(settings.permissions as object)).toEqual(["deny"]);
    expect(rules.filter((rule) => rule.includes("release.yml"))).toEqual([]);
  });
});

describe("Qwen Code, .qwen/settings.json", () => {
  const rules = denyRules(".qwen/settings.json");
  const patterns = innerPatterns(rules, "Bash");

  it("denies every command, without relying on how a trailing wildcard treats a bare command", () => {
    for (const name of NAMES) {
      for (const command of npmCommands(name, COMMANDS.includes(name))) {
        expect(listDenies(patterns, command, false), command).toBe(true);
      }
    }
    expect(listDenies(patterns, APPROVAL_COMMAND, false)).toBe(true);
    for (const command of RELEASE_GATE_COMMANDS) {
      expect(listDenies(patterns, command, false), command).toBe(true);
    }
    for (const words of OTHERS) {
      expect(listDenies(patterns, words.join(" "), false)).toBe(true);
      expect(listDenies(patterns, `${words.join(" ")} --tag next`, false)).toBe(
        true,
      );
    }
  });

  it("denies a publish started through a pinned npx, another launcher or a workspace runner", () => {
    for (const command of LAUNCHED_PUBLISH) {
      expect(listDenies(patterns, command, false), command).toBe(true);
    }
    for (const name of NAMES) {
      for (const command of [...pinnedNpx(name), `corepack npm ${name}`]) {
        expect(listDenies(patterns, command, false), command).toBe(true);
      }
    }
  });

  it("leaves the release skill's commands and the checks alone, and holds only a deny list", () => {
    for (const command of ALLOWED_COMMANDS) {
      expect(listDenies(patterns, command, false), command).toBe(false);
    }
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
  const patterns = Object.keys(bash);

  it("denies every command, without relying on how a trailing wildcard treats a bare command", () => {
    for (const name of NAMES) {
      for (const command of npmCommands(name, COMMANDS.includes(name))) {
        expect(listDenies(patterns, command, false), command).toBe(true);
      }
    }
    expect(listDenies(patterns, APPROVAL_COMMAND, false)).toBe(true);
    for (const command of RELEASE_GATE_COMMANDS) {
      expect(listDenies(patterns, command, false), command).toBe(true);
    }
    for (const words of OTHERS) {
      expect(listDenies(patterns, words.join(" "), false)).toBe(true);
      expect(listDenies(patterns, `${words.join(" ")} --tag next`, false)).toBe(
        true,
      );
    }
  });

  it("denies a publish started through a pinned npx, another launcher or a workspace runner", () => {
    for (const command of LAUNCHED_PUBLISH) {
      expect(listDenies(patterns, command, false), command).toBe(true);
    }
    for (const name of NAMES) {
      for (const command of [...pinnedNpx(name), `corepack npm ${name}`]) {
        expect(listDenies(patterns, command, false), command).toBe(true);
      }
    }
  });

  it("leaves the release skill's commands and the checks alone", () => {
    for (const command of ALLOWED_COMMANDS) {
      expect(listDenies(patterns, command, false), command).toBe(false);
    }
  });

  it("denies and allows nothing else, so a person's own rules still apply", () => {
    expect(Object.keys(config.permission)).toEqual(["bash"]);
    expect(Object.values(bash).every((effect) => effect === "deny")).toBe(true);
  });
});

describe("Cursor command line, .cursor/cli.json", () => {
  const rules = denyRules(".cursor/cli.json");

  it("denies every command, the other package managers and the deployment approval", () => {
    for (const name of NAMES) {
      expect(cursorDenies(rules, `npm ${name} @mapcairn/core`)).toBe(true);
      expect(cursorDenies(rules, `npm ${name}`)).toBe(true);
    }
    for (const words of OTHERS) {
      expect(cursorDenies(rules, words.join(" "))).toBe(true);
    }
    expect(cursorDenies(rules, APPROVAL_COMMAND)).toBe(true);
    for (const command of RELEASE_GATE_COMMANDS) {
      expect(cursorDenies(rules, command), command).toBe(true);
    }
  });

  it("denies a publish started through a pinned npx, another launcher or a workspace runner", () => {
    for (const command of LAUNCHED_PUBLISH) {
      expect(cursorDenies(rules, command), command).toBe(true);
    }
    for (const name of NAMES) {
      for (const command of [...pinnedNpx(name), `corepack npm ${name}`]) {
        expect(cursorDenies(rules, command), command).toBe(true);
      }
    }
  });

  it("leaves the release skill's commands and the checks alone", () => {
    for (const command of ALLOWED_COMMANDS) {
      expect(cursorDenies(rules, command), command).toBe(false);
    }
  });
});

describe("Codex, .codex/rules/publish-guard.rules", () => {
  const text = read(".codex/rules/publish-guard.rules");

  it("forbids every command after npm, npx, npx -y, npx --yes and corepack", () => {
    for (const name of NAMES) {
      for (const program of [
        "npm",
        "npx npm",
        "npx -y npm",
        "npx --yes npm",
        "corepack npm",
      ]) {
        expect(
          codexDenies(text, `${program} ${name} @mapcairn/core`),
          `${program} ${name}`,
        ).toBe(true);
      }
    }
    for (const words of OTHERS) {
      expect(codexDenies(text, `${words.join(" ")} --tag next`)).toBe(true);
    }
  });

  it("forbids a publish through a pinned npx, a workspace runner, bunx and corepack", () => {
    const exact = [
      "npx npm@latest publish",
      "npx npm@11 login --registry x",
      "npx -y npm@latest publish",
      "npx --yes npm@next dist-tag add x latest",
      "pnpm -r publish",
      "pnpm --recursive publish",
      "pnpm dlx npm publish",
      "pnpm exec npm publish",
      "yarn dlx npm publish",
      "bunx npm publish",
      "bunx npm@latest publish",
      "corepack npm publish",
      "corepack pnpm publish",
      "corepack yarn npm publish",
    ];
    for (const command of exact) {
      expect(codexDenies(text, command), command).toBe(true);
    }
  });

  it("leaves the release skill's commands and the checks alone", () => {
    for (const command of ALLOWED_COMMANDS) {
      expect(codexDenies(text, command), command).toBe(false);
    }
  });

  it("forbids, never prompts or allows", () => {
    const patterns = [...text.matchAll(/pattern = \[/g)];
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
