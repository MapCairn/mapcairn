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
  checkCommand,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/guardCommands.mjs";
import {
  projectOf,
  resolvePath,
  show,
  ZONE,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/guardPaths.mjs";
import {
  decide,
  READ_ONLY_AGENTS,
  readInput,
  runHook,
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
  tempDirs?: string[];
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
      tempDirs: options.tempDirs ?? ["/tmp"],
    },
  );
}

function edit(filePath: unknown, options: Options = {}): Decision {
  return call("Edit", { file_path: filePath }, options);
}

function bash(command: string, options: Options = {}): Decision {
  return call("Bash", { command }, options);
}

/**
 * The second layer on its own: the shell rules in `guardCommands.mjs`, which
 * run after the allowlist and can only add a refusal. The fixtures below were
 * written for those rules, so they check its reasons; each refusal is also
 * checked against the whole guard, which must refuse it too.
 */
function shell(command: string, options: Options = {}): Decision {
  const place = options.place ?? LINUX;
  const cwd = options.cwd ?? place.root;
  const project = projectOf(place.root, cwd, place.platform);
  const here = resolvePath(cwd, null, place.platform);
  const reason = checkCommand(command, {
    cwd: here === undefined ? null : show(here),
    context: {
      platform: place.platform,
      realpath: options.realpath ?? ((p: string) => p),
      tempDirs: options.tempDirs ?? ["/tmp"],
      zone: { root: project.root, segments: [...project.segments, ...ZONE] },
    },
    depth: 0,
  });
  if (reason === undefined) {
    return { allow: true };
  }
  expect(bash(command, options).allow, command).toBe(false);
  return { allow: false, reason };
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
    const base = realpathSync.native(
      mkdtempSync(path.join(tmpdir(), "guard-")),
    );
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

describe("Bash commands the shell rules let through", () => {
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
    expect(shell(command)).toEqual({ allow: true });
  });

  it("allows the Windows forms of a worktree command", () => {
    const dir = worktree(WINDOWS);
    expect(shell(`git -C "${dir}" status`, { place: WINDOWS }).allow).toBe(
      true,
    );
    expect(shell(`rm "${dir}\\t.ts"`, { place: WINDOWS }).allow).toBe(true);
    expect(shell(`rm ${dir}\\t.ts`, { place: WINDOWS }).allow).toBe(true);
    expect(shell(`echo x > "${dir}\\n.txt"`, { place: WINDOWS }).allow).toBe(
      true,
    );
    expect(shell("echo x > nul", { place: WINDOWS }).allow).toBe(true);
    expect(
      shell(`cd "${dir}" && git restore a.ts`, { place: WINDOWS }).allow,
    ).toBe(true);
  });

  it("allows a worktree command when the session is already inside the worktree", () => {
    const cwd = worktree(LINUX);
    expect(shell("git restore src/a.ts", { cwd }).allow).toBe(true);
    expect(shell("npm ci --ignore-scripts", { cwd }).allow).toBe(true);
    expect(shell("rm tmp.ts", { cwd }).allow).toBe(true);
  });
});

describe("Bash commands the shell rules refuse", () => {
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
    ["env X=1 git push", /push/],
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
    const decision = shell(command);
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
    const decision = shell(command);
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
    const decision = shell(command);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(reason);
  });

  it("blocks Windows forms outside a worktree", () => {
    expect(
      shell("rm C:\\Users\\dev\\mapcairn\\AGENTS.md", { place: WINDOWS }).allow,
    ).toBe(false);
    expect(
      shell('echo x > "C:\\Users\\dev\\mapcairn\\AGENTS.md"', {
        place: WINDOWS,
      }).allow,
    ).toBe(false);
    expect(
      shell('git -C "C:\\Users\\dev\\mapcairn" checkout main', {
        place: WINDOWS,
      }).allow,
    ).toBe(false);
    expect(shell("git push", { place: WINDOWS }).allow).toBe(false);
    expect(
      shell("rm D:\\x\\.claude\\worktrees\\a\\f", { place: WINDOWS }).allow,
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

  it("works from a folder below the project, as the committed command runs it", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      input: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
        cwd: path.join(REPO, "packages/web"),
        agent_type: "fresh-eyes-reviewer",
      }),
      encoding: "utf8",
      cwd: path.join(REPO, "packages/web"),
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO },
      timeout: CHILD_TIMEOUT_MS,
    });
    expect(result.status).toBe(2);
  });

  it("lets a call through when the input cannot be read, with a warning", () => {
    const result = hook(undefined, "not json");
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/could not read/i);
  });
});

describe("readInput", () => {
  it("joins every chunk of standard input as UTF-8", async () => {
    async function* chunks() {
      yield Buffer.from('{"tool_name":');
      yield Buffer.from('"Bash"}');
    }

    expect(await readInput(chunks())).toBe('{"tool_name":"Bash"}');
  });

  it("returns empty input when reading the stream fails", async () => {
    async function* chunks() {
      yield Buffer.from("partial");
      throw new Error("read failed");
    }

    expect(await readInput(chunks())).toBe("");
  });
});

describe("the hook entry point", () => {
  const reviewer = (command: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      agent_type: "fresh-eyes-reviewer",
      tool_name: "Bash",
      tool_input: { command },
      cwd: LINUX.root,
      ...extra,
    });
  const env = { CLAUDE_PROJECT_DIR: LINUX.root };

  it.each([
    ["malformed JSON", "{not json"],
    ["empty input", ""],
    ["truncated JSON", reviewer("ls").slice(0, 20)],
    ["JSON null", "null"],
    ["a JSON array", "[]"],
    ["a JSON string", '"x"'],
    ["a JSON number", "5"],
    [
      "an agent_type that is not text",
      JSON.stringify({
        agent_type: 5,
        tool_name: "Bash",
        tool_input: { command: "rm x" },
      }),
    ],
    [
      "the main session",
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "git push" },
        cwd: LINUX.root,
      }),
    ],
    [
      "the implementer",
      JSON.stringify({
        agent_type: "implementer",
        tool_name: "Bash",
        tool_input: { command: "git commit -m x" },
        cwd: LINUX.root,
      }),
    ],
  ])("never blocks on %s", (_name, raw) => {
    expect(runHook(raw, env).code).toBe(0);
  });

  it("warns when the input cannot be read, so the call is not blocked silently", () => {
    expect(runHook("{not json", env).message).toMatch(/could not read/i);
  });

  it("reads input that starts with a byte order mark", () => {
    expect(runHook(`\uFEFF${reviewer("git push")}`, env).code).toBe(2);
  });

  it("refuses a reviewer's empty call without failing, and checks an edit with no working directory", () => {
    const missing = JSON.stringify({
      agent_type: "fresh-eyes-reviewer",
      tool_name: "Bash",
      tool_input: null,
    });
    const empty = runHook(missing, env);
    expect(empty.code).toBe(2);
    expect(empty.message).toMatch(/the command is empty/);
    expect(empty.message).not.toMatch(/could not decide/);
    const editCall = JSON.stringify({
      agent_type: "fresh-eyes-reviewer",
      tool_name: "Edit",
      tool_input: { file_path: "/x" },
    });
    expect(runHook(editCall, env).code).toBe(2);
  });

  it("blocks a reviewer's call when the guard itself fails", () => {
    const result = runHook(
      reviewer("ls", {
        tool_name: "Write",
        tool_input: { file_path: `${LINUX.root}/.claude/worktrees/a/b` },
      }),
      env,
      {
        realpath: () => {
          throw new Error("boom");
        },
      },
    );
    expect(result.code).toBe(2);
    expect(result.message).toMatch(/could not decide/i);
  });

  it("lets another caller through when the guard itself fails", () => {
    const raw = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "/x" },
      cwd: LINUX.root,
    });
    const result = runHook(raw, env, {
      realpath: () => {
        throw new Error("boom");
      },
    });
    expect(result.code).toBe(0);
  });
});

