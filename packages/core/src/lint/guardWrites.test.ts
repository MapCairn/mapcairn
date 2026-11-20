// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  decide,
  READ_ONLY_AGENTS,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/guardWrites.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** Spawning node can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;

type Platform = "linux" | "darwin" | "win32";

interface Decision {
  allow: boolean;
  reason?: string;
}

interface Place {
  platform: Platform;
  root: string;
}

const LINUX: Place = { platform: "linux", root: "/home/dev/mapcairn" };
const MAC: Place = { platform: "darwin", root: "/Users/dev/mapcairn" };
const WINDOWS: Place = { platform: "win32", root: "C:\\Users\\dev\\mapcairn" };

interface Options {
  agent?: string | undefined;
  cwd?: string;
  place?: Place;
  realpath?: (p: string) => string;
}

function call(
  toolName: string,
  toolInput: Record<string, unknown>,
  options: Options = {},
): Decision {
  const place = options.place ?? LINUX;
  const agent = "agent" in options ? options.agent : "fresh-eyes-reviewer";
  return decide(
    {
      tool_name: toolName,
      tool_input: toolInput,
      cwd: options.cwd ?? place.root,
      ...(agent === undefined ? {} : { agent_type: agent }),
    },
    {
      projectDir: place.root,
      platform: place.platform,
      realpath: options.realpath ?? ((p: string) => p),
    },
  );
}

function edit(filePath: unknown, options: Options = {}): Decision {
  return call("Edit", { file_path: filePath }, options);
}

function bash(command: string, options: Options = {}): Decision {
  return call("Bash", { command }, options);
}

/** A worktree folder inside the project, as a person on that system writes it. */
function worktree(place: Place, name = "review-12"): string {
  const sep = place.platform === "win32" ? "\\" : "/";
  return [place.root, ".claude", "worktrees", name].join(sep);
}

describe("which agents the guard covers", () => {
  it("names the six read-only reviewers and not the implementer", () => {
    expect([...READ_ONLY_AGENTS].sort()).toEqual([
      "architecture-reviewer",
      "fresh-eyes-reviewer",
      "lean-reviewer",
      "security-reviewer",
      "test-reviewer",
      "ux-reviewer",
    ]);
  });

  it.each([
    ["the main session", undefined],
    ["the implementer", "implementer"],
    ["an agent the guard does not list", "ui-verifier"],
  ])("never blocks %s", (_name, agent) => {
    expect(edit("/etc/hosts", { agent }).allow).toBe(true);
    expect(bash("git push", { agent }).allow).toBe(true);
    expect(bash("rm -rf /home/dev", { agent }).allow).toBe(true);
  });

  it.each(READ_ONLY_AGENTS as string[])(
    "blocks %s outside a worktree",
    (agent) => {
      expect(edit("/home/dev/mapcairn/AGENTS.md", { agent }).allow).toBe(false);
      expect(bash("git commit -m x", { agent }).allow).toBe(false);
    },
  );

  it("leaves tools that do not write alone", () => {
    expect(call("Read", { file_path: "/etc/hosts" }).allow).toBe(true);
    expect(call("Grep", { pattern: "x" }).allow).toBe(true);
  });
});

