// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The rules `guardCommands.mjs` applies to a `git` command run by a read-only
 * reviewer. A reviewer may run the commands that read, fetch a pull request's
 * head, and in a worktree of its own restore files, check out a detached
 * commit, and add or remove a detached worktree. Anything that writes history,
 * a branch, a tag, the index, the remote or the configuration is blocked, and
 * so is whatever can make git run a program or write somewhere else (`-c`,
 * `GIT_DIR`, `--ext-diff`, `--upload-pack`, a fetch that updates a branch).
 */
import { isInside, resolvePath, show } from "./guardPaths.mjs";

/**
 * @typedef {import("./guardCommands.mjs").Walk} Walk
 */

/** `git` commands that only read, and may be run anywhere. */
const GIT_READ = new Set([
  "status",
  "log",
  "diff",
  "show",
  "rev-parse",
  "rev-list",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "cat-file",
  "blame",
  "grep",
  "merge-base",
  "merge-tree",
  "describe",
  "show-ref",
  "for-each-ref",
  "name-rev",
  "shortlog",
  "diff-tree",
  "diff-index",
  "check-ignore",
  "count-objects",
  "range-diff",
  "whatchanged",
  "version",
  "help",
  "show-branch",
  "cherry",
  "verify-commit",
  "verify-tag",
]);

/** `git` commands that write only to the working tree, so only in a worktree. */
const GIT_IN_WORKTREE = new Set(["checkout", "switch", "restore", "clean"]);

/** Why a `git` command is not allowed to a reviewer, by command. */
const GIT_WHY = new Map([
  [
    "stash",
    "git stash is shared by every worktree, so it can hide or restore someone else's work",
  ],
  ["commit", "git commit writes history"],
  ["push", "git push changes the remote"],
  ["pull", "git pull changes the branch and the working tree"],
  ["merge", "git merge changes the branch"],
  ["rebase", "git rebase rewrites history"],
  ["cherry-pick", "git cherry-pick writes history"],
  ["revert", "git revert writes history"],
  ["reset", "git reset moves a branch or discards changes"],
  ["add", "git add changes the index"],
  ["rm", "git rm deletes files"],
  ["mv", "git mv moves files"],
  ["am", "git am writes history"],
  ["apply", "git apply changes files"],
]);

const BRANCH_WHY = "git branch creates, moves or deletes a branch";
const TAG_WHY = "git tag creates or deletes a tag";
const REMOTE_WHY = "git remote changes the remotes";
const CONFIG_WHY = "git config changes the configuration";

/** Options that make a read command run a program or write a file. */
const RUNS_CODE =
  /^(--ext-diff|--upload-pack|--receive-pack|--exec|--open-files-in-pager|--update-head-ok|-O)/;

/** Options of `git checkout` and `git switch` that create or move a branch. */
const MAKES_BRANCH = /^(-[bBcCt]|--orphan|--track|--no-track|--guess)/;

/**
 * What `git -C <folder>` and the options before the subcommand did.
 *
 * @typedef {object} GitOptions
 * @property {string | null} cwd Where git works after `-C`.
 * @property {boolean} redirected Whether `--git-dir` or `--work-tree` was given.
 * @property {string | undefined} reason Why an option is not allowed.
 * @property {string} sub The subcommand.
 * @property {string[]} rest The words after it.
 */

/**
 * Reads the options before a `git` subcommand: `-C <folder>` moves the working
 * directory, `--git-dir` and `--work-tree` make it unknowable, and `-c` and
 * `--config-env` set configuration that can run a program.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {GitOptions}
 */
function readGitOptions(args, walk) {
  let cwd = walk.cwd;
  let redirected = false;
  let index = 0;
  while ((args[index] ?? "").startsWith("-")) {
    const option = args[index] ?? "";
    if (/^--exec-path/.test(option)) {
      const reason = `git ${option} changes where git finds its programs, so a reviewer may not use it`;
      return { cwd, redirected, reason, sub: "", rest: [] };
    }
    if (/^(-c|--config-env)/.test(option)) {
      const reason = `git ${option} sets configuration that can run a program or move the work tree, so a reviewer may not use it`;
      return { cwd, redirected, reason, sub: "", rest: [] };
    }
    if (option === "-C") {
      const target = resolvePath(
        args[index + 1],
        cwd,
        walk.context.platform,
        true,
      );
      cwd = target === undefined ? null : show(target);
    }
    const takesValue = /^(-C|--namespace|--git-dir|--work-tree)$/.test(option);
    redirected ||= /^--(git-dir|work-tree)/.test(option);
    index += takesValue ? 2 : 1;
  }
  return {
    cwd,
    redirected,
    reason: undefined,
    sub: args[index] ?? "",
    rest: args.slice(index + 1),
  };
}

/**
 * @param {string[]} rest
 * @returns {string | undefined}
 */
function checkBranch(rest) {
  const listing = rest.some((arg) =>
    /^(--list|-l|--show-current|--contains|--merged|--no-merged|--points-at)$/.test(
      arg,
    ),
  );
  const writes = rest.some((arg) =>
    /^(-[dDmMcCfu]|--delete|--move|--copy|--force|--set-upstream-to|--unset-upstream|--edit-description)/.test(
      arg,
    ),
  );
  const names = rest.some((arg) => !arg.startsWith("-"));
  return !writes && (listing || !names) ? undefined : BRANCH_WHY;
}

/**
 * Decides on `git fetch`, which a reviewer uses to get a pull request's head
 * (`git fetch origin pull/<n>/head`): no pruning, no tags, no forcing, and no
 * refspec that names a destination, because that can move a branch.
 *
 * @param {string[]} rest
 * @returns {string | undefined}
 */
