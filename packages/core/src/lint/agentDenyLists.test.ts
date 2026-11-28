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

/** Ways npm runs itself or takes a global flag before the command. */
const WRAPPED_NPM_LAUNCHERS = [
  "npm exec npm",
  "npm exec -- npm",
  "npm x npm",
  "npm --json",
  "npm --prefix=.",
  "npm -w x",
  "npm -C dir",
  "npm explore pkg -- npm",
  "npm explore pkg npm",
  "npx npm",
  "npx -y npm",
  "npx --yes npm",
];

/**
 * Read-only registry queries whose field name is also a command name
 * (`dist-tags`, `author`). Claude Code's list must not deny them.
 */
const REGISTRY_QUERIES = [
  "npm view @mapcairn/core dist-tags --json",
  "npm view @mapcairn/core author",
  "npm view @mapcairn/core time --json",
  "npm view @mapcairn/core version peerDependencies license --json",
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

/** The one command Claude Code asks about instead of denying. */
const ASKED_NAME = "publish";

/** The commands Claude Code still denies. */
const CLAUDE_DENIED_NAMES = NAMES.filter((name) => name !== ASKED_NAME);

/** Publish commands of the release guide and other forms that have to prompt. */
const ASKED_PUBLISH = [
  "npm publish mapcairn-core-0.1.0-rc.1.tgz --access public --tag next",
  "npm publish /tmp/mapcairn-sdk-0.3.0.tgz --access public --provenance",
  ...LAUNCHED_PUBLISH,
  ...OTHERS.flatMap((words) => [
    words.join(" "),
    `${words.join(" ")} --tag next`,
  ]),
];

/** Approving a deployment: asked, each time. */
const ASKED_APPROVALS = [
  APPROVAL_COMMAND,
  `gh api graphql -f query='mutation { ${DEPLOYMENT_APPROVAL_TEXTS[1]}(input: {}) { clientMutationId } }'`,
];

/** Starting a publishing run another way, which stays denied. */
const DENIED_GATE_COMMANDS = RELEASE_GATE_COMMANDS.filter(
  (command) => !ASKED_APPROVALS.includes(command),
);

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
  const askRules =
    (
      readJson(".claude/settings.json") as {
        permissions: { ask?: string[] };
      }
    ).permissions.ask ?? [];

  /** The commands of a list that no rule matches. */
  function unmatched(from: string[], shell: string, commands: string[]) {
    const patterns = innerPatterns(from, shell);
    return commands.filter((command) => !listDenies(patterns, command, true));
  }

  /** The commands of a list that some rule matches. */
  function matched(from: string[], shell: string, commands: string[]) {
    const patterns = innerPatterns(from, shell);
    return commands.filter((command) => listDenies(patterns, command, true));
  }

  /** Every command with one npm name, through every launcher and wrapper. */
  function throughEveryLauncher(name: string): string[] {
    return [...NPM_LAUNCHERS, ...WRAPPED_NPM_LAUNCHERS].flatMap((launcher) =>
      ["", " @mapcairn/core --tag next"].map(
        (tail) => `${launcher} ${name}${tail}`,
      ),
    );
  }

  const asked = [...throughEveryLauncher(ASKED_NAME), ...ASKED_PUBLISH];

  it.each(["Bash", "PowerShell"])(
    "asks before a publish in %s however it is started, and before an approval",
    (shell) => {
      expect(
        unmatched(askRules, shell, [...asked, ...ASKED_APPROVALS]),
      ).toEqual([]);
    },
  );

  it.each(["Bash", "PowerShell"])(
    "has no deny rule in %s that would beat one of those prompts",
    (shell) => {
      expect(matched(rules, shell, [...asked, ...ASKED_APPROVALS])).toEqual([]);
    },
  );

  it.each(["Bash", "PowerShell"])(
    "denies every other command in %s however it is started, bare or with arguments",
    (shell) => {
      const commands = CLAUDE_DENIED_NAMES.flatMap(throughEveryLauncher);
      expect(
        unmatched(rules, shell, [...commands, ...DENIED_GATE_COMMANDS]),
      ).toEqual([]);
    },
  );

  it("denies the other commands through npx and a pinned npx in Bash", () => {
    const commands = CLAUDE_DENIED_NAMES.flatMap((name) => [
      ...(COMMANDS.includes(name) ? npmCommands(name, true) : []),
      ...pinnedNpx(name),
      `corepack npm ${name}`,
    ]);
    expect(unmatched(rules, "Bash", commands)).toEqual([]);
  });

  it.each(["Bash", "PowerShell"])(
    "denies a staged publish in %s through another launcher, whose publish rules would otherwise only ask",
    (shell) => {
      const staged = [
        "pnpm",
        "pnpm -r",
        "pnpm exec npm",
        "pnpm dlx npm",
        "yarn",
        "yarn npm",
        "yarn dlx npm",
        "bun",
        "bun x npm",
        "bunx npm",
        "bunx npm@latest",
      ].flatMap((launcher) => [
        `${launcher} stage publish`,
        `${launcher} stage publish --tag next`,
      ]);
      expect(unmatched(rules, shell, staged)).toEqual([]);
    },
  );

  it("asks about nothing but a publish and a deployment approval", () => {
    for (const shell of ["Bash", "PowerShell"]) {
      const others = [
        ...CLAUDE_DENIED_NAMES.map((name) => `npm ${name} @mapcairn/core`),
        ...ALLOWED_COMMANDS,
        ...REGISTRY_QUERIES,
        ...DENIED_GATE_COMMANDS,
      ];
      expect(matched(askRules, shell, others)).toEqual([]);
    }
    for (const rule of askRules) {
      expect(rule).toMatch(
        /[ (]publish( \*)?\)$|pending_deployments|approveDeployments/,
      );
      expect(rule).not.toContain("publish-existing");
    }
  });

  it("leaves the release skill's commands and the checks alone", () => {
    for (const shell of ["Bash", "PowerShell"]) {
      expect(
        matched(rules, shell, [...ALLOWED_COMMANDS, ...REGISTRY_QUERIES]),
      ).toEqual([]);
    }
  });

  it("holds only the publish rules and the reviewers' write guard, never a person's own permissions or an allowance for a release", () => {
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
    expect(Object.keys(settings.permissions as object).sort()).toEqual([
      "ask",
      "deny",
    ]);
    expect(
      [...rules, ...askRules].filter((rule) => rule.includes("release.yml")),
    ).toEqual([]);
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

  it("states the rules that hold under the maintainer's own gh login", () => {
    const start = guide.indexOf("## Keeping agents from publishing");
    const section = guide.slice(start, guide.indexOf("\n## ", start + 1));
    expect(section).toContain("the maintainer's own signed-in `gh` login");
    expect(section).toContain("never reads or prints a token");
    expect(section).toContain("never uses `--admin`");
    expect(section).toContain(
      "only after it asks the maintainer in the conversation and gets a yes for that deployment at that moment",
    );
    expect(section).toContain("one yes covers one deployment");
  });

  it("bans the gh auth commands, a hand publish and edits to who may publish, in the rules", () => {
    const start = guide.indexOf("## Keeping agents from publishing");
    const section = guide.slice(start, guide.indexOf("\n## ", start + 1));
    expect(section).toContain(
      "never runs `gh auth login`, `logout`, `switch`, `refresh`, `token` or `setup-git`",
    );
    expect(section).toContain("never publishes by hand");
    expect(section).toContain(
      "never edits an environment, a ruleset or a trusted publisher",
    );
  });

  it("says the npm reviewer stays recommended, and that rule-only paths are not residual", () => {
    const start = guide.indexOf("## Keeping agents from publishing");
    const section = guide.slice(start, guide.indexOf("\n## ", start + 1));
    expect(section).toContain("stays recommended");
    expect(section).toContain("release:check` blocks");
    expect(section).not.toMatch(/optional/);
    expect(section).toContain("rule-only");
    expect(section).toContain("`gh pr merge --admin`");
  });

  it("agrees with the release skill on the approval and the deny entries", () => {
    const agreed =
      "still refuse the call, so in those tools the maintainer runs it or changes their own settings";
    const prompts = "Claude Code prompts for the call";
    const skill = read(".claude/skills/release/SKILL.md");
    expect(guide).toContain(agreed);
    expect(skill).toContain(agreed);
    expect(guide).toContain(prompts);
    expect(skill).toContain(prompts);
    expect(skill).toContain("never reword the call");
    const tools = "the committed deny entries (opencode, Qwen Code, Cursor)";
    expect(guide.toLowerCase()).toContain(tools.toLowerCase());
    expect(skill.toLowerCase()).toContain(tools.toLowerCase());
    expect(guide).not.toContain("env -u");
    expect(skill).not.toContain("env -u");
  });

  it("no longer describes a limited token or forbids unsetting an environment variable", () => {
    expect(guide).not.toMatch(/GH_TOKEN/);
    expect(guide).not.toContain(
      "Running agents under a limited GitHub identity",
    );
    expect(guide).not.toContain("limited fine-grained");
    expect(read("docs/guides/releasing.md")).not.toMatch(
      /GH_TOKEN|limited GitHub identity/,
    );
  });
});

describe("the release documents agree on approvals and the reviewer", () => {
  const skill = read(".claude/skills/release/SKILL.md");
  const releasing = read("docs/guides/releasing.md");
  const plan = read("docs/plans/0014-sdk-release.md");
  const threshold =
    "once any SDK package is on npm (or the registry cannot be read)";

  it("states the reviewer threshold as release:check applies it", () => {
    for (const text of [skill, releasing, plan]) {
      expect(text).toContain(threshold);
      expect(text).not.toMatch(
        /once every SDK package is on npm|when all four packages are on npm/,
      );
    }
  });

  it("allows an approval only after a yes for that deployment", () => {
    const yes =
      "only after it asks the maintainer in the conversation and gets a yes for that deployment; one yes covers one deployment (the question names the run and the version)";
    expect(releasing).toContain(yes);
    expect(plan).toContain(yes);
    expect(skill).toContain("without the maintainer's yes for that deployment");
  });

  it("lists the environment edit and --admin as rule-only in the plan, not as residual", () => {
    expect(plan).toContain("are rule-only");
    expect(plan).not.toContain("an environment edit by an administrator token");
    expect(plan).not.toContain("a notice from `npm run release:check`");
  });
});

describe("the release skill's identity check", () => {
  const skill = read(".claude/skills/release/SKILL.md");

  it("checks that gh is signed in with write access and that the agent asks before approving", () => {
    expect(skill).not.toMatch(
      /GH_TOKEN|limited token|administrator login is active/,
    );
    expect(skill).toContain("`gh` is signed in");
    expect(skill).toContain("you ask first (one yes covers one deployment)");
    expect(skill).toContain(
      "You never read or print a token, run `gh auth` commands, use `--admin` or publish by hand",
    );
    expect(skill).toContain(
      "Approve a deployment (`pending_deployments`) only after you ask the maintainer in the conversation and get a yes for that deployment at that moment",
    );
  });
});
