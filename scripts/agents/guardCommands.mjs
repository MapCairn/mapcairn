// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The rules `guardWrites.mjs` applies to a shell command run by a read-only
 * reviewer: which `git`, `gh` and file commands it may run, and where it may
 * redirect output. Each check returns the reason a statement is blocked, or
 * nothing. Reasons name the command and say why, because a reviewer that is
 * blocked has to report it, not work around it.
 *
 * A reviewer may run what only reads, and may change a worktree of its own
 * under `.claude/worktrees/<name>/`. Everything else that writes to the
 * repository, to the remote or to GitHub is blocked.
 */
import { isInside, resolvePath, show } from "./guardPaths.mjs";
import { tokenize } from "./shellTokens.mjs";

/**
 * The state while a command is read: where the shell is after the `cd`
 * commands so far (`null` when that is not known), and the system.
 *
 * @typedef {object} Walk
 * @property {string | null} cwd
 * @property {import("./guardPaths.mjs").Context} context
 */

/**
 * @typedef {import("./shellTokens.mjs").Token} Token
 */

/** Output a command may write to without touching a file. */
const NULL_DEVICES = new Set(["/dev/" + "null", "/dev/stdout", "/dev/stderr"]);

/** Words that start a statement without being the command. */
const KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "!",
  "{",
  "}",
  "fi",
  "done",
]);