/** The committed command: a path from the project folder, so it runs from any folder. */
const HOOK_COMMAND =
  'node "$CLAUDE_PROJECT_DIR/scripts/agents/guardWrites.mjs"';

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
      candidate.hooks.some((h) => h.command === HOOK_COMMAND),
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

describe("holes a review found", () => {
  const w = ".claude/worktrees/review-12";
  const root = LINUX.root;
  const inWorktree = { cwd: `${root}/${w}` };

  it.each([
    ["a quote inside the delimiter", 'cat <<E"O"F\nx\nEOF\nrm -rf packages'],
    [
      "single quotes inside the delimiter",
      "cat <<E'O'F\nx\nEOF\nrm -rf packages",
    ],
    ["a backslash in the delimiter", "cat <<\\EOF\nx\nEOF\nrm -rf packages"],
    ["a quoted delimiter with a space", 'cat <<"E F"\nx\nE F\nrm -rf packages'],
  ])(
    "reads a here-document delimiter as the shell does: %s",
    (_name, command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/rm/);
    },
  );

  it.each(["cat <<EOF\nrm -rf packages", "cat <<EOF", "cat <<'EOF'\nx\nEOF2"])(
    "blocks a command with a here-document that is never closed: %j",
    (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/here-document/);
    },
  );

  it("allows a closed here-document with an oddly quoted delimiter", () => {
    expect(shell(`cat > ${w}/h.txt <<E"O"F\nrm -rf packages\nEOF`).allow).toBe(
      true,
    );
    expect(shell(`cat > ${w}/h.txt <<"E F"\nrm -rf packages\nE F`).allow).toBe(
      true,
    );
  });

  it.each([
    "echo x 1<>AGENTS.md",
    "echo x <>AGENTS.md",
    "echo x >| AGENTS.md",
    "echo x &>> AGENTS.md",
  ])("treats %s as a write", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    ["a brace list", "{rm,-rf,packages}"],
    ["a variable", "X=rm; $X -rf packages"],
    ["an ANSI-C quoted name", "$'\\x72m' -rf packages"],
    ["a glob in the program", "/bin/r? -rf packages"],
    ["command with an option", "command -p rm -rf packages"],
    ["exec with an option", "exec -a x rm -rf packages"],
    ["time with an option", "time -p rm -rf packages"],
    ["env with an option", "env -u FOO rm -rf packages"],
    ["env -S", "env -S 'rm -rf packages'"],
    ["nice with a long option", "nice --adjustment=5 rm -rf packages"],
    ["caffeinate", "caffeinate rm -rf packages"],
    ["watch", "watch -n1 rm -rf packages"],
    ["script", "script -q out rm -rf packages"],
    ["flock", "flock lock rm -rf packages"],
    ["parallel", "parallel rm ::: packages"],
    ["source", `source ${w}/x.sh`],
    ["a dot", `. ${w}/x.sh`],
    ["a shell with a script", `bash ${w}/x.sh`],
    ["a bare shell", "sh"],
  ])("does not run what it cannot read: %s", (_name, command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("still reads the plain wrappers", () => {
    expect(shell("env FOO=1 git status").allow).toBe(true);
    expect(shell("timeout 5 git status").allow).toBe(true);
    expect(shell("nice -n 5 git status").allow).toBe(true);
    expect(shell("time git status").allow).toBe(true);
    expect(shell("env FOO=1 rm -rf packages").allow).toBe(false);
  });

  it.each([
    "sed -n 'w AGENTS.md' README.md",
    "sed '1e rm -rf packages' README.md",
    "sed -n '/x/w AGENTS.md' README.md",
    "sed 's/a/b/w AGENTS.md' README.md",
    "sed 's/a/b/e' README.md",
    "sed -e '$!N;W out' README.md",
    "awk '{print > \"AGENTS.md\"}' README.md",
    "awk '{print | \"sh\"}' README.md",
    "awk 'BEGIN{system(\"rm x\")}'",
    "awk -f prog.awk README.md",
  ])("blocks a script that can write: %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    "sed -n '1,5p' AGENTS.md",
    "sed -n 's/new/wow/p' AGENTS.md",
    "sed 's/a/b/g' AGENTS.md",
    "sed -n '/exit/p;/we/d' AGENTS.md",
    "awk '{print $1}' AGENTS.md",
  ])("allows a script that only reads: %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  it.each([
    "cp -t packages .claude/worktrees/review-12/AGENTS.md",
    "cp --target-directory=packages .claude/worktrees/review-12/AGENTS.md",
    "cp --target-directory packages .claude/worktrees/review-12/AGENTS.md",
    "cp -tpackages .claude/worktrees/review-12/AGENTS.md",
    "ln -sft packages .claude/worktrees/review-12/x",
    "install -t packages .claude/worktrees/review-12/x",
    "cp -t",
  ])("reads the target of %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("allows -t with a target inside the worktree", () => {
    expect(shell(`cp -t ${w}/dir AGENTS.md`).allow).toBe(true);
    expect(shell(`cp --target-directory=${w}/dir AGENTS.md`).allow).toBe(true);
  });

  it.each([
    ["a symbolic link to the project", `ln -s ${root} ${w}/lnk`],
    ["a link whose source is relative", `ln -s ../x ${w}/lnk`],
    ["a hard link to a file outside", `ln ${root}/AGENTS.md ${w}/hard`],
    [
      "a link to packages and a write through it",
      `ln -s ${root}/packages ${w}/lnk2 && rm -rf ${w}/lnk2/`,
    ],
  ])("blocks %s", (_name, command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("allows a link whose source is inside the worktree", () => {
    expect(shell(`ln -s ${root}/${w}/a ${w}/lnk`).allow).toBe(true);
  });

  it.each([
    `GIT_WORK_TREE=${root} git checkout -- .`,
    `GIT_DIR=${root}/.git git checkout main`,
    `GIT_INDEX_FILE=${root}/.git/index git restore .`,
    `env GIT_WORK_TREE=${root} git restore .`,
    `GIT_COMMON_DIR=${root}/.git git status`,
    `export GIT_DIR=${root}/.git; git log`,
    `git -C ${w} -c core.worktree=${root} checkout -- .`,
    "git -c core.fsmonitor='rm -rf packages' status",
    "git -c core.pager='rm -rf packages' log",
    "git -c alias.x='!rm -rf packages' x",
    "git --config-env=core.pager=X status",
  ])("blocks a way to point git elsewhere or run code: %s", (command) => {
    expect(shell(command, inWorktree).allow).toBe(false);
  });

  it.each([
    "git diff --ext-diff",
    "git fetch --upload-pack='rm -rf packages' origin",
    "git fetch --receive-pack=x origin",
    "git ls-remote --exec=x origin",
    "git grep -O'rm -rf packages' foo",
    "git log -Ofoo",
    "git grep --open-files-in-pager=x foo",
    "git fetch origin +main:refs/heads/somebranch",
    "git fetch origin main:main",
    "git fetch origin refs/heads/x:refs/tags/y",
    "git fetch origin +pull/1/head",
    "git fetch --update-head-ok origin",
    "git fetch --prune origin",
    "git fetch --tags origin",
    "git fetch -f origin",
  ])("blocks a read command that runs code or writes refs: %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    "git fetch origin pull/12/head",
    "git fetch upstream pull/12/head",
    "git fetch git@example.test:a/b.git pull/12/head",
    "git fetch",
    "git log -c",
  ])("allows %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  it.each([
    "git checkout -b evil",
    "git checkout -B main",
    "git checkout -b evil --",
    "git checkout --orphan evil",
    "git checkout --track origin/main",
    "git checkout main",
    "git switch -c evil",
    "git switch -c evil --detach",
    "git switch -C evil",
    "git switch --orphan evil",
    "git switch main",
  ])(
    "refuses to create or move a branch, even in a worktree: %s",
    (command) => {
      expect(shell(command, inWorktree).allow).toBe(false);
    },
  );

  it.each([
    "git checkout --detach abc123",
    "git switch --detach abc123",
    "git checkout abc123 -- src/a.ts",
    "git checkout -- .",
    "git restore src/a.ts",
  ])("allows a detached checkout or a restore in a worktree: %s", (command) => {
    expect(shell(command, inWorktree).allow).toBe(true);
  });

  it.each([
    "gh pr --repo MapCairn/mapcairn merge 531",
    "gh pr -R view merge 531",
    "gh -R MapCairn/mapcairn pr merge 531",
    "gh api -XPOST repos/a/b/issues",
    "gh api -X GET graphql -f query='mutation{x}'",
    "gh api graphql -f query='query{x}'",
    "gh api -X GET -X POST repos/a/b/issues/1/comments -f body=x",
    "gh api --method POST -X GET repos/x -f a=b",
    "gh api -H 'X-HTTP-Method-Override: DELETE' repos/a/b",
    "gh co 531",
    "gh foo view",
    "gh alias list",
    "gh extension list",
  ])("blocks %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    "gh pr view 12 --repo MapCairn/mapcairn",
    "gh pr --repo MapCairn/mapcairn view 12",
    "gh pr view 12 -R MapCairn/mapcairn",
    "gh run view 99 --repo MapCairn/mapcairn --log-failed",
    "gh issue --repo MapCairn/mapcairn list",
    "gh api -X GET repos/a/b/pulls/12",
  ])("allows %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  describe("input that is made to be slow", () => {
    function timed(command: string): { decision: Decision; ms: number } {
      const start = performance.now();
      const decision = shell(command);
      return { decision, ms: performance.now() - start };
    }

    const FAST_MS = 1000;

    it.each([
      [
        "a command over the length limit",
        `echo ${"a ".repeat(40000)}`,
        /too long/,
      ],
      [
        "a megabyte of words",
        `echo ${"a ".repeat(500000)} > AGENTS.md`,
        /too long/,
      ],
      [
        "100 thousand statements",
        `${"cd a; ".repeat(100000)}echo > x`,
        /too long/,
      ],
      ["100 thousand quotes", `echo ${'"'.repeat(200001)} ; rm x`, /too long/],
      [
        "100 thousand parentheses",
        `${"(".repeat(100000)}rm x${")".repeat(100000)}`,
        /too long/,
      ],
      ["more statements than a reviewer needs", "ls;".repeat(600), /too many/],
      [
        "many here-documents",
        `cat ${"<<A ".repeat(10000)}\n${"x\n".repeat(10000)}`,
        /./,
      ],
      [
        "20 thousand environment options",
        `env ${"-x ".repeat(20000)}rm x`,
        /./,
      ],
      ["20 thousand wrappers", `${"time ".repeat(12000)}rm packages`, /./],
      [
        "a path with thousands of segments",
        `echo x > ${root}/${w}/${"a/".repeat(20000)}f`,
        /./,
      ],
      ["a path of slashes", `rm x ${"/".repeat(60000)}a`, /./],
      ["300 paths", `rm ${` ${w}/a`.repeat(300)}`, /too many/],
    ])("refuses %s quickly", (_name, command, reason) => {
      const { decision, ms } = timed(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(reason);
      expect(ms).toBeLessThan(FAST_MS);
    });

    it("refuses shells nested more than a few levels", () => {
      let command = "rm x";
      for (let level = 0; level < 12; level += 1) {
        command = `sh -c ${JSON.stringify(command)}`;
      }
      expect(shell(command).allow).toBe(false);
      expect(shell('sh -c "sh -c \\"git status\\""').allow).toBe(true);
    });

    it("refuses a file path with thousands of segments or a huge length", () => {
      const start = performance.now();
      expect(edit(`${root}/${w}/${"a/".repeat(5000)}f`).allow).toBe(false);
      expect(edit(`${root}/${w}/${"a".repeat(1_000_000)}`).allow).toBe(false);
      expect(performance.now() - start).toBeLessThan(FAST_MS);
    });

    it("refuses a short path with more segments than any real one", () => {
      expect(edit(`${root}/${w}/${"a/".repeat(300)}f`).allow).toBe(false);
    });

    it("allows a long but ordinary path", () => {
      expect(edit(`${root}/${w}/${"dir/".repeat(20)}file.ts`).allow).toBe(true);
    });
  });
});