describe("Edit, Write and NotebookEdit path check", () => {
  it.each([
    [
      "Linux absolute",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees/review-12/src/a.ts",
    ],
    [
      "macOS absolute",
      MAC,
      "/Users/dev/mapcairn/.claude/worktrees/review-12/src/a.ts",
    ],
    [
      "Windows backslashes",
      WINDOWS,
      "C:\\Users\\dev\\mapcairn\\.claude\\worktrees\\review-12\\src\\a.ts",
    ],
    [
      "Windows forward slashes",
      WINDOWS,
      "C:/Users/dev/mapcairn/.claude/worktrees/review-12/src/a.ts",
    ],
    [
      "Windows lower-case drive",
      WINDOWS,
      "c:\\Users\\dev\\mapcairn\\.claude\\worktrees\\review-12\\a.ts",
    ],
    [
      "Windows mixed separators",
      WINDOWS,
      "C:\\Users\\dev/mapcairn\\.claude/worktrees\\review-12/a.ts",
    ],
    [
      "Windows Git Bash form",
      WINDOWS,
      "/c/Users/dev/mapcairn/.claude/worktrees/review-12/a.ts",
    ],
    [
      "Windows extended-length prefix",
      WINDOWS,
      "\\\\?\\C:\\Users\\dev\\mapcairn\\.claude\\worktrees\\review-12\\a.ts",
    ],
    [
      "Windows paths ignore case",
      WINDOWS,
      "C:\\USERS\\DEV\\MAPCAIRN\\.Claude\\Worktrees\\review-12\\a.ts",
    ],
    [
      "macOS paths ignore case",
      MAC,
      "/users/dev/MapCairn/.CLAUDE/Worktrees/review-12/a.ts",
    ],
    [
      "doubled and dotted segments",
      LINUX,
      "/home/dev/mapcairn/./.claude//worktrees/review-12/./src/a.ts",
    ],
    [
      "a dot-dot that stays inside",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees/review-12/src/../a.ts",
    ],
    [
      "a relative path from the project root",
      LINUX,
      ".claude/worktrees/review-12/a.ts",
    ],
  ] as [string, Place, string][])("allows %s", (_name, place, filePath) => {
    expect(edit(filePath, { place }).allow).toBe(true);
  });

  it("resolves a relative path against the working directory", () => {
    const place = LINUX;
    const cwd = worktree(place);
    expect(edit("src/a.ts", { place, cwd }).allow).toBe(true);
    expect(edit("../../../AGENTS.md", { place, cwd }).allow).toBe(false);
  });

  it.each([
    ["a file in the project", LINUX, "/home/dev/mapcairn/AGENTS.md"],
    [
      "a file in the project on macOS",
      MAC,
      "/Users/dev/mapcairn/packages/core/src/a.ts",
    ],
    [
      "a file in the project on Windows",
      WINDOWS,
      "C:\\Users\\dev\\mapcairn\\AGENTS.md",
    ],
    [
      "the worktrees folder itself",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees",
    ],
    [
      "a worktree folder itself",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees/review-12",
    ],
    ["a settings file", LINUX, "/home/dev/mapcairn/.claude/settings.json"],
    [
      "a dot-dot that leaves the worktrees folder",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees/review-12/../../../AGENTS.md",
    ],
    [
      "a dot-dot sitting next to the folder",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees/../AGENTS.md",
    ],
    [
      "a Windows dot-dot",
      WINDOWS,
      "C:\\Users\\dev\\mapcairn\\.claude\\worktrees\\..\\AGENTS.md",
    ],
    [
      "a Windows dot-dot past the drive root",
      WINDOWS,
      "C:\\..\\..\\Users\\dev\\mapcairn\\AGENTS.md",
    ],
    [
      "another drive",
      WINDOWS,
      "D:\\mapcairn\\.claude\\worktrees\\review-12\\a.ts",
    ],
    [
      "another project's worktree",
      LINUX,
      "/home/dev/other/.claude/worktrees/review-12/a.ts",
    ],
    [
      "a similar folder name",
      LINUX,
      "/home/dev/mapcairn/.claude/worktrees-old/review-12/a.ts",
    ],
    [
      "a worktrees folder one level down",
      LINUX,
      "/home/dev/mapcairn/packages/.claude/worktrees/review-12/a.ts",
    ],
    ["a system file", LINUX, "/etc/hosts"],
    ["a temporary file", LINUX, "/tmp/scratch.ts"],
    ["a home-relative path", LINUX, "~/.claude/worktrees/review-12/a.ts"],
    ["a variable path", LINUX, "$HOME/.claude/worktrees/review-12/a.ts"],
    ["a relative path from the project root", LINUX, "AGENTS.md"],
    [
      "Linux paths are case-sensitive",
      LINUX,
      "/home/dev/mapcairn/.CLAUDE/Worktrees/review-12/a.ts",
    ],
    [
      "a Windows Git Bash path on another system",
      LINUX,
      "/c/Users/dev/mapcairn/.claude/worktrees/review-12/a.ts",
    ],
  ] as [string, Place, string][])("blocks %s", (_name, place, filePath) => {
    const decision = edit(filePath, { place });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/\.claude\/worktrees/);
  });

  it.each([undefined, null, "", 12, {}])(
    "blocks a missing or odd path (%j)",
    (value) => {
      expect(edit(value).allow).toBe(false);
    },
  );

  it("checks Write, MultiEdit and NotebookEdit the same way", () => {
    const inside = ".claude/worktrees/review-12/a.ts";
    expect(call("Write", { file_path: inside }).allow).toBe(true);
    expect(call("Write", { file_path: "AGENTS.md" }).allow).toBe(false);
    expect(call("MultiEdit", { file_path: "AGENTS.md" }).allow).toBe(false);
    expect(call("NotebookEdit", { notebook_path: inside }).allow).toBe(true);
    expect(call("NotebookEdit", { notebook_path: "a.ipynb" }).allow).toBe(
      false,
    );
  });

  it("follows a symbolic link out of the worktree", () => {
    const link = "/home/dev/mapcairn/.claude/worktrees/review-12/link";
    const realpath = (p: string) =>
      p.startsWith(link) ? p.replace(link, "/etc") : p;
    expect(edit(`${link}/hosts`, { realpath }).allow).toBe(false);
    expect(edit(`${link}/hosts`).allow).toBe(true);
  });

  it("follows a real symbolic link on this system", () => {
    const base = realpathSync(mkdtempSync(path.join(tmpdir(), "guard-")));
    try {
      const inside = path.join(base, ".claude", "worktrees", "review-12");
      mkdirSync(inside, { recursive: true });
      mkdirSync(path.join(base, "outside"));
      symlinkSync(path.join(base, "outside"), path.join(inside, "link"), "dir");
      const place = { platform: process.platform as Platform, root: base };
      const decide2 = (file: string) =>
        decide(
          {
            tool_name: "Write",
            tool_input: { file_path: file },
            cwd: base,
            agent_type: "fresh-eyes-reviewer",
          },
          { projectDir: place.root, platform: place.platform },
        ) as Decision;
      expect(decide2(path.join(inside, "new.ts")).allow).toBe(true);
      expect(decide2(path.join(inside, "link", "new.ts")).allow).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("Bash commands the reviewers may run", () => {
  const w = ".claude/worktrees/review-12";
  it.each([
    "git status",
    "git status --short --branch",
    "git log --oneline -5",
    'git log --format="%s" -3 origin/main',
    "git diff origin/main...HEAD",
    "git diff --stat",
    "git show abc123:packages/core/src/a.ts",
    "git fetch origin pull/12/head",
    "git rev-parse HEAD",
    "git ls-files packages",
    "git merge-base origin/main HEAD",
    "git branch --show-current",
    "git branch --list",
    "git branch -a --contains abc123",
    "git remote -v",
    "git config --get user.email",
    "git tag --list",
    "git worktree list",
    `git worktree add --detach ${w} abc123`,
    `git worktree remove ${w}`,
    `git -C ${w} status`,
    `git -C ${w} restore src/a.ts`,
    `cd ${w} && git restore src/a.ts`,
    `cd ${w}; git checkout -- src/a.ts`,
    `cd ${w} && npm ci --ignore-scripts`,
    "git status && git log -1",
    "git log 2>&1 | head -5",
    "gh pr view 12 --repo MapCairn/mapcairn",
    "gh pr diff 12 --repo MapCairn/mapcairn",
    "gh pr checks 12 --repo MapCairn/mapcairn",
    "gh pr list --repo MapCairn/mapcairn --state all --search '#12'",
    "gh issue view 3 --repo MapCairn/mapcairn --comments",
    "gh run view 99 --log-failed",
    "gh auth status",
    "gh repo view MapCairn/mapcairn --json viewerPermission",
    "gh api repos/MapCairn/mapcairn/pulls/12",
    "gh api -X GET repos/MapCairn/mapcairn/pulls/12 -f state=open",
    "node scripts/agents/thread.mjs pr 12",
    "npx --no-install vitest run packages/core/src/a.test.ts",
    "npm run port -- 4173",
    "ls -la | grep x",
    "cat AGENTS.md",
    "grep -rn 'git stash' docs",
    'echo "git push and rm -rf /"',
    "echo done > /dev/null",
    "ls missing 2>/dev/null",
    "ls missing 2>&1",
    `echo x > ${w}/note.txt`,
    `rm ${w}/tmp.test.ts`,
    `cd ${w} && rm tmp.test.ts`,
    `cd ${w} && mkdir scratch && touch scratch/a`,
    `cp AGENTS.md ${w}/copy.md`,
    `sed -i s/a/b/ ${w}/a.ts`,
    `find ${w} -name '*.ts'`,
    "sh -c 'git status'",
    `cat > ${w}/h.mjs <<'EOF'\nrm -rf /\ngit push\nEOF`,
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ allow: true });
  });

  it("allows the Windows forms of a worktree command", () => {
    const dir = worktree(WINDOWS);
    expect(bash(`git -C "${dir}" status`, { place: WINDOWS }).allow).toBe(true);
    expect(bash(`rm "${dir}\\t.ts"`, { place: WINDOWS }).allow).toBe(true);
    expect(bash(`rm ${dir}\\t.ts`, { place: WINDOWS }).allow).toBe(true);
    expect(bash(`echo x > "${dir}\\n.txt"`, { place: WINDOWS }).allow).toBe(
      true,
    );
    expect(bash("echo x > nul", { place: WINDOWS }).allow).toBe(true);
    expect(
      bash(`cd "${dir}" && git restore a.ts`, { place: WINDOWS }).allow,
    ).toBe(true);
  });

  it("allows a worktree command when the session is already inside the worktree", () => {
    const cwd = worktree(LINUX);
    expect(bash("git restore src/a.ts", { cwd }).allow).toBe(true);
    expect(bash("npm ci --ignore-scripts", { cwd }).allow).toBe(true);
    expect(bash("rm tmp.ts", { cwd }).allow).toBe(true);
  });
});

describe("Bash commands the reviewers may not run", () => {
  const w = ".claude/worktrees/review-12";
  it.each([
    ["git stash", /stash/],
    ["git stash list", /stash/],
    ["git stash pop", /stash/],
    ["git commit -m x", /commit/],
    ["git commit --amend --no-edit", /commit/],
    ["git push", /push/],
    ["git push origin HEAD:main", /push/],
    ["git push --force", /push/],
    ["git pull", /pull/],
    ["git merge origin/main", /merge/],
    ["git rebase origin/main", /rebase/],
    ["git cherry-pick abc123", /cherry-pick/],
    ["git reset --hard", /reset/],
    ["git reset --hard HEAD~1", /reset/],
    [`cd ${w} && git reset --hard`, /reset/],
    ["git add .", /\badd\b/],
    ["git tag v1", /tag/],
    ["git branch -D old", /branch/],
    ["git branch newname", /branch/],
    ["git remote add x https://example.test/x.git", /remote/],
    ["git config user.name x", /config/],
    ["git checkout main", /worktree/],
    ["git checkout -b new", /worktree/],
    ["git checkout -- .", /worktree/],
    ["git switch main", /worktree/],
    ["git restore src/a.ts", /worktree/],
    ["git clean -fd", /worktree/],
    ["git -C /home/dev/mapcairn checkout main", /worktree/],
    [`cd ${w} && cd ../.. && git checkout main`, /worktree/],
    [`cd ${w}/../.. && git restore a.ts`, /worktree/],
    ["cd /home/dev/mapcairn && git checkout main", /worktree/],
    [`git --git-dir=x checkout main`, /worktree/],
    ["git diff --output=out.txt", /output/],
    ["git status && git stash", /stash/],
    ["git log | cat; git push", /push/],
    ["echo hi && git commit -m x", /commit/],
    ["(git push)", /push/],
    ["FOO=1 git push", /push/],
    ["/usr/bin/git push", /push/],
    ["command git push", /push/],
    ["timeout 5 git push", /push/],
    ["env GIT_X=1 git push", /push/],
    ["nohup git push &", /push/],
    ["git\tpush", /push/],
    ["sh -c 'git push'", /push/],
    ["bash -lc 'git stash'", /stash/],
    ["x=$(git stash)", /stash/],
    ["echo `git push`", /push/],
    [`git worktree add -b feature ${w} origin/main`, /worktree/],
    [`git worktree add ${w} origin/main`, /detach/],
    ["git worktree add --detach /tmp/x abc123", /\.claude\/worktrees/],
    ["git worktree add --detach ../x abc123", /\.claude\/worktrees/],
    [`git worktree remove --force ${w}`, /force/],
    ["git worktree remove /home/dev/other", /\.claude\/worktrees/],
    ["git worktree prune", /worktree/],
    ["git frobnicate", /frobnicate/],
  ])("blocks %s", (command, reason) => {
    const decision = bash(command);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(reason);
  });

  it.each([
    ["rm -rf node_modules", /\.claude\/worktrees/],
    ["rm file.ts", /\.claude\/worktrees/],
    ["rm -rf /", /\.claude\/worktrees/],
    ["rm -rf .claude/worktrees", /\.claude\/worktrees/],
    [`rm -rf ${w}`, /git worktree remove/],
    [`rm -rf ${w}/.*`, /\.claude\/worktrees/],
    [`rm -rf ${w}/..`, /\.claude\/worktrees/],
    [`rm -rf ${w}/../..`, /\.claude\/worktrees/],
    [`rm -- ../x`, /\.claude\/worktrees/],
    ["rm -rf $HOME/x", /\.claude\/worktrees/],
    ["rm -rf ~/x", /\.claude\/worktrees/],
    [`rm ${w}/{a,../../b}`, /\.claude\/worktrees/],
    ["rmdir packages", /\.claude\/worktrees/],
    ["mv a b", /\.claude\/worktrees/],
    ["cp AGENTS.md copy.md", /\.claude\/worktrees/],
    ["touch AGENTS.md", /\.claude\/worktrees/],
    ["mkdir out", /\.claude\/worktrees/],
    ["ln -s a b", /\.claude\/worktrees/],
    ["chmod +x scripts/a.mjs", /\.claude\/worktrees/],
    ["sed -i s/a/b/ AGENTS.md", /\.claude\/worktrees/],
    ["sed --in-place=.bak s/a/b/ AGENTS.md", /\.claude\/worktrees/],
    ["tee AGENTS.md", /\.claude\/worktrees/],
    ["echo x | tee -a AGENTS.md", /\.claude\/worktrees/],
    ["echo x > AGENTS.md", /\.claude\/worktrees/],
    ["echo x >> AGENTS.md", /\.claude\/worktrees/],
    ["echo x>AGENTS.md", /\.claude\/worktrees/],
    ["cat a 1>out.txt", /\.claude\/worktrees/],
    ["echo x &> out.txt", /\.claude\/worktrees/],
    ["echo x >&out.txt", /\.claude\/worktrees/],
    ["echo x > /tmp/out.txt", /\.claude\/worktrees/],
    ["dd if=a of=AGENTS.md", /\.claude\/worktrees/],
    ["find . -delete", /find/],
    ["find . -name '*.ts' -exec rm {} ;", /find/],
    ["xargs rm", /xargs/],
    ["git status | xargs git push", /xargs/],
    ['eval "git push"', /eval/],
    ["npm ci", /npm/],
    ["npm install", /npm/],
    ["npm uninstall left-pad", /npm/],
    ["cd packages/core && npm install", /npm/],
  ])("blocks %s", (command, reason) => {
    const decision = bash(command);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(reason);
  });

  it.each([
    ["gh pr comment 12 --body x", /comment/],
    ["gh pr review 12 --approve", /review/],
    ["gh pr merge 12 --squash", /merge/],
    ["gh pr create --title x", /create/],
    ["gh pr close 12", /close/],
    ["gh pr checkout 12", /checkout/],
    ["gh issue comment 3 --body x", /comment/],
    ["gh issue edit 3 --add-label bug", /edit/],
    ["gh issue create --title x", /create/],
    ["gh run rerun 99", /rerun/],
    ["gh workflow run release.yml", /run/],
    ["gh api -X POST repos/x/y/issues/3/comments", /POST/],
    ["gh api --method=PATCH repos/x/y/issues/3", /PATCH/],
    ["gh api repos/x/y/issues/3/comments -f body=x", /field|POST|write/i],
    [
      "gh api repos/x/y/issues/3/comments --input body.json",
      /field|POST|write/i,
    ],
  ])("blocks %s", (command, reason) => {
    const decision = bash(command);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(reason);
  });

  it("blocks Windows forms outside a worktree", () => {
    expect(
      bash("rm C:\\Users\\dev\\mapcairn\\AGENTS.md", { place: WINDOWS }).allow,
    ).toBe(false);
    expect(
      bash('echo x > "C:\\Users\\dev\\mapcairn\\AGENTS.md"', { place: WINDOWS })
        .allow,
    ).toBe(false);
    expect(
      bash('git -C "C:\\Users\\dev\\mapcairn" checkout main', {
        place: WINDOWS,
      }).allow,
    ).toBe(false);
    expect(bash("git push", { place: WINDOWS }).allow).toBe(false);
    expect(
      bash("rm D:\\x\\.claude\\worktrees\\a\\f", { place: WINDOWS }).allow,
    ).toBe(false);
  });

  it("says why, and what the reviewer should do instead", () => {
    const decision = bash("git stash");
    expect(decision.reason).toContain("fresh-eyes-reviewer");
    expect(decision.reason).toMatch(/read-only/);
    expect(decision.reason).toMatch(/report/i);
  });
});

describe("running the script as a hook", () => {
  const SCRIPT = path.join(REPO, "scripts/agents/guardWrites.mjs");

  function hook(input: unknown, raw?: string) {
    return spawnSync(process.execPath, [SCRIPT], {
      input: raw ?? JSON.stringify(input),
      encoding: "utf8",
      cwd: REPO,
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
      timeout: CHILD_TIMEOUT_MS,
    });
  }

  it("blocks with exit code 2 and the reason on standard error", () => {
    const result = hook({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git push" },
      cwd: REPO,
      agent_type: "lean-reviewer",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/push/);
  });

  it("allows with exit code 0 and no output", () => {
    const result = hook({
      tool_name: "Bash",
      tool_input: { command: "git status" },
      cwd: REPO,
      agent_type: "lean-reviewer",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("does nothing for the main session", () => {
    const result = hook({
      tool_name: "Bash",
      tool_input: { command: "git push" },
      cwd: REPO,
    });
    expect(result.status).toBe(0);
  });

  it("blocks when the input cannot be read, rather than letting a write through", () => {
    const result = hook(undefined, "not json");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/could not read/i);
  });
});

describe("the committed hook configuration", () => {
  const settings = JSON.parse(
    readFileSync(path.join(REPO, ".claude/settings.json"), "utf8"),
  ) as {
    hooks?: {
      PreToolUse?: {
        matcher: string;
        hooks: { type: string; command: string }[];
      }[];
    };
  };

  it("runs the guard before every tool that can write", () => {
    const entry = settings.hooks?.PreToolUse?.find((candidate) =>
      candidate.hooks.some(
        (h) => h.command === "node scripts/agents/guardWrites.mjs",
      ),
    );
    expect(entry).toBeDefined();
    const matched = (entry?.matcher ?? "").split("|");
    expect(matched).toEqual(
      expect.arrayContaining([
        "Edit",
        "Write",
        "MultiEdit",
        "NotebookEdit",
        "Bash",
      ]),
    );
    expect(entry?.hooks.every((h) => h.type === "command")).toBe(true);
  });

  it("names agents that exist, and every reviewer has the role text saying it is enforced", () => {
    for (const agent of READ_ONLY_AGENTS as string[]) {
      const text = readFileSync(
        path.join(REPO, ".claude/agents", `${agent}.md`),
        "utf8",
      );
      expect(text, agent).toMatch(/guardWrites|hook/);
    }
  });
});