/** `git` commands that only read, and may be run anywhere. */
const GIT_READ = new Set([
  "status",
  "log",
  "diff",
  "show",
  "fetch",
  "rev-parse",
  "rev-list",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "cat-file",
  "blame",
  "grep",
  "merge-base",
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

/** Commands that write to every path they are given. */
const WRITES_ALL = new Set([
  "rm",
  "rmdir",
  "unlink",
  "mv",
  "touch",
  "mkdir",
  "chmod",
  "chown",
  "chgrp",
  "truncate",
  "shred",
  "tee",
]);

/** Commands that write to the last path they are given. */
const WRITES_LAST = new Set(["cp", "ln", "install", "rsync"]);

/** Package-manager commands that change `node_modules` or a lockfile. */
const PACKAGE_WRITES = new Set([
  "install",
  "i",
  "ci",
  "add",
  "remove",
  "rm",
  "uninstall",
  "un",
  "update",
  "up",
  "upgrade",
  "link",
  "ln",
  "unlink",
  "prune",
  "dedupe",
  "rebuild",
  "rb",
]);

/** `gh` words that read, as the second word of a command (`gh pr view`). */
const GH_READ_VERBS = new Set(["view", "list", "diff", "checks", "status"]);

/**
 * The name of a program as it is run, without folders or an extension.
 *
 * @param {string} word
 * @returns {string}
 */
function programName(word) {
  const base = word.replaceAll("\\", "/").split("/").pop() ?? "";
  return base.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

/**
 * Whether the shell is, after the commands so far, inside a worktree.
 *
 * @param {string | null} cwd
 * @param {Walk} walk
 * @returns {boolean}
 */
function inWorktree(cwd, walk) {
  const here = resolvePath(cwd, null, walk.context.platform);
  return isInside(here, walk.context, 1);
}

/**
 * Reads the options before a `git` subcommand: `-C <folder>` moves the
 * working directory, `--git-dir` and `--work-tree` make it unknowable.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {{ cwd: string | null, redirected: boolean, sub: string, rest: string[] }}
 */
function readGitOptions(args, walk) {
  let cwd = walk.cwd;
  let redirected = false;
  let index = 0;
  while ((args[index] ?? "").startsWith("-")) {
    const option = args[index] ?? "";
    if (option === "-C") {
      const target = resolvePath(
        args[index + 1],
        cwd,
        walk.context.platform,
        true,
      );
      cwd = target === undefined ? null : show(target);
    }
    const takesValue =
      /^(-C|-c|--namespace|--exec-path|--git-dir|--work-tree)$/.test(option);
    redirected ||= /^--(git-dir|work-tree)/.test(option);
    index += takesValue ? 2 : 1;
  }
  return {
    cwd,
    redirected,
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
function checkGit(args, walk) {
  const { cwd, redirected, sub, rest } = readGitOptions(args, walk);
  if (rest.some((arg) => arg.startsWith("--output"))) {
    return "git --output writes a file; read the diff from the output instead";
  }
  if (GIT_READ.has(sub)) {
    return undefined;
  }
  if (GIT_IN_WORKTREE.has(sub)) {
    return !redirected && inWorktree(cwd, walk)
      ? undefined
      : `git ${sub} changes the working tree, so it may run only inside a worktree under .claude/worktrees/<name>/ (use cd or git -C)`;
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

/**
 * Decides on `gh api`, which reads unless it uses a method other than GET or
 * sends fields (which makes it a POST).
 *
 * @param {string[]} args The words after `api`.
 * @returns {string | undefined}
 */
function checkGhApi(args) {
  let method = "";
  let fields = false;
  args.forEach((arg, index) => {
    const inline = /^(?:-X|--method)=?(.+)$/.exec(arg);
    if (arg === "-X" || arg === "--method") {
      method = args[index + 1] ?? "";
    } else if (inline) {
      method = inline[1] ?? "";
    }
    fields ||= /^(-[fF]|--field|--raw-field|--input)(=|$)|^-[fF]./.test(arg);
  });
  if (method !== "" && method.toUpperCase() !== "GET") {
    return `gh api with the method ${method.toUpperCase()} writes to GitHub`;
  }
  return fields && method === ""
    ? "gh api with a field or input sends a POST, which writes to GitHub; add -X GET to read"
    : undefined;
}

/**
 * Decides on a `gh` command: a reviewer reads GitHub and never writes to it.
 *
 * @param {string[]} args The words after `gh`.
 * @returns {string | undefined}
 */
function checkGh(args) {
  const first = args[0] ?? "";
  if (first.startsWith("-") && !/^(--version|--help|-h)$/.test(first)) {
    return "put the gh command before its options, so it can be checked";
  }
  const [noun, verb = ""] = args.filter((arg) => !arg.startsWith("-"));
  if (noun === undefined || noun === "search") {
    return undefined;
  }
  if (noun === "api") {
    return checkGhApi(args.slice(args.indexOf("api") + 1));
  }
  return GH_READ_VERBS.has(verb)
    ? undefined
    : `gh ${noun} ${verb} can change GitHub; a reviewer only reads (view, list, diff, checks, status)`;
}

/**
 * The paths a file command writes to.
 *
 * @param {string} program
 * @param {string[]} args
 * @returns {string[]}
 */
function pathTargets(program, args) {
  if (program === "dd") {
    return args
      .filter((arg) => arg.startsWith("of="))
      .map((arg) => arg.slice(3));
  }
  const dashes = args.indexOf("--");
  const positional = args.filter((arg, index) =>
    dashes === -1 ? !arg.startsWith("-") : index > dashes,
  );
  return WRITES_LAST.has(program) ? positional.slice(-1) : positional;
}

/**
 * Decides on the paths a file command writes to.
 *
 * @param {string} program
 * @param {string[]} targets
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkPathWrites(program, targets, walk) {
  for (const target of targets) {
    const place = resolvePath(target, walk.cwd, walk.context.platform, true);
    if (isInside(place, walk.context, 2)) {
      continue;
    }
    return isInside(place, walk.context, 1)
      ? `${program} on a whole worktree is not allowed; remove one with git worktree remove`
      : `${program} would write to ${target}, which is not a plain path inside .claude/worktrees/<name>/`;
  }
  return undefined;
}

/**
 * Decides on an in-place edit by `sed` or `perl`: its files are the words that
 * are not options, after the script unless one is given with `-e` or `-f`.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkInPlace(args, walk) {
  const inPlace = args.some(
    (arg) => /^-[a-zA-Z]*i/.test(arg) || arg.startsWith("--in-place"),
  );
  if (!inPlace) {
    return undefined;
  }
  const scripted = args.some((arg) =>
    /^(-[a-zA-Z]*[ef]|--expression|--file)/.test(arg),
  );
  const words = args.filter((arg) => !arg.startsWith("-"));
  return checkPathWrites(
    "an in-place edit",
    scripted ? words : words.slice(1),
    walk,
  );
}

/**
 * Decides on `cd`, and remembers where it went.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {undefined}
 */
function changeDirectory(args, walk) {
  const target = args.find((arg) => !arg.startsWith("-") || arg === "-");
  const place =
    target === undefined || target === "-"
      ? undefined
      : resolvePath(target, walk.cwd, walk.context.platform, true);
  walk.cwd = place === undefined ? null : show(place);
  return undefined;
}

/**
 * Decides on `npm`, `pnpm`, `yarn` and `bun`: installing changes
 * `node_modules` and the lockfile, so it may run only in a worktree.
 *
 * @param {string} program
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkPackageManager(program, args, walk) {
  const verb = args.find((arg) => !arg.startsWith("-")) ?? "";
  return !PACKAGE_WRITES.has(verb) || inWorktree(walk.cwd, walk)
    ? undefined
    : `${program} ${verb} changes node_modules or the lockfile, so it may run only inside a worktree under .claude/worktrees/<name>/`;
}

/**
 * @param {string} program
 * @returns {string}
 */
function unreadable(program) {
  return `${program} runs a command the guard cannot read, so a reviewer may not use it`;
}

/**
 * Decides on `find`, which writes with `-delete`, `-exec` and `-fprint`.
 *
 * @param {string[]} args
 * @returns {string | undefined}
 */
function checkFind(args) {
  return args.some((arg) =>
    /^-(delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/.test(arg),
  )
    ? "find with -delete, -exec or -fprint can write; use grep or ls and act on the result yourself"
    : undefined;
}

/**
 * Decides on a shell started with `-c`: its command is read as one of ours.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkShell(args, walk) {
  const flag = args.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
  return flag === -1 ? undefined : checkCommand(args[flag + 1] ?? "", walk);
}

/**
 * The checks by program name, each given the words after the program.
 *
 * @type {Map<string, (args: string[], walk: Walk, program: string) => string | undefined>}
 */
const PROGRAMS = new Map([
  ["cd", changeDirectory],
  ["pushd", changeDirectory],
  ["popd", (_args, walk) => changeDirectory([], walk)],
  ["git", checkGit],
  ["gh", (args) => checkGh(args)],
  ["sed", checkInPlace],
  ["perl", checkInPlace],
  ["find", (args) => checkFind(args)],
  ["xargs", (_args, _walk, program) => unreadable(program)],
  ["eval", (_args, _walk, program) => unreadable(program)],
  ["sudo", (_args, _walk, program) => unreadable(program)],
  ["pwsh", (_args, _walk, program) => unreadable(program)],
  ["powershell", (_args, _walk, program) => unreadable(program)],
  ["cmd", (_args, _walk, program) => unreadable(program)],
  [
    "dd",
    (args, walk, program) =>
      checkPathWrites(program, pathTargets(program, args), walk),
  ],
]);

for (const program of [...WRITES_ALL, ...WRITES_LAST]) {
  PROGRAMS.set(program, (args, walk) =>
    checkPathWrites(program, pathTargets(program, args), walk),
  );
}
for (const program of ["sh", "bash", "zsh", "dash", "ksh"]) {
  PROGRAMS.set(program, checkShell);
}
for (const program of ["npm", "pnpm", "yarn", "bun"]) {
  PROGRAMS.set(program, (args, walk) =>
    checkPackageManager(program, args, walk),
  );
}

/** Wrappers that run the next word as a command and take nothing else. */
const PLAIN_WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "time"]);

/**
 * @param {string} word
 * @returns {boolean}
 */
function isAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

/**
 * Takes the options and assignments after `env` or `stdbuf`.
 *
 * @param {string[]} words The words after the wrapper.
 * @returns {string[]}
 */
function skipOptions(words) {
  let rest = words;
  while ((rest[0] ?? "").startsWith("-") || isAssignment(rest[0] ?? "")) {
    rest = rest.slice(1);
  }
  return rest;
}

/**
 * Takes `-n <level>` or `-<level>` off the front, after `nice`.
 *
 * @param {string[]} words
 * @returns {string[]}
 */
function skipNice(words) {
  if (words[0] === "-n") {
    return words.slice(2);
  }
  return /^-\d+$/.test(words[0] ?? "") ? words.slice(1) : words;
}

/**
 * Takes the words that `nice` and `timeout` use off the front.
 *
 * @type {Record<string, (words: string[]) => string[]>}
 */
const WRAPPERS = {
  env: skipOptions,
  stdbuf: skipOptions,
  nice: skipNice,
  timeout: (words) => {
    let rest = words;
    while ((rest[0] ?? "").startsWith("-")) {
      rest = rest.slice(
        /^(-s|-k|--signal|--kill-after)$/.test(rest[0] ?? "") ? 2 : 1,
      );
    }
    return rest.slice(1);
  },
};

/**
 * Takes one wrapper off the front of a statement, or returns nothing.
 *
 * @param {string[]} words
 * @returns {string[] | undefined}
 */
function stripOnce(words) {
  const first = words[0] ?? "";
  const name = programName(first);
  if (isAssignment(first) || KEYWORDS.has(first) || PLAIN_WRAPPERS.has(name)) {
    return words.slice(1);
  }
  return Object.hasOwn(WRAPPERS, name)
    ? WRAPPERS[name]?.(words.slice(1))
    : undefined;
}

/**
 * Takes the words that only wrap a command (`env`, `timeout`, a variable
 * assignment, a shell keyword) off the front of a statement.
 *
 * @param {string[]} words
 * @returns {string[]}
 */
function unwrap(words) {
  let rest = words;
  for (let next = stripOnce(rest); next !== undefined; next = stripOnce(rest)) {
    rest = next;
  }
  return rest;
}

/**
 * Decides on one redirection.
 *
 * @param {string} op
 * @param {string} target
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkRedirect(op, target, walk) {
  const duplicate = op.endsWith("&") && /^(\d+|-)$/.test(target);
  const windowsNull =
    walk.context.platform === "win32" && target.toLowerCase() === "nul";
  if (duplicate || windowsNull || NULL_DEVICES.has(target)) {
    return undefined;
  }
  const place = resolvePath(target, walk.cwd, walk.context.platform, true);
  return isInside(place, walk.context, 2)
    ? undefined
    : `the redirection ${op} ${target} would write outside .claude/worktrees/<name>/`;
}

/**
 * Splits a statement into its words and the problem with its redirections.
 *
 * @param {Token[]} tokens
 * @param {Walk} walk
 * @returns {{ reason?: string, words: string[] }}
 */
function readRedirects(tokens, walk) {
  /** @type {string[]} */
  const words = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type === "word") {
      words.push(token.text);
    } else if (token?.type === "redirect" && token.op !== "<<") {
      const target = tokens[index + 1];
      index += 1;
      const output = token.op.includes(">") && target?.type === "word";
      const reason = output
        ? checkRedirect(token.op, target.text, walk)
        : undefined;
      if (reason !== undefined) {
        return { reason, words };
      }
    }
  }
  return { words };
}

/**
 * Decides on one statement of a shell command.
 *
 * @param {Token[]} tokens
 * @param {Walk} walk Its `cwd` is updated by `cd`.
 * @returns {string | undefined}
 */
function checkStatement(tokens, walk) {
  const redirects = readRedirects(tokens, walk);
  if (redirects.reason !== undefined) {
    return redirects.reason;
  }
  const words = unwrap(redirects.words);
  const program = programName(words[0] ?? "");
  return PROGRAMS.get(program)?.(words.slice(1), walk, program);
}

/**
 * Decides on a whole shell command.
 *
 * @param {string} command
 * @param {Walk} walk
 * @returns {string | undefined} The reason it is blocked, or nothing.
 */
export function checkCommand(command, walk) {
  for (const statement of tokenize(command)) {
    const reason = checkStatement(statement, walk);
    if (reason !== undefined) {
      return reason;
    }
  }
  return undefined;
}