describe("Windows forms a review found", () => {
  const cwd = `${worktree(WINDOWS, "x")}`;
  it.each([
    ["an extended UNC path", "\\\\?\\UNC\\server\\share\\evil.txt"],
    ["a device path", "\\\\.\\pipe\\x"],
    ["a drive-relative path", "D:foo.txt"],
    ["a drive-relative dot-dot", "C:..\\..\\..\\AGENTS.md"],
    ["a short 8.3 name", "C:\\Users\\dev\\MAPCAI~1\\AGENTS.md"],
    [
      "a trailing dot on the folder",
      "C:\\Users\\dev\\mapcairn\\.claude\\worktrees.\\x\\a",
    ],
  ])("blocks %s from inside a worktree", (_name, file) => {
    expect(edit(file, { place: WINDOWS, cwd }).allow).toBe(false);
    expect(shell(`rm "${file}"`, { place: WINDOWS, cwd }).allow).toBe(false);
  });

  it("still allows a mixed-case path inside the worktree", () => {
    expect(
      edit("c:/USERS/dev/MapCairn/.Claude/Worktrees/x/a", {
        place: WINDOWS,
        cwd,
      }).allow,
    ).toBe(true);
  });
});

describe("false blocks a review found", () => {
  it.each([
    "awk 'NR>1 {print $1}' AGENTS.md",
    "awk '$1 > 5' AGENTS.md",
    "awk 'length > 80' AGENTS.md",
    "awk '{print $1, $2}' AGENTS.md",
    "awk -F'|' '{print $1}' AGENTS.md",
    "awk '/a|b/ {n++} END {print n}' AGENTS.md",
    "awk '{ if ($1 > 2) print \"big\" }' AGENTS.md",
    "awk '{print \"a > b\"}' AGENTS.md",
    "awk '{print ($1 > 5)}' AGENTS.md",
    "git merge-tree --write-tree origin/main HEAD",
    "[ -f AGENTS.md ] && git status",
    "[[ -f AGENTS.md ]] && git status",
  ])("allows %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  it.each([
    "awk '{print > \"AGENTS.md\"}' README.md",
    "awk '{print $1 >> \"AGENTS.md\"}' README.md",
    "awk '{print | \"sh\"}' README.md",
    'awk \'{printf "%s", $1 > "/dev/stderr"}\' README.md',
    "awk '{print $1 > $2}' README.md",
    "awk 'BEGIN{system(\"rm x\")}'",
    "awk '{ \"date\" | getline d }'",
    "awk 'BEGIN { getline x < \"/etc/hosts\" }'",
    "awk '{print}; {print > \"x\"}' README.md",
    "awk -f prog.awk README.md",
  ])("blocks %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });
});