function checkFetch(rest) {
  const clustered = (/** @type {string} */ arg) =>
    /^-[a-zA-Z]+$/.test(arg) && /[ptPfu]/.test(arg);
  const writes = rest.some(
    (arg) =>
      /^(--prune|--tags|--force|--update-head-ok|--set-upstream|--refmap|--multiple)/.test(
        arg,
      ) || clustered(arg),
  );
  if (writes) {
    return "git fetch with --prune, --tags, --force or -u can move a branch or a tag; fetch only pull/<n>/head";
  }
  const refspecs = rest.filter((arg) => !arg.startsWith("-")).slice(1);
  return refspecs.some((spec) => spec.startsWith("+") || spec.includes(":"))
    ? "git fetch with a refspec that names a destination can move a branch; fetch only pull/<n>/head"
    : undefined;
}

/**
 * Decides on a command that writes to the working tree: only in a worktree
 * under `.claude/worktrees/`, and `checkout` and `switch` only to restore
 * files or check out a detached commit, never to create or move a branch.
 *
 * @param {string} sub
 * @param {string[]} rest
 * @param {Walk} walk
 * @param {GitOptions} options
 * @returns {string | undefined}
 */
function checkInWorktree(sub, rest, walk, options) {
  const here = resolvePath(options.cwd, null, walk.context.platform);
  if (options.redirected || !isInside(here, walk.context, 1)) {
    return `git ${sub} changes the working tree, so it may run only inside a worktree under .claude/worktrees/<name>/ (use cd or git -C)`;
  }
  if (sub !== "checkout" && sub !== "switch") {
    return undefined;
  }
  if (rest.some((arg) => MAKES_BRANCH.test(arg))) {
    return `git ${sub} with a branch option creates or resets a branch; use --detach, or git restore for files`;
  }
  const detached = rest.some((arg) => arg === "--detach" || arg === "-d");
  const restoresFiles = sub === "checkout" && rest.includes("--");
  return detached || restoresFiles
    ? undefined
    : `git ${sub} here must be detached (--detach) or restore files after --, because naming a branch can create or move one`;
}

/**
 * Decides on `git worktree`: a reviewer may list, and add a detached worktree
 * or remove one, under `.claude/worktrees/`.
 *
 * @param {string[]} args The words after `worktree`.
 * @param {Walk} walk
 * @param {string | null} cwd
 * @returns {string | undefined}
 */
function checkWorktree(args, walk, cwd) {
  const action = args[0] ?? "";
  if (action === "list") {
    return undefined;
  }
  if (action !== "add" && action !== "remove") {
    return `git worktree ${action} is not allowed; a reviewer may only list, add --detach and remove worktrees`;
  }
  const options = args.slice(1).filter((arg) => arg.startsWith("-"));
  const target = args.slice(1).find((arg) => !arg.startsWith("-"));
  const place = resolvePath(target, cwd, walk.context.platform, true);
  if (!isInside(place, walk.context, 1)) {
    return `git worktree ${action} works only on a folder under .claude/worktrees/<name>/`;
  }
  if (action === "remove") {
    return options.some((option) => /^(-f|--force)/.test(option))
      ? "git worktree remove --force can discard a dirty worktree; stop and report its path instead"
      : undefined;
  }
  if (options.some((option) => /^-[bB]/.test(option))) {
    return "git worktree add -b creates a branch, which is shared state; use git worktree add --detach";
  }
  return options.includes("--detach")
    ? undefined
    : "git worktree add needs --detach, because a worktree on a branch changes the branch list";
}

/**
 * The checks for `git` commands that read or write depending on their words.
 *
 * @type {Map<string, (rest: string[]) => string | undefined>}
 */
const GIT_CHECKS = new Map([
  ["branch", checkBranch],
  ["fetch", checkFetch],
  [
    "tag",
    (rest) =>
      rest.some((arg) => /^(-l|--list)$/.test(arg)) ? undefined : TAG_WHY,
  ],
  [
    "remote",
    (rest) =>
      rest.every((arg) => /^(-v|--verbose|show|get-url)$/.test(arg))
        ? undefined
        : REMOTE_WHY,
  ],
  [
    "config",
    (rest) =>
      rest.some((arg) => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(arg))
        ? undefined
        : CONFIG_WHY,
  ],
]);

/**
 * Decides on a `git` command.
 *
 * @param {string[]} args The words after `git`.
 * @param {Walk} walk
 * @returns {string | undefined}
 */
export function checkGit(args, walk) {
  const options = readGitOptions(args, walk);
  const { cwd, sub, rest } = options;
  if (options.reason !== undefined) {
    return options.reason;
  }
  if (rest.some((arg) => arg.startsWith("--output"))) {
    return "git --output writes a file; read the diff from the output instead";
  }
  if (rest.some((arg) => RUNS_CODE.test(arg))) {
    return "that git option can run a program or move a ref, so a reviewer may not use it";
  }
  if (GIT_READ.has(sub)) {
    return undefined;
  }
  if (GIT_IN_WORKTREE.has(sub)) {
    return checkInWorktree(sub, rest, walk, options);
  }
  if (sub === "worktree") {
    return checkWorktree(rest, walk, cwd);
  }
  const check = GIT_CHECKS.get(sub);
  if (check !== undefined) {
    return check(rest);
  }
  return (
    GIT_WHY.get(sub) ??
    `git ${sub} is not on the list of read-only git commands a reviewer may run`
  );
}
