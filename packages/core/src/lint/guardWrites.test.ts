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

  it("does not fail on a reviewer's call with no tool input or working directory", () => {
    const missing = JSON.stringify({
      agent_type: "fresh-eyes-reviewer",
      tool_name: "Bash",
      tool_input: null,
    });
    expect(runHook(missing, env).code).toBe(0);
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
      const decision = bash(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/rm/);
    },
  );

  it.each(["cat <<EOF\nrm -rf packages", "cat <<EOF", "cat <<'EOF'\nx\nEOF2"])(
    "blocks a command with a here-document that is never closed: %j",
    (command) => {
      const decision = bash(command);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toMatch(/here-document/);
    },
  );

  it("allows a closed here-document with an oddly quoted delimiter", () => {
    expect(bash(`cat > ${w}/h.txt <<E"O"F\nrm -rf packages\nEOF`).allow).toBe(
      true,
    );
    expect(bash(`cat > ${w}/h.txt <<"E F"\nrm -rf packages\nE F`).allow).toBe(
      true,
    );
  });

  it.each([
    "echo x 1<>AGENTS.md",
    "echo x <>AGENTS.md",
    "echo x >| AGENTS.md",
    "echo x &>> AGENTS.md",
  ])("treats %s as a write", (command) => {
    expect(bash(command).allow).toBe(false);
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
    expect(bash(command).allow).toBe(false);
  });

  it("still reads the plain wrappers", () => {
    expect(bash("env FOO=1 git status").allow).toBe(true);
    expect(bash("timeout 5 git status").allow).toBe(true);
    expect(bash("nice -n 5 git status").allow).toBe(true);
    expect(bash("time git status").allow).toBe(true);
    expect(bash("env FOO=1 rm -rf packages").allow).toBe(false);
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
    expect(bash(command).allow).toBe(false);
  });

  it.each([
    "sed -n '1,5p' AGENTS.md",
    "sed -n 's/new/wow/p' AGENTS.md",
    "sed 's/a/b/g' AGENTS.md",
    "sed -n '/exit/p;/we/d' AGENTS.md",
    "awk '{print $1}' AGENTS.md",
  ])("allows a script that only reads: %s", (command) => {
    expect(bash(command).allow).toBe(true);
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
    expect(bash(command).allow).toBe(false);
  });

  it("allows -t with a target inside the worktree", () => {
    expect(bash(`cp -t ${w}/dir AGENTS.md`).allow).toBe(true);
    expect(bash(`cp --target-directory=${w}/dir AGENTS.md`).allow).toBe(true);
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
    expect(bash(command).allow).toBe(false);
  });

  it("allows a link whose source is inside the worktree", () => {
    expect(bash(`ln -s ${root}/${w}/a ${w}/lnk`).allow).toBe(true);
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
    expect(bash(command, inWorktree).allow).toBe(false);
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
    expect(bash(command).allow).toBe(false);
  });

  it.each([
    "git fetch origin pull/12/head",
    "git fetch upstream pull/12/head",
    "git fetch git@example.test:a/b.git pull/12/head",
    "git fetch",
    "git log -c",
  ])("allows %s", (command) => {
    expect(bash(command).allow).toBe(true);
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
      expect(bash(command, inWorktree).allow).toBe(false);
    },
  );

  it.each([
    "git checkout --detach abc123",
    "git switch --detach abc123",
    "git checkout abc123 -- src/a.ts",
    "git checkout -- .",
    "git restore src/a.ts",
  ])("allows a detached checkout or a restore in a worktree: %s", (command) => {
    expect(bash(command, inWorktree).allow).toBe(true);
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
    expect(bash(command).allow).toBe(false);
  });

  it.each([
    "gh pr view 12 --repo MapCairn/mapcairn",
    "gh pr --repo MapCairn/mapcairn view 12",
    "gh pr view 12 -R MapCairn/mapcairn",
    "gh run view 99 --repo MapCairn/mapcairn --log-failed",
    "gh issue --repo MapCairn/mapcairn list",
    "gh api -X GET repos/a/b/pulls/12",
  ])("allows %s", (command) => {
    expect(bash(command).allow).toBe(true);
  });

  describe("input that is made to be slow", () => {
    function timed(command: string): { decision: Decision; ms: number } {
      const start = performance.now();
      const decision = bash(command);
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
      expect(bash(command).allow).toBe(false);
      expect(bash('sh -c "sh -c \\"git status\\""').allow).toBe(true);
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
    expect(bash(`rm "${file}"`, { place: WINDOWS, cwd }).allow).toBe(false);
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