describe("the session scratchpad", () => {
  const pad = "/tmp/claude-1000/-home-dev-mapcairn/0123-abc/scratchpad";
  const macPad =
    "/private/tmp/claude-501/-Users-dev-mapcairn/0123-abc/scratchpad";
  const w = ".claude/worktrees/review-12";

  it.each([`${pad}/probe.mjs`, `${pad}/a/b.txt`, `${pad}/a/../b.txt`])(
    "lets a reviewer write %s",
    (file) => {
      expect(edit(file).allow).toBe(true);
      expect(call("Write", { file_path: file }).allow).toBe(true);
    },
  );

  it("works with the macOS temporary folder", () => {
    const options = { place: MAC, tempDirs: ["/private/tmp"] };
    expect(edit(`${macPad}/probe.mjs`, options).allow).toBe(true);
    expect(edit(`${macPad}/../x`, options).allow).toBe(false);
  });

  it.each([
    ["the scratchpad itself", pad],
    ["a folder beside it", `${pad}/../other/x`],
    ["a dot-dot out of it", `${pad}/../x`],
    ["a dot-dot to the temporary folder", `${pad}/../../../../x`],
    [
      "a dot-dot to the project",
      `${pad}/../../../../../home/dev/mapcairn/AGENTS.md`,
    ],
    [
      "another folder of the session",
      "/tmp/claude-1000/-home-dev-mapcairn/0123-abc/other/x",
    ],
    ["a folder named like it", `${pad}-old/x`],
    ["no claude folder", "/tmp/scratchpad/x"],
    ["a claude folder without a number", "/tmp/claude/p/s/scratchpad/x"],
    [
      "a claude folder that is not under the temporary folder",
      "/tmp/x/claude-1000/p/s/scratchpad/f",
    ],
    [
      "another temporary-looking folder",
      "/var/other/claude-1000/p/s/scratchpad/f",
    ],
    ["a git folder inside it", `${pad}/repo/.git/config`],
  ])("blocks %s", (_name, file) => {
    expect(edit(file).allow).toBe(false);
  });

  it("leaves Windows blocked, because its scratchpad folder was not verified", () => {
    const file =
      "C:\\Users\\dev\\AppData\\Local\\Temp\\claude-1000\\p\\s\\scratchpad\\f";
    expect(
      edit(file, {
        place: WINDOWS,
        tempDirs: ["C:\\Users\\dev\\AppData\\Local\\Temp"],
      }).allow,
    ).toBe(false);
  });

  it("follows a symbolic link out of the scratchpad", () => {
    const link = `${pad}/link`;
    const realpath = (p: string) =>
      p.startsWith(link) ? p.replace(link, "/etc") : p;
    expect(edit(`${link}/hosts`, { realpath }).allow).toBe(false);
    expect(edit(`${pad}/plain`, { realpath }).allow).toBe(true);
  });

  it.each([
    `echo x > ${pad}/out.txt`,
    `git diff > ${pad}/d.patch`,
    `rm ${pad}/probe.mjs`,
    `mkdir ${pad}/sub`,
    `cp AGENTS.md ${pad}/copy.md`,
    `cat > ${pad}/p.mjs <<'EOF'\nx\nEOF`,
    `cd ${pad} && node probe.mjs`,
    `cd ${pad} && echo x > out.txt`,
  ])("lets a command write there: %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  it.each([
    `echo x > ${pad}/../x`,
    `rm -rf ${pad}`,
    `rm -rf ${pad}/..`,
    `cd ${pad} && echo x > ../x`,
    `echo x > ${pad}/.git/config`,
    `echo x > /tmp/claude-1000/p/s/other/x`,
  ])("still blocks %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("does not let a reviewer write a git folder in a worktree either", () => {
    expect(edit(`${LINUX.root}/${w}/.git`).allow).toBe(false);
    expect(edit(`${LINUX.root}/${w}/sub/.git/config`).allow).toBe(false);
    expect(edit(`${LINUX.root}/${w}/.gitignore`).allow).toBe(true);
    expect(edit(`${LINUX.root}/${w}/.github/x.yml`).allow).toBe(true);
    expect(shell(`echo x > ${w}/.git`).allow).toBe(false);
  });
});

