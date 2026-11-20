// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWLIST_FILE,
  lex,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/guardAllowlist.mjs";
import {
  decide,
  READ_ONLY_AGENTS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/guardWrites.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const ROOT = "/home/dev/mapcairn";
const WORKTREE = `${ROOT}/.claude/worktrees/review-12`;
const SHA = "1a2b3c4d5e6f";
const REPO_OPTION = "--repo MapCairn/mapcairn";

interface Decision {
  allow: boolean;
  reason?: string;
}

/**
 * The `.git` files on the fake disk: the registered worktree `review-12`, and
 * folders that only look like one.
 */
const GIT_FILES: Record<string, string> = {
  [`${WORKTREE}/.git`]: `gitdir: ${ROOT}/.git/worktrees/review-12\n`,
  [`${ROOT}/.claude/worktrees/relative/.git`]:
    "gitdir: ../../../.git/worktrees/relative\n",
  [`${ROOT}/.claude/worktrees/elsewhere/.git`]:
    "gitdir: /tmp/x/.git/worktrees/elsewhere\n",
  [`${ROOT}/.claude/worktrees/sibling/.git`]:
    "gitdir: /home/dev/othercairn/.git/worktrees/sibling\n",
  [`${ROOT}/.claude/worktrees/deeper/.git`]: `gitdir: ${ROOT}/.git/worktrees/a/b\n`,
  [`${ROOT}/.claude/worktrees/junk/.git`]: "not a gitfile\n",
};

function readText(file: string): string | undefined {
  return GIT_FILES[file];
}

function bash(
  command: string,
  agent = "fresh-eyes-reviewer",
  cwd = ROOT,
): Decision {
  return decide(
    {
      tool_name: "Bash",
      tool_input: { command },
      cwd,
      agent_type: agent,
    },
    {
      projectDir: ROOT,
      platform: "linux",
      realpath: (p: string) => p,
      tempDirs: ["/tmp"],
      readText,
    },
  );
}

const OTHER_REVIEWERS = (READ_ONLY_AGENTS as string[]).filter(
  (agent) => agent !== "test-reviewer",
);

/** Commands every guarded reviewer may run, from the project folder. */
const FOR_EVERY_REVIEWER = [
  `gh pr view 12 ${REPO_OPTION}`,
  `gh pr view 12 ${REPO_OPTION} --comments --json title,body,files`,
  `gh pr view 12 -R MapCairn/mapcairn`,
  `gh pr diff 12 ${REPO_OPTION}`,
  `gh pr diff 12 ${REPO_OPTION} --name-only`,
  `gh pr diff 12 ${REPO_OPTION} --patch --color=never`,
  `gh pr checks 12 ${REPO_OPTION}`,
  `gh pr checks 12 ${REPO_OPTION} --required --json name,state`,
  `gh issue view 561 ${REPO_OPTION}`,
  `gh issue view 561 ${REPO_OPTION} --comments`,
  `gh api 'repos/MapCairn/mapcairn/contents/AGENTS.md?ref=${SHA}'`,
  `gh api 'repos/MapCairn/mapcairn/contents/packages/core/src/index.ts?ref=${SHA}'`,
  `git show ${SHA}:packages/core/src/index.ts`,
  "git show FETCH_HEAD:AGENTS.md",
  "git show --stat HEAD",
  "git show 'HEAD~1:AGENTS.md'",
  "git show --format=%H%n%s --no-patch HEAD",
  "git log --oneline -n 20 origin/main..HEAD",
  "git log -5 --format=%h%x20%s -- scripts/agents",
  'git log "origin/main" --since=2026-11-01 --author=dev',
  "git diff --stat origin/main...HEAD",
  `git diff -U0 origin/main ${SHA} -- docs/guides/working-with-agents.md`,
  "git diff --name-only origin/main",
  "git fetch origin pull/12/head",
  "git fetch upstream main",
  "git fetch --quiet origin",
  "git rev-parse FETCH_HEAD",
  "git rev-parse --show-toplevel",
  `git merge-base origin/main ${SHA}`,
  "git status --short",
  "git status -sb",
  "git ls-files scripts/agents",
  "git blame -L 10,20 scripts/agents/guardWrites.mjs",
  "git worktree list",
  "grep -rn 'write guard' docs",
  "grep -rn --include='*.md' -e guardWrites docs AGENTS.md",
  "rg -n --hidden guardWrites scripts",
  "rg -n -g '*.mjs' -e 'node -e' scripts",
  "node scripts/agents/thread.mjs issue 561",
  "node scripts/agents/thread.mjs pr 12",
  `node scripts/agents/docs-refs.mjs --ref ${SHA} docs/guides/working-with-agents.md AGENTS.md`,
  "node scripts/agents/docs-refs.mjs --ref FETCH_HEAD README.md",
  "node scripts/agents/port.mjs 5173",
  "node ./scripts/agents/thread.mjs issue 561",
  `node ${ROOT}/scripts/agents/thread.mjs pr 12`,
  "  git status  ",
];

/** Commands only `test-reviewer` may run, with the folder they run in. */
const FOR_TEST_REVIEWER: [string, string][] = [
  [`git worktree add --detach .claude/worktrees/review-12 ${SHA}`, ROOT],
  [`git worktree add --detach ${WORKTREE} ${SHA}`, ROOT],
  ["git worktree remove .claude/worktrees/review-12", ROOT],
  [`cd ${WORKTREE} && npm ci --ignore-scripts`, ROOT],
  ["cd .claude/worktrees/review-12 && npm ci --ignore-scripts", ROOT],
  ["npm ci --ignore-scripts", WORKTREE],
  [
    `cd ${WORKTREE}/packages/core && npx --no-install vitest run src/a.test.ts`,
    ROOT,
  ],
  [
    `cd ${WORKTREE}/packages/core && npx --no-install vitest run --coverage --coverage.include=src/a.ts --coverage.reporter=text`,
    ROOT,
  ],
  ["npx --no-install vitest run src/a.test.ts", `${WORKTREE}/packages/core`],
  [
    `cd ${WORKTREE} && git restore --source=${SHA} -- packages/core/src/a.ts`,
    ROOT,
  ],
  [`cd ${WORKTREE} && git restore -- packages/core/src/a.ts`, ROOT],
  [`cd ${WORKTREE} && git status`, ROOT],
  [`cd ${WORKTREE} && git diff --stat`, ROOT],
];

describe("the reviewer allowlist", () => {
  it.each(FOR_EVERY_REVIEWER)("lets every reviewer run %s", (command) => {
    for (const agent of READ_ONLY_AGENTS as string[]) {
      expect(bash(command, agent), `${agent}: ${command}`).toEqual({
        allow: true,
      });
    }
  });

  it.each(FOR_TEST_REVIEWER)(
    "lets test-reviewer run %s, and no other reviewer",
    (command, cwd) => {
      expect(bash(command, "test-reviewer", cwd)).toEqual({ allow: true });
      for (const agent of OTHER_REVIEWERS) {
        expect(bash(command, agent, cwd).allow, agent).toBe(false);
      }
    },
  );

  it("never blocks an agent the guard does not cover", () => {
    for (const agent of ["implementer", "ui-verifier"]) {
      expect(bash("echo hi | tee x; node -e 1", agent).allow).toBe(true);
    }
  });

  it("says how to ask for a command that is not on the list", () => {
    const { allow, reason } = bash("echo hi");
    expect(allow).toBe(false);
    expect(reason).toContain(ALLOWLIST_FILE);
    expect(reason).toContain("the maintainer decides");
    expect(reason).toContain("Deviations");
  });
});

/** Refused for every reviewer, test-reviewer included. */
const REFUSED: [string, string[]][] = [
  [
    "shell syntax",
    [
      "",
      "   ",
      "git status; rm -rf /",
      "git log | head",
      "git log & rm x",
      "git status && git log",
      "git log || true",
      "git log > out.txt",
      "git log >> out.txt",
      "git log < x",
      "git log 2>&1",
      "cat <<EOF\nx\nEOF",
      "git log\nrm x",
      "git log \\\nx",
      "git log\tHEAD",
      "git log\rHEAD",
      "git log $(rm x)",
      "git log `rm x`",
      "git log ${X}",
      "git log $X",
      "(git log)",
      "{ git log; }",
      "git log ~/x",
      "git log ~",
      "git log HEAD~1",
      "git log *",
      "git log x?",
      "git log [ab]",
      "git log {a,b}",
      "git log ^HEAD",
      "git log # comment",
      "git log !1",
      "=git status",
      "git log =ls",
      "git log 'a''b'",
      "git log ''",
      'git log ""',
      "git log 'unclosed",
      'git log "unclosed',
      'git log "a$b"',
      'git log "a`id`"',
      'git log "a\\b"',
      'git log "a!b"',
      "git log $'a'",
      'git log $"a"',
      "git log ’x’",
      "git log x y",
      // Each of these passes grep's own checks, so only the strict reading refuses it.
      'grep -rn "$HOME" docs',
      'grep -rn "a`id`b" docs',
      "grep -rn '' docs",
      'grep -rn "" docs',
      "grep -rn x =ls",
      "grep -rn 'a''b' docs",
      "grep -rn x docs~",
      "grep -rn x 'docs'\"\"",
    ],
  ],
  [
    "bypasses found in the reviews of #558",
    [
      "echo `echo \\'`; rm -rf x",
      "ls *(e:'rm x':)",
      "ls *(e:rm:)",
      "echo ${(e)x}",
      "node -e 'require(1)'",
      "make -f - x",
      "declare -n r=GH_TOKEN",
      "local -n r=GH_TOKEN",
      "typeset -n r=GH_TOKEN",
      "read GH_TOKEN",
      "printf -v GH_TOKEN x",
      "mapfile GH_TOKEN",
      "getopts a GH_TOKEN",
      "for GH_TOKEN in x; do git log; done",
      "let 'a[$(id)]'",
      "(( a[$(id)] ))",
      "[[ a -eq b ]]",
      "trap 'rm x' EXIT",
      "alias git=rm",
      "hash -p /bin/rm git",
      "enable -f x y",
      'cat "1"<<EOF\nx\nEOF',
      "cat '1'<<'EOF'\nx\nEOF",
      "git log 1<<EOF\nx\nEOF",
    ],
  ],
  [
    "interpreters and wrappers",
    [
      "node -e 1",
      "node -p 1",
      "node --eval 1",
      "node --print 1",
      "node --require ./x scripts/agents/thread.mjs issue 1",
      "node --import ./x scripts/agents/thread.mjs issue 1",
      "node -r ./x scripts/agents/thread.mjs issue 1",
      "node --env-file=x scripts/agents/thread.mjs issue 1",
      "node scripts/agents/sync.mjs",
      "node /home/dev/other/scripts/agents/thread.mjs issue 1",
      "node .claude/worktrees/review-12/scripts/agents/thread.mjs issue 1",
      "node scripts/agents/thread.mjs issue 1 extra",
      "node scripts/agents/thread.mjs issue abc",
      "node scripts/agents/thread.mjs issue 0",
      "node scripts/agents/thread.mjs repo 1",
      "node scripts/agents/thread.mjs",
      "node scripts/agents/port.mjs",
      "node scripts/agents/port.mjs x",
      "node scripts/agents/docs-refs.mjs --ref --output=x a.md",
      "node scripts/agents/docs-refs.mjs --ref HEAD",
      "node scripts/agents/docs-refs.mjs --ref HEAD a.ts",
      "node scripts/agents/docs-refs.mjs --ref HEAD -x.md",
      "node",
      "make",
      "make -f x",
      "sh -c 'git log'",
      "bash -c 'git log'",
      "zsh -c 'git log'",
      "sh x.sh",
      "env git log",
      "env",
      "xargs rm",
      "find . -exec rm x",
      "find . -name x",
      "python3 -c 1",
      "perl -e 1",
      "eval git log",
      "source x",
      "exec git log",
      "command git log",
      "time git log",
      "timeout 5 git log",
      "nohup git log",
      "sudo git log",
      "echo hi",
      "cat AGENTS.md",
      "ls",
      "rm -rf x",
      "npx vitest run",
      "npx --no-install tsc",
      "npm run lint",
      "npm test",
      "npm exec vitest",
      "curl https://example.com",
    ],
  ],
  [
    "leading assignments and risky variables",
    [
      `GH_PAGER=x gh pr view 12 ${REPO_OPTION}`,
      `GH_TOKEN= gh pr view 12 ${REPO_OPTION}`,
      `BROWSER=x gh pr view 12 ${REPO_OPTION} --web`,
      "GIT_PAGER=x git log",
      "PAGER=x git log",
      "GIT_EXTERNAL_DIFF=x git diff",
      "NODE_OPTIONS=--require=x node scripts/agents/port.mjs 1",
      "X=1 git log",
      "export GH_PAGER=x",
      "unset GH_TOKEN",
    ],
  ],
  [
    "git",
    [
      "git",
      "git -c core.pager=x log",
      "git -c core.fsmonitor=x status",
      "git --config-env=core.pager=X log",
      "git --git-dir=x log",
      "git --work-tree=x status",
      "git --exec-path=x log",
      "git -p log",
      "git --paginate log",
      "git -C .claude/worktrees/review-12 status",
      "git config core.pager x",
      "git config --get user.email",
      "git log --output=/tmp/x",
      "git show --output=x HEAD",
      "git diff --output=x",
      "git diff --ext-diff",
      "git log -p --ext-diff",
      "git diff --textconv",
      "git show --textconv HEAD:x",
      "git log -O x",
      "git grep -O x",
      "git grep --open-files-in-pager x",
      "git log --exec=x",
      "git push",
      "git push origin HEAD",
      "git commit -m x",
      "git add .",
      "git stash",
      "git checkout x",
      "git checkout -- x",
      "git switch x",
      "git reset --hard",
      "git branch x",
      "git tag x",
      "git remote add x y",
      "git pull",
      "git merge x",
      "git fetch origin main:main",
      "git fetch origin +pull/1/head",
      "git fetch origin pull/1/head:refs/heads/main",
      "git fetch --upload-pack=x origin",
      "git fetch https://example.com/x",
      "git fetch evil",
      "git fetch origin --prune",
      "git fetch origin --tags",
      "git fetch origin pull/x/head",
      "git fetch origin a b",
      "git show -x",
      "git log -n x",
      "git log --format",
      "git diff -U x",
      "git rev-parse --git-path x",
      "git rev-parse --local-env-vars",
      "git blame -L x scripts/a.mjs",
      "git worktree add .claude/worktrees/review-12",
      "git worktree prune",
      "git restore x",
      "git restore --source=HEAD -- x",
      "git clean -fd",
      "git apply x.patch",
      "git am x",
      "git hook run x",
      "git difftool",
      "git mergetool",
      "git help log",
      "git log --pretty=format:%H --no-walk --output x",
    ],
  ],
  [
    "gh",
    [
      "gh",
      "gh pr view 12",
      "gh pr view 12 --repo other/repo",
      "gh pr view 12 --repo MapCairn/mapcairn2",
      `gh pr view 12 ${REPO_OPTION} --web`,
      `gh pr view 12 ${REPO_OPTION} --jq .title`,
      `gh pr view 12 ${REPO_OPTION} --json title --jq env.GH_TOKEN`,
      `gh pr view 12 ${REPO_OPTION} --template x`,
      `gh pr view 12 ${REPO_OPTION} --json 'title body'`,
      `gh pr view abc ${REPO_OPTION}`,
      `gh pr view 12 13 ${REPO_OPTION}`,
      `gh pr view ${REPO_OPTION}`,
      `gh pr checks 12 ${REPO_OPTION} --watch`,
      `gh pr diff 12 ${REPO_OPTION} --web`,
      `gh pr diff 12 ${REPO_OPTION} --color=x`,
      `gh pr comment 12 ${REPO_OPTION} --body x`,
      `gh pr review 12 ${REPO_OPTION} --approve`,
      `gh pr merge 12 ${REPO_OPTION}`,
      `gh pr checkout 12 ${REPO_OPTION}`,
      `gh pr list ${REPO_OPTION}`,
      `gh issue edit 12 ${REPO_OPTION} --add-label x`,
      `gh issue comment 12 ${REPO_OPTION} --body x`,
      `gh issue view 12 ${REPO_OPTION} --web`,
      "gh api -X POST repos/MapCairn/mapcairn/issues",
      "gh api --method POST repos/MapCairn/mapcairn/issues",
      "gh api repos/MapCairn/mapcairn/issues -f title=x",
      "gh api 'repos/MapCairn/mapcairn/contents/x?ref=1' -F a=b",
      "gh api 'repos/MapCairn/mapcairn/contents/x?ref=1' --input x",
      "gh api 'repos/MapCairn/mapcairn/contents/x?ref=1' --jq x",
      "gh api 'repos/MapCairn/mapcairn/contents/x?ref=1' --hostname x",
      "gh api graphql",
      "gh api user",
      "gh api repos/other/repo/contents/x",
      "gh api 'repos/MapCairn/mapcairn/contents/../../x?ref=1'",
      "gh api 'repos/MapCairn/mapcairn/contents/x?ref=1&a=b'",
      "gh api repos/MapCairn/mapcairn/contents/x",
      "gh auth token",
      "gh auth status",
      "gh alias set x y",
      "gh extension install x",
      "gh run rerun 1",
      "gh workflow run x",
      "gh repo view",
      "gh config set pager x",
    ],
  ],
  [
    "grep and rg",
    [
      "grep x",
      "grep -r x",
      "grep -f x y",
      "grep --devices=read x y",
      "grep -P x y",
      "rg x",
      "rg --pre cat x .",
      "rg --pre=cat x .",
      "rg --pre-glob '*' x .",
      "rg -z x .",
      "rg --search-zip x .",
      "rg --hostname-bin=x y .",
      "rg --hostname-bin x y .",
      "rg --ignore-file x y .",
      "rg -nz x .",
    ],
  ],
];

describe("what the allowlist refuses", () => {
  for (const [kind, commands] of REFUSED) {
    it.each(commands)(`refuses ${kind}: %j`, (command) => {
      for (const agent of READ_ONLY_AGENTS as string[]) {
        expect(bash(command, agent).allow, agent).toBe(false);
      }
    });
  }

  it.each([
    ["the cd form for another reviewer", `cd ${WORKTREE} && git status`],
    ["vitest for another reviewer", "npx --no-install vitest run x"],
  ])("refuses %s", (_name, command) => {
    for (const agent of OTHER_REVIEWERS) {
      expect(bash(command, agent, WORKTREE).allow, agent).toBe(false);
    }
  });

  it.each([
    ["vitest outside a worktree", "npx --no-install vitest run x", ROOT],
    ["vitest without --no-install", "npx vitest run x", WORKTREE],
    [
      "vitest with a config",
      "npx --no-install vitest run --config x",
      WORKTREE,
    ],
    ["vitest with a root", "npx --no-install vitest run --root /x", WORKTREE],
    ["vitest without run", "npx --no-install vitest", WORKTREE],
    ["npm ci outside a worktree", "npm ci --ignore-scripts", ROOT],
    ["npm ci with scripts", "npm ci", WORKTREE],
    ["npm install with a name", "npm install x --ignore-scripts", WORKTREE],
    ["npm ci --prefix", "npm ci --ignore-scripts --prefix /x", WORKTREE],
    ["cd outside a worktree", `cd ${ROOT} && git status`, ROOT],
    [
      "cd into the worktrees folder",
      `cd ${ROOT}/.claude/worktrees && git status`,
      ROOT,
    ],
    ["cd with a variable", "cd $HOME && git status", ROOT],
    ["cd with no command", `cd ${WORKTREE}`, ROOT],
    ["cd with an option", `cd -P ${WORKTREE} && git status`, ROOT],
    ["two cd forms", `cd ${WORKTREE} && cd x && git status`, ROOT],
    ["git restore outside a worktree", "git restore -- x", ROOT],
    [
      "git restore of a path outside the worktree",
      `cd ${WORKTREE} && git restore -- ${ROOT}/AGENTS.md`,
      ROOT,
    ],
    [
      "git restore of a parent path",
      `cd ${WORKTREE} && git restore -- ../../../AGENTS.md`,
      ROOT,
    ],
    [
      "a worktree outside .claude/worktrees",
      `git worktree add --detach /tmp/x ${SHA}`,
      ROOT,
    ],
    [
      "a worktree that is the worktrees folder",
      `git worktree add --detach .claude/worktrees ${SHA}`,
      ROOT,
    ],
    [
      "a worktree below another worktree",
      `git worktree add --detach .claude/worktrees/a/b ${SHA}`,
      ROOT,
    ],
    [
      "a worktree with a branch",
      `git worktree add --detach -b x .claude/worktrees/x ${SHA}`,
      ROOT,
    ],
    [
      "a worktree removed by force",
      "git worktree remove --force .claude/worktrees/x",
      ROOT,
    ],
    [
      "a worktree added from inside a worktree",
      `git worktree add --detach .claude/worktrees/x ${SHA}`,
      WORKTREE,
    ],
    [
      "a project script run from a worktree",
      "node scripts/agents/thread.mjs pr 12",
      WORKTREE,
    ],
  ])("refuses %s for test-reviewer", (_name, command, cwd) => {
    expect(bash(command, "test-reviewer", cwd).allow).toBe(false);
  });

  describe("a folder under .claude/worktrees that is not a registered worktree", () => {
    const folders = [
      ["a plain folder a reviewer wrote", "plain"],
      ["a gitfile that points outside the project", "elsewhere"],
      ["a gitfile that points at another project's records", "sibling"],
      ["a gitfile that points below a worktree record", "deeper"],
      ["a .git that is not a gitfile", "junk"],
    ];
    it.each(folders)("refuses the cd form in %s", (_name, folder) => {
      const tree = `${ROOT}/.claude/worktrees/${folder}`;
      for (const command of [
        `cd ${tree} && git status`,
        `cd ${tree} && git restore -- a.ts`,
        `cd ${tree} && npm ci --ignore-scripts`,
        `cd ${tree}/packages/core && npx --no-install vitest run src/a.test.ts`,
      ]) {
        expect(bash(command, "test-reviewer").allow, command).toBe(false);
      }
    });

    it.each(folders)(
      "refuses worktree commands run from %s",
      (_name, folder) => {
        const tree = `${ROOT}/.claude/worktrees/${folder}`;
        for (const command of [
          "git restore -- a.ts",
          "npm ci --ignore-scripts",
          "npx --no-install vitest run src/a.test.ts",
        ]) {
          expect(bash(command, "test-reviewer", tree).allow, command).toBe(
            false,
          );
        }
      },
    );

    it("reads the .git file on disk when no reader is given", () => {
      const root = realpathSync(mkdtempSync(path.join(tmpdir(), "guard-")));
      try {
        const zone = path.join(root, ".claude", "worktrees");
        mkdirSync(path.join(zone, "real"), { recursive: true });
        mkdirSync(path.join(zone, "cloned", ".git"), { recursive: true });
        writeFileSync(
          path.join(zone, "real", ".git"),
          `gitdir: ${path.join(root, ".git", "worktrees", "real")}\n`,
        );
        const run = (folder: string) =>
          decide(
            {
              tool_name: "Bash",
              tool_input: { command: "npm ci --ignore-scripts" },
              cwd: path.join(zone, folder),
              agent_type: "test-reviewer",
            },
            { projectDir: root },
          ).allow;
        expect(run("real")).toBe(true);
        expect(run("cloned")).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("accepts a gitfile with a relative gitdir into the project's records", () => {
      const tree = `${ROOT}/.claude/worktrees/relative`;
      expect(bash(`cd ${tree} && git status`, "test-reviewer").allow).toBe(
        true,
      );
    });
  });

  it.each([
    `git restore --source=${SHA} -- :/scripts/agents/guardAllowlist.mjs`,
    "git restore -- ':(top)AGENTS.md'",
    "git restore :/AGENTS.md",
    "git restore -- ':!x'",
  ])("refuses pathspec magic in git restore: %s", (rest) => {
    expect(bash(`cd ${WORKTREE} && ${rest}`, "test-reviewer").allow).toBe(
      false,
    );
  });

  it.each([
    "git show --pretty --textconv HEAD:x",
    "git log --format --output=x",
    "git log --pretty --ext-diff",
    "git diff -U --ext-diff",
    "git diff --unified --textconv",
    "git diff --unified 3",
    "git log -U 3",
    "git log -n --output=x",
    "git log --author --output=x",
    "grep -e -x docs",
    `gh pr view 12 ${REPO_OPTION} --json --web`,
    "rg -g --pre=cat x .",
  ])("refuses an option whose value is another option: %s", (command) => {
    expect(bash(command).allow).toBe(false);
  });

  it.each([
    "git log --pretty=oneline",
    "git diff --unified=3",
    "git diff -U3",
    "git log -n 5 --author dev",
  ])("still takes %s", (command) => {
    expect(bash(command)).toEqual({ allow: true });
  });

  it("refuses a command that is too long", () => {
    expect(bash(`git log ${"a".repeat(5000)}`).allow).toBe(false);
  });

  it("refuses a project script when the working folder is not known", () => {
    expect(
      bash("node scripts/agents/port.mjs 1", "lean-reviewer", "").allow,
    ).toBe(false);
  });

  it("runs the project's own copy of a script from a worktree, never the worktree's", () => {
    for (const agent of READ_ONLY_AGENTS as string[]) {
      const own = `node ${ROOT}/scripts/agents/thread.mjs pr 12`;
      expect(bash(own, agent, WORKTREE), agent).toEqual({ allow: true });
      const theirs = `node ${WORKTREE}/scripts/agents/thread.mjs pr 12`;
      expect(bash(theirs, agent, WORKTREE).allow, agent).toBe(false);
      const relative = "node scripts/agents/thread.mjs pr 12";
      expect(bash(relative, agent, WORKTREE).allow, agent).toBe(false);
    }
  });
});

describe("the strict reading of a command", () => {
  it("joins quoted and plain parts of one word, and keeps && apart", () => {
    expect(lex(`cd 'a b' && grep -e "x y" --include='*.md' docs`)).toEqual({
      lexemes: [
        { word: "cd" },
        { word: "a b" },
        { op: "&&" },
        { word: "grep" },
        { word: "-e" },
        { word: "x y" },
        { word: "--include=*.md" },
        { word: "docs" },
      ],
    });
  });

  it.each([
    ["=ls", /`=`/],
    ["x ''", /empty quotes/],
    ['x ""', /empty quotes/],
    ["x 'a''b'", /side by side/],
    ['x "a$b"', /`\$` inside " quotes/],
    ['x "a`b`"', /inside " quotes/],
    ['x "a\\b"', /inside " quotes/],
    ['x "a!b"', /inside " quotes/],
    ["x 'a\nb'", /U\+000A inside ' quotes/],
    ["x 'open", /never closed/],
    ["x;y", /`;` is shell syntax/],
    ["x &&y", /`&` is shell syntax/],
    ["x\ty", /U\+0009/],
    ["x é", /U\+00E9/],
    ["x".repeat(2001), /longer than 2000/],
  ])("refuses %j", (command, reason) => {
    const result = lex(command);
    expect("reason" in result && result.reason).toMatch(reason);
  });
});

describe("the allowlist on Windows and macOS", () => {
  function on(
    platform: "win32" | "darwin",
    root: string,
    command: string,
    agent = "test-reviewer",
  ): boolean {
    return decide(
      {
        tool_name: "Bash",
        tool_input: { command },
        cwd: root,
        agent_type: agent,
      },
      {
        projectDir: root,
        platform,
        realpath: (p: string) => p,
        tempDirs: [],
        // git writes the gitdir with forward slashes, in the project's own case.
        readText: (file: string) =>
          /review-12\/\.git$/i.test(file)
            ? `gitdir: ${root.replaceAll("\\", "/")}/.git/worktrees/review-12\r\n`
            : undefined,
      },
    ).allow;
  }

  const windows = "C:\\Users\\dev\\mapcairn";
  const mac = "/Users/dev/MapCairn";

  it("takes a quoted Windows worktree path, and refuses an unquoted backslash", () => {
    const tree = `${windows}\\.claude\\worktrees\\review-12`;
    expect(
      on("win32", windows, `cd '${tree}' && npm ci --ignore-scripts`),
    ).toBe(true);
    expect(on("win32", windows, `cd ${tree} && npm ci --ignore-scripts`)).toBe(
      false,
    );
    expect(on("win32", windows, "node scripts/agents/port.mjs 4173")).toBe(
      true,
    );
  });

  it("matches a macOS worktree path whatever its letter case", () => {
    const tree = "/users/dev/mapcairn/.claude/worktrees/review-12";
    expect(on("darwin", mac, `cd ${tree} && git status`)).toBe(true);
    expect(on("darwin", mac, "cd /users/dev/other && git status")).toBe(false);
  });
});

/** The placeholders the agent files use, and a value that fills each. */
const PLACEHOLDERS: Record<string, string> = {
  "<n>": "12",
  "<origin-or-upstream>": "origin",
  "<sha>": SHA,
  "<head-sha>": SHA,
  "<path>": "AGENTS.md",
  "<files>": "docs/guides/working-with-agents.md",
  "<port>": "5173",
};

function fill(text: string): string {
  return text.replace(/<[a-z-]+>/g, (name) => PLACEHOLDERS[name] ?? name);
}

/**
 * A full command for each command an agent file names in a short form, run
 * from the folder the agent runs it in.
 */
const COMPLETED: Record<string, { command: string; cwd: string }> = {
  "gh pr view": { command: `gh pr view 12 ${REPO_OPTION}`, cwd: ROOT },
  "gh pr diff": { command: `gh pr diff 12 ${REPO_OPTION}`, cwd: ROOT },
  "gh pr checks": { command: `gh pr checks 12 ${REPO_OPTION}`, cwd: ROOT },
  "gh issue view": { command: `gh issue view 12 ${REPO_OPTION}`, cwd: ROOT },
  "node scripts/agents/thread.mjs": {
    command: "node scripts/agents/thread.mjs issue 12",
    cwd: ROOT,
  },
  "npm ci --ignore-scripts": {
    command: `cd ${WORKTREE} && npm ci --ignore-scripts`,
    cwd: ROOT,
  },
  "git restore": {
    command: `cd ${WORKTREE} && git restore -- src/a.ts`,
    cwd: ROOT,
  },
  "npx --no-install vitest run": {
    command: `cd ${WORKTREE} && npx --no-install vitest run src/a.test.ts`,
    cwd: ROOT,
  },
  "git worktree remove": {
    command: "git worktree remove .claude/worktrees/review-12",
    cwd: ROOT,
  },
  "git status": { command: `cd ${WORKTREE} && git status`, cwd: ROOT },
};

/**
 * The commands an agent file names outside its "Never" lines: every code span
 * that starts with a program the reviewers run.
 */
function namedCommands(agent: string): string[] {
  const text = readFileSync(
    path.join(REPO, ".claude/agents", `${agent}.md`),
    "utf8",
  );
  const body = text.split("\n---\n").slice(1).join("\n---\n");
  return body
    .split("\n")
    .filter((line) => !/^- Never\b/.test(line))
    .flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ""))
    .filter((span) => /^(git|gh|node|npm|npx) /.test(span));
}

describe("the commands each reviewer's role text names", () => {
  it.each(READ_ONLY_AGENTS as string[])("are all allowed for %s", (agent) => {
    const named = namedCommands(agent);
    expect(named.length, agent).toBeGreaterThan(3);
    for (const span of named) {
      const full = COMPLETED[span] ?? { command: fill(span), cwd: ROOT };
      expect(bash(full.command, agent, full.cwd), `${agent}: ${span}`).toEqual({
        allow: true,
      });
    }
  });

  it("names the allowlist file in every reviewer's role text", () => {
    for (const agent of READ_ONLY_AGENTS as string[]) {
      const text = readFileSync(
        path.join(REPO, ".claude/agents", `${agent}.md`),
        "utf8",
      );
      expect(text, agent).toContain(ALLOWLIST_FILE);
    }
  });
});