describe("hardening from the second review", () => {
  const w = ".claude/worktrees/review-12";
  const root = LINUX.root;
  const nest = (depth: number, command: string) => {
    let text = command;
    for (let level = 0; level < depth; level += 1) {
      text = `sh -c ${JSON.stringify(text)}`;
    }
    return text;
  };

  it.each([
    "sh -c -e 'touch /x'",
    "bash -c -x 'rm -rf packages'",
    "bash -lc -e 'touch AGENTS.md'",
  ])("reads the command after the options that follow -c: %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    `mv --target-directory=/outside ${w}/a`,
    `mv -t /outside ${w}/a`,
    `mv -t${root}/packages ${w}/a`,
    "mv -t",
  ])("reads the target of %s", (command) => {
    expect(shell(command, { cwd: `${root}/${w}` }).allow).toBe(false);
  });

  it("allows mv inside a worktree, with or without -t", () => {
    expect(shell(`mv ${w}/a ${w}/b`).allow).toBe(true);
    expect(shell(`mv -t ${w}/dir ${w}/a`).allow).toBe(true);
  });

  it.each([
    "to\\uch AGENTS.md",
    "r\\m -rf packages",
    "/bin/r\\m -rf packages",
    "to`echo`uch AGENTS.md",
    "`echo to`uch AGENTS.md",
  ])("refuses a program word the shell rewrites: %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("allows a command substitution that stands alone", () => {
    expect(shell("echo `git rev-parse HEAD`").allow).toBe(true);
  });

  it.each([
    "fish -c 'rm -rf packages'",
    "csh -c 'rm -rf packages'",
    "tcsh -c 'rm -rf packages'",
    "mksh -c 'rm -rf packages'",
    "ash -c 'rm -rf packages'",
    "fish -c 'git status; rm x'",
    "taskset 1 rm -rf packages",
    "arch -arm64 rm -rf packages",
    "ssh host rm -rf packages",
    "unshare -r rm -rf packages",
    "chroot / rm -rf packages",
    "nsenter -t 1 rm -rf packages",
    "chrt 1 rm -rf packages",
    "unbuffer rm -rf packages",
    "rlwrap rm -rf packages",
  ])("does not run %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("reads the command in the other shells that the guard supports", () => {
    expect(shell("ash -c 'git status'").allow).toBe(true);
  });

  it.each([
    "git --exec-path status",
    "git --exec-path=/tmp/x status",
    "git --exec-path /tmp/x status",
  ])("refuses %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    `HOME=${root}/${".claude/worktrees/review-12"}/h git status`,
    "HOME=/x git status",
    "XDG_CONFIG_HOME=/x git status",
    "PATH=/x git status",
    "PAGER='rm x' git log",
    "EDITOR=x git status",
    "VISUAL=x git status",
    "LESS=x git log",
    "LESSOPEN=x git log",
    "LD_PRELOAD=/x git status",
    "DYLD_INSERT_LIBRARIES=/x git status",
    "NODE_OPTIONS=--require=/x node a.js",
    "BASH_ENV=/x sh -c 'git status'",
    "SSH_ASKPASS=/x git fetch",
    "env HOME=/x git status",
    "export HOME=/x; git status",
    "declare -x PATH=/x; git status",
  ])(
    "refuses an environment that changes what a command runs: %s",
    (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/variable|environment/);
    },
  );

  it.each([
    "export PAGER=x",
    "typeset -x HOME=y",
    "local HOME=y",
    "readonly PATH=/x",
    "declare -x HOME=y",
    "env PATH=x git log",
  ])("refuses a risky variable set by %s", (command) => {
    const decision = shell(command);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/variable/);
  });

  it.each([
    "grep -rn 'PATH=' .github scripts",
    "grep -rn HOME= scripts docs",
    "grep -rn 'XDG_CONFIG_HOME=' .",
    "grep -rn 'GIT_DIR=' .",
    "grep -rn 'LD_PRELOAD=' .",
    "grep -rn 'NODE_OPTIONS=' .",
    "grep -rn 'BASH_ENV=' .",
    "grep -rn 'SSH_ASKPASS=' .",
    "grep -rn 'PAGER=' .",
    "grep -rn 'EDITOR=' .",
    "grep -rn 'VISUAL=' .",
    "grep -rn 'DYLD_INSERT_LIBRARIES=' .",
    "rg 'LESS=' .",
    "git grep -n 'PATH=' abc123 -- .github",
    "git diff a b -- f | grep -n 'HOME='",
    "echo HOME=1",
    "printf 'HOME=%s\\n' x",
    "LESSON=1 echo hi",
    "CI=1 git status",
    "NODE_ENV=test git status",
    "TZ=UTC git log",
    "HOMEPAGE=1 git status",
    "PATHWAY=1 git status",
    "XDGX=1 git status",
    "ENVIRONMENT=prod git status",
    "echo $HOME",
    "printenv HOME",
    "env | grep -E '^(HOME|PATH)='",
  ])("allows %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  it.each([
    "git -c x=y status",
    "git -ccore.x=y status",
    "git --config-env=a=B status",
    "git -c core.pager=x log",
  ])("names the configuration rule for %s", (command) => {
    const decision = shell(command);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/sets configuration/);
  });

  it("reads a here-document closed after tab stripping", () => {
    const body = "cat <<-EOF\n\tx\n\tEOF\n";
    expect(shell(`${body}rm -rf packages`).reason).toMatch(/rm/);
    expect(shell(`cat > ${w}/h.txt <<-EOF\n\tx\n\tEOF`).allow).toBe(true);
    expect(shell("cat <<EOF\n\tx\n\tEOF\nrm packages").reason).toMatch(
      /here-document/,
    );
  });

  it("matches the scratchpad's claude folder exactly", () => {
    const pad = "/tmp/claude-1000/p/s/scratchpad";
    expect(edit(`${pad}/f`).allow).toBe(true);
    expect(edit("/tmp/claude-abc/p/s/scratchpad/f").allow).toBe(false);
    expect(edit("/tmp/claude-/p/s/scratchpad/f").allow).toBe(false);
    expect(edit("/tmp/claude-1000x/p/s/scratchpad/f").allow).toBe(false);
    expect(edit("/tmp/xclaude-1000/p/s/scratchpad/f").allow).toBe(false);
  });

  it("blocks an unquoted here-document whose body runs a command", () => {
    expect(shell("cat <<EOF\n$(rm -rf packages)\nEOF").allow).toBe(false);
    expect(shell("cat <<EOF\n`rm -rf packages`\nEOF").allow).toBe(false);
    expect(shell("cat <<'EOF'\n$(rm -rf packages)\nEOF").allow).toBe(true);
    expect(shell("cat <<\\EOF\n$(rm -rf packages)\nEOF").allow).toBe(true);
    expect(shell("cat <<EOF\nplain $HOME text\nEOF").allow).toBe(true);
  });

  it("stops reading shells nested more than four deep", () => {
    expect(shell(nest(4, "git status")).allow).toBe(true);
    const decision = shell(nest(5, "git status"));
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/nested/);
  });

  it.each([
    "sed -ne 'w AGENTS.md' README.md",
    "sed -n -e '1,3p' -e 'w x' README.md",
    "sed --expression='w x' README.md",
    "sed --expression 'w x' README.md",
    "sed -nf script.sed README.md",
  ])("reads the script of %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    "sed -ne '1,3p' AGENTS.md",
    "sed -n -e '1,3p' -e 's/a/b/' AGENTS.md",
    "sed -n 'b end; p; :end' AGENTS.md",
    "sed -n '/a/b;p' AGENTS.md",
    "sed -n 'tx;p;:x' AGENTS.md",
    "sed -l 5 -n 'p' AGENTS.md",
    "sed --line-length=5 -n p AGENTS.md",
    "sed -n -l 70 '1p' AGENTS.md",
  ])("allows %s", (command) => {
    expect(shell(command).allow).toBe(true);
  });

  it("reads the script that follows a line-length option", () => {
    expect(shell("sed -l 5 -n 'w x' README.md").allow).toBe(false);
    expect(shell("sed --line-length=5 -n 'w x' README.md").allow).toBe(false);
  });

  it.each([
    "sed -n 'b;w x' AGENTS.md",
    "sed -n 'bend;w x' AGENTS.md",
    "sed -n 'b end;w x' AGENTS.md",
  ])("still finds a write after a branch label: %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it.each([
    "npm install -g left-pad",
    "npm install --global left-pad",
    "npm i --prefix /x",
    "npm install --location=global x",
    `cd ${".claude/worktrees/review-12"} && npm install -g x`,
    `cd ${".claude/worktrees/review-12"} && npm install left-pad`,
    `cd ${".claude/worktrees/review-12"} && npm add left-pad`,
    `cd ${".claude/worktrees/review-12"} && npm ci`,
    `cd ${".claude/worktrees/review-12"} && npm install`,
    `cd ${".claude/worktrees/review-12"} && npm --prefix /x ci --ignore-scripts`,
  ])("refuses %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });

  it("allows an install without scripts in a worktree", () => {
    const wt = ".claude/worktrees/review-12";
    expect(shell(`cd ${wt} && npm ci --ignore-scripts`).allow).toBe(true);
    expect(shell(`cd ${wt} && npm install --ignore-scripts`).allow).toBe(true);
    expect(shell(`cd ${wt} && npm run build`).allow).toBe(true);
  });

  it.each([
    `rsync -a ${".claude/worktrees/review-12"}/a host:/x`,
    `rsync -a a host:${".claude/worktrees/review-12"}/b`,
    `cd ${".claude/worktrees/review-12"} && rsync -a a host:dir`,
    `cd ${".claude/worktrees/review-12"} && scp a host:dir`,
    `cd ${".claude/worktrees/review-12"} && scp a user@host:`,
    "scp a b",
    "rsync -a a b",
  ])("treats a remote or outside target as outside: %s", (command) => {
    expect(shell(command).allow).toBe(false);
  });
});

describe("hardening of the write guard (#534)", () => {
  const w = ".claude/worktrees/review-12";

  describe("assignments that append or set an array element", () => {
    it.each([
      "NODE_OPTIONS+=--require=/x node a.js",
      "PATH+=:/x git status",
      "PATH[0]=/x git status",
      "PATH[1]+=/x git status",
      "GIT_DIR[0]=/x git status",
      "export PATH+=:/x",
      "declare -x NODE_OPTIONS+=--require=/x",
      "env HOME+=/x git status",
      "LESSKEYIN[0]=x git log",
    ])("names the variable in %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/the variable/);
    });

    it.each([
      "LESSON+=1 echo hi",
      "CI[0]=1 git status",
      "grep 'PATH=' .github",
      "grep 'PATH+=' .github",
      "echo HOME=1",
      "LESSON=1 echo hi",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });
  });

  describe("statements that start with a modifier", () => {
    it.each([
      "noglob PATH=/x git log",
      "nocorrect HOME=/x git log",
      "- PATH=/x git log",
      "noglob nocorrect NODE_OPTIONS=--require=/x node a.js",
      "FOO=1 noglob PATH=/x git log",
    ])("reads the assignments after the modifier in %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/the variable/);
    });

    it.each([
      "coproc PATH=/x git log",
      "coproc git status",
      "coproc NAME { git status; }",
    ])("refuses coproc: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/coproc/);
    });

    it("still runs the program that follows a modifier through its rules", () => {
      expect(shell("noglob git push").allow).toBe(false);
      expect(shell("noglob git status").allow).toBe(true);
    });
  });

  describe("variables that load code or change where a program writes", () => {
    it.each([
      "LESSKEYIN=x git log",
      "LESSKEYIN_SYSTEM=x git log",
      "LESSKEY_CONTENT=x git log",
      "LESSKEY_CONTENT_SYSTEM=x git log",
      "LESSMETACHARS=x git log",
      "LESSMETAESCAPE=x git log",
      "LESSNOCONFIG=1 git log",
      "LESSUTFCHARDEF=x git log",
      "LESSBINFMT=x git log",
      "LESSUTFBINFMT=x git log",
      "LESSECHO=x git log",
      "LESSCOLOR=x git log",
      "NODE_PATH=/x node a.js",
      "NPM_CONFIG_PREFIX=/x git log",
      "npm_config_userconfig=/x git log",
      "PYTHONSTARTUP=/x git log",
      "PYTHONPATH=/x git log",
      "PERL5OPT=-Mx git log",
      "PERL5LIB=/x git log",
      "RUBYOPT=-rx git log",
      "RUBYLIB=/x git log",
      "ZDOTDIR=/x git log",
      "SHELLOPTS=xtrace git log",
      "BASHOPTS=x git log",
      "PROMPT_COMMAND=x git log",
      "IFS=x git log",
      "CDPATH=/x git log",
      "PS4=x git log",
      "make PATH=/x all",
      "gmake NODE_OPTIONS=--require=/x all",
    ])("refuses %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/the variable/);
    });

    it.each([
      "LESSON=1 echo hi",
      "LESSONS=1 git log",
      "NODE_ENV=test git status",
      "NODE_PATHS=1 git status",
      "PYTHONDONTWRITEBYTECODE=1 git status",
      "make all",
      "make -n all",
      "grep -rn 'LESSKEYIN=' .",
      "grep -rn 'NODE_PATH=' scripts",
      "grep 'NPM_CONFIG_PREFIX=' .github",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });
  });

  describe("rsync and scp", () => {
    it.each([
      `rsync -e 'sh -c x' a ${w}/b`,
      `rsync --rsh='sh -c x' a ${w}/b`,
      `rsync --rsync-path='x' a ${w}/b`,
      `rsync --log-file=/x a ${w}/b`,
      `rsync --write-batch=/x a ${w}/b`,
      `rsync --only-write-batch=/x a ${w}/b`,
      `rsync --backup-dir=/x -b a ${w}/b`,
      `rsync --partial-dir=/x a ${w}/b`,
      `rsync --temp-dir=/x a ${w}/b`,
      `rsync -a host:/etc/x ${w}/b`,
      `rsync -a a ${w}/b`,
      `scp -S /x a ${w}/b`,
      `scp -o ProxyCommand=x a ${w}/b`,
      `scp -F /x a ${w}/b`,
      `scp -J host a ${w}/b`,
      `scp host:/etc/x ${w}/b`,
      `scp a ${w}/b`,
      `cd ${w} && rsync -a a b`,
    ])("refuses %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/rsync|scp/);
      expect(decision.reason).toMatch(/cannot read/);
    });

    it("refuses them behind a wrapper", () => {
      expect(shell(`env FOO=1 rsync -a a ${w}/b`).allow).toBe(false);
      expect(shell(`timeout 5 scp a ${w}/b`).allow).toBe(false);
    });
  });

  describe("a shell started with -c", () => {
    it.each([
      "sh script.sh -c 'git push'",
      "bash script.sh -c 'ls'",
      "sh ./run.sh -c ls",
      "sh -- -c 'git push'",
      "sh -- script.sh -c 'git push'",
      "sh -",
    ])("does not take -c after the script for the command: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/without -c/);
    });

    it.each([
      "bash -o xtrace -c 'git status'",
      "bash +o xtrace -c 'git status'",
      "bash -O extglob -c 'git status'",
      "bash +O extglob -c 'git status'",
      "bash -oc 'git status'",
      "bash --rcfile /x -c 'git status'",
      "bash --rcfile=/x -c 'git status'",
      "bash --init-file /x -c 'git status'",
      "bash --init-file=/x -c 'git status'",
      "bash --unknown -c 'git status'",
      "bash -euo pipefail -c 'git status'",
    ])("refuses an option the guard cannot read: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/option/);
    });

    it.each([
      "bash -i -c 'git status'",
      "bash -ic 'git status'",
      "bash -ci 'git status'",
      "zsh -i -lc 'git status'",
    ])("refuses -i with -c, which reads start-up files: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/interactive/);
    });

    it.each([
      "sh -c 'git status'",
      "bash -lc 'git status'",
      "bash -ec 'git status'",
      "bash -e -c 'git status'",
      "bash -c -e 'git status'",
      "bash --norc -c 'git status'",
      "bash --noprofile --norc -c 'git status'",
      "bash -c -- 'git status'",
      "bash -c 'git status' name arg",
      "sh -c 'git log | head -5'",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it("still reads the command it runs", () => {
      expect(shell("bash --norc -c 'git push'").allow).toBe(false);
      expect(shell("bash -e -c 'rm -rf packages'").allow).toBe(false);
    });
  });

  describe("holes the security review of #558 found", () => {
    it.each([
      `env X.Y=1 sh -c 'touch /x'`,
      `env X.Y=1 git push`,
      `env a-b=1 git commit -m x`,
      `env X.Y=1 HOME=/x git status`,
    ])("reads the program after env words with odd names: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it.each([
      `env 'BASH_FUNC_git%%=() { touch /x; }' bash -c 'git status'`,
      "env GH\\_PAGER=x gh pr diff 1",
      "env PA\\TH=/x git status",
      "env X.Y=1 git status",
      "env BASH_FUNC_git=x git status",
    ])("refuses an env setting that is not a plain name: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it("still reads env options and plain settings", () => {
      expect(shell("env CI=1 NODE_ENV=test git status").allow).toBe(true);
      expect(shell("env CI=1 git status").allow).toBe(true);
      expect(shell("env -u X git status").allow).toBe(false);
    });

    it.each([
      "repeat 2 git push",
      "repeat 1 touch /x",
      "select x in a touch /x",
      "foreach x touch /x",
      "function f touch /x",
      "function f { touch /x }",
      "if [[ -n x ]] touch /x ]]",
      "if { true } touch /x",
      "{ true } always { touch /x }",
      "if { true } touch /x }",
      "if [[ -n x ]] git push",
      "if [[ -n x ]] touch /x",
      "[[ -n x ]] touch /x",
    ])("refuses a form that hides a command: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it.each([
      "[[ -n x ]] && git status",
      "[[ -n x ]]",
      "if [[ -n x ]]; then git status; fi",
      "[ -n x ] && git status",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it.each([
      "a[b]=1 git status",
      "b='x[$(touch /y)]'; a[b]=1",
      "export a[b]=1",
      "declare a[b]=1",
      "local a[$x]=1",
      "typeset a[b+c]=1",
    ])("refuses a subscript that is not a number: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it.each(["export a[0]=1", "declare a[12]=1", "CI[0]=1 git status"])(
      "allows a numeric subscript: %s",
      (command) => {
        expect(shell(command).allow).toBe(true);
      },
    );

    it.each([
      "bash -kc 'git diff GIT_EXTERNAL_DIFF=x'",
      "bash -k -c 'git status'",
      "set -k; git status",
      "set -o keyword; git status",
      "set -ek",
      "sh -c 'set -k; git status'",
    ])("refuses keyword mode: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it("allows set without keyword mode", () => {
      expect(shell("set -e; git status").allow).toBe(true);
    });

    it.each([
      "GH_PAGER=x gh pr diff 1",
      "GH_BROWSER=x gh pr view 1",
      "GH_EDITOR=x gh pr view 1",
      "GH_CONFIG_DIR=/x gh pr view 1",
      "GH_HOST=example.com gh pr view 1",
      "GH_TOKEN=x gh pr view 1",
      "BROWSER=x gh pr view 1",
      "export GH_PAGER=x",
      "env GH_PAGER=x gh pr diff 1",
    ])("refuses %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/the variable/);
    });

    it.each([
      "BROWSERS=1 git status",
      "GHOST=1 git status",
      "grep -rn 'GH_TOKEN=' .github",
      "gh pr diff 558",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it.each([
      "fish -c 'git status'",
      "fish -c 'true' -C 'touch /x'",
      `fish -c "echo 'a\\\\' '; touch /x; echo 'b'"`,
      "fish --init-command=x -c true",
    ])("refuses fish, whose quoting differs from bash: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/fish/);
    });

    it.each([
      "echo $'\\' '; touch /x; #'",
      "echo $'a'",
      "echo a$'b'",
      'echo $"a"',
      "printf $'\\n'",
    ])(
      "refuses ANSI-C and locale quoting, which the guard cannot read: %s",
      (command) => {
        const decision = shell(command);
        expect(decision.allow).toBe(false);
        expect(decision.reason).toMatch(/\$'/);
      },
    );

    it.each([
      "echo '$'",
      'echo "$HOME"',
      "echo 'a$' b",
      'echo "cost: $"',
      "printf '%s\\n' x",
      "echo \\$'x'",
    ])("allows a dollar that is not ANSI-C quoting: %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it.each([
      "export PA\\TH=/scratch",
      "export GH\\_PAGER=x",
      "b='x[$(touch /y)]'; declare a\\[b]=1",
      "declare a\\[b]=1",
      "local NODE\\_OPTIONS=x",
    ])(
      "strips backslashes before it reads an assigning builtin: %s",
      (command) => {
        const decision = shell(command);
        expect(decision.allow).toBe(false);
        expect(decision.reason).toMatch(/variable|subscript/);
      },
    );

    it.each([
      "bash -c 'shopt -so keyword; git diff'",
      "shopt -o keyword",
      "shopt -s keyword",
      "shopt -oq keyword",
      "shopt -so",
    ])("refuses keyword mode through shopt: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it("allows shopt options that are not keyword mode", () => {
      expect(shell("shopt -s extglob").allow).toBe(true);
      expect(shell("shopt extglob").allow).toBe(true);
    });

    it.each([
      "unset GH_TOKEN; gh pr view 1",
      "unset GH_TOKEN",
      "unset -v GH_HOST",
      "unset GH\\_TOKEN",
      "unset 'a[$(touch /y)]'",
      "unset a[0]",
      "export -n GH_TOKEN",
      "export -n GH_TOKEN=x",
    ])("refuses to unset what gh reads, or a subscript: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it("allows unset of an ordinary name", () => {
      expect(shell("unset FOO").allow).toBe(true);
      expect(shell("export FOO=1").allow).toBe(true);
    });
  });

  describe("round three of the security review of #558", () => {
    it.each([
      "echo $\\\n'\\' '; git push; #'",
      'echo $\\\n"a"; git push',
      "echo a \\\n b",
      "git status \\\n && touch /x",
    ])("refuses a backslash-newline, which hides a quote: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/backslash/);
    });

    it("allows a backslash-newline inside single quotes", () => {
      expect(shell("echo 'a\\\nb'").allow).toBe(true);
    });

    it.each([
      "export $n=1",
      "export $n",
      "declare BAR$z=2",
      "export {BAZ,Q}=3",
      "export GIT_CONFIG_COUNT$x=1; git diff",
      "export GIT_CONFIG_COUNT$x=1 git diff",
      "export *=1",
      "export A*=1",
      "local ${n}=1",
      'export "$n"=1',
      "typeset FOO.BAR=1",
      "readonly a-b=1",
      "unset {GH,X}_TOKEN",
      'unset "$n"',
      "unset ${n}",
      "unset $n",
      "export -n $n",
      "make $n=1 all",
      "make BAR$z=2",
      "make {A,B}=1",
    ])("refuses a name that is not plain: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/plain name|variable/);
    });

    it.each([
      "export FOO=1",
      "export FOO_BAR2=x",
      "export a[0]=1",
      "export",
      "export -p",
      "declare -p",
      "declare -x FOO=1",
      "local x=1",
      "readonly FOO",
      "unset FOO",
      "unset -v FOO_2",
      "make all",
      "make -j4 all",
      "make FOO=bar all",
      "make build/out.o",
      "make -C packages/core test",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it.each([
      "unset -m 'GH_*'",
      "unset -vm GH_TOKEN",
      "unset -m 'X*'",
      "declare +x GH_TOKEN",
      "typeset +x GH_TOKEN",
      "export +x GH_TOKEN",
      "local GH_TOKEN",
      "typeset GH_TOKEN",
      "declare GH_TOKEN",
      "readonly GH_TOKEN",
      "local gh_token",
      "unsetenv GH_TOKEN",
      "setenv X y",
    ])(
      "refuses a form that drops or shadows the GitHub token: %s",
      (command) => {
        expect(shell(command).allow).toBe(false);
      },
    );

    it.each([
      'echo "$(git push)"',
      'echo "`git push`"',
      'echo "$(touch /x)"',
      'echo "a $(touch /x) b"',
      'echo "${HOME}"',
      'echo "${x:-$(touch /x)}"',
      'echo "$((1+1))"',
      'echo "$[1]"',
      'git commit -m "$(touch /x)"',
    ])("refuses a substitution inside double quotes: %s", (command) => {
      const decision = shell(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/double quotes/);
    });

    it.each([
      'echo "$HOME"',
      'echo "$a and $b"',
      'echo "\\$(touch /x)"',
      "echo '$(touch /x)'",
      "echo '\"$(x)\"'",
      'echo "cost: $"',
      'grep -rn "PATH=" .github',
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it.each([
      "rg '}' file",
      'rg "}" file',
      "grep -n '}' file",
      "grep -n '}' file | head",
      "rg '{' file",
      "rg ']]' file",
      "rg '[[' file",
      "git grep -n '}' abc123 -- .github",
    ])("allows a brace inside quotes, which is a word: %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });

    it.each([
      "if { true } touch /x",
      "{ true } always { touch /x }",
      "if [[ -n x ]] touch /x ]]",
      "{ true } touch /x",
    ])(
      "still refuses a bare block end that is followed by words: %s",
      (command) => {
        expect(shell(command).allow).toBe(false);
      },
    );

    it("keeps refusing ANSI-C quoting, so grep $'\\t' needs a literal tab", () => {
      expect(shell("grep $'\\t' file").allow).toBe(false);
    });
  });

  describe("a quoted word is not a file descriptor", () => {
    it.each([
      "if { true '2'<<'EOF' } touch /x\nEOF",
      "{ true '2'<<'EOF' } always { touch /x }\nEOF",
      "if { true \"2\"<<'EOF' } touch /x\nEOF",
      "if { true \\2<<'EOF' } touch /x\nEOF",
      "if { true '2'>/dev/null } touch /x",
      "if { true '2'> /dev/null } touch /x",
      "if { true 2>/dev/null '3'<<'EOF' } touch /x\nEOF",
    ])("still sees the bare brace after a redirect: %s", (command) => {
      expect(shell(command).allow).toBe(false);
    });

    it("reads a quoted digit before a redirect as an operand, not a descriptor", () => {
      expect(shell("rm '2'>/dev/null").allow).toBe(false);
      expect(shell("rm '2'> /dev/null").allow).toBe(false);
      expect(shell("rm \\2>/dev/null").allow).toBe(false);
      expect(shell("echo '2'>/dev/null").allow).toBe(true);
    });

    it("still reads an unquoted digit as a descriptor", () => {
      expect(shell("git status 2>/dev/null").allow).toBe(true);
      expect(shell("git status 2>&1").allow).toBe(true);
      expect(shell("rm 2>/dev/null").allow).toBe(true);
    });

    it("does not carry a quoted flag past a here-document", () => {
      expect(shell("cat <<'EOF'\nx\nEOF\nrg '}' file").allow).toBe(true);
      expect(shell("rg '}' file <<'EOF'\nx\nEOF").allow).toBe(true);
    });
  });

  describe("commands the reviewers use", () => {
    it.each([
      "gh pr diff 534",
      "gh pr view 534 --json title",
      "gh issue view 534",
      "gh pr checks 534",
      "git show HEAD",
      "git show abc123:scripts/agents/guardCommands.mjs",
      "git fetch origin main",
      "git fetch origin pull/534/head",
      "git diff origin/main...HEAD -- scripts",
      "git log --oneline -n 5",
      "grep -rn 'guardWrites' docs scripts",
      "grep -rn 'PATH=' .github",
      "rg -n 'LESS' scripts",
      "node scripts/agents/thread.mjs issue 534",
      "npx --no-install vitest run packages/core/src/lint/guardWrites.test.ts",
      "ls -la scripts/agents | head",
      "cat scripts/agents/guardCommands.mjs | wc -l",
    ])("allows %s", (command) => {
      expect(shell(command).allow).toBe(true);
    });
  });
});
