// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The rules `guardWrites.mjs` applies to a shell command run by a read-only
 * reviewer: which file commands it may run, where it may redirect output, and
 * which wrappers and programs the guard cannot read. `guardGit.mjs` and
 * `guardGh.mjs` hold the rules for `git` and `gh`. Each check returns the
 * reason a statement is blocked, or nothing. Reasons name the command and say
 * why, because a reviewer that is blocked has to report it, not work around it.
 *
 * A reviewer may run what only reads, and may change a worktree of its own
 * under `.claude/worktrees/<name>/`. Everything else that writes to the
 * repository, to the remote or to GitHub is blocked. What the guard cannot
 * read it refuses: a program named by a variable, a glob or a brace list, a
 * wrapper with options, a shell without `-c`, and a command longer than
 * `MAX_COMMAND_LENGTH` or with more than `MAX_STATEMENTS` statements.
 */
import { checkGh } from "./guardGh.mjs";
import { checkGit } from "./guardGit.mjs";
import { isInside, resolvePath, show } from "./guardPaths.mjs";
import { awkProblem, sedProblem } from "./scriptChecks.mjs";
import { tokenize } from "./shellTokens.mjs";

/**
 * The state while a command is read: where the shell is after the `cd`
 * commands so far (`null` when that is not known), the system, and how many
 * shells deep the command is.
 *
 * @typedef {object} Walk
 * @property {string | null} cwd
 * @property {import("./guardPaths.mjs").Context} context
 * @property {number} depth
 */

/**
 * @typedef {import("./shellTokens.mjs").Token} Token
 */

/** A longer command is refused: it is not a command a reviewer needs. */
export const MAX_COMMAND_LENGTH = 65536;

/** A command with more statements is refused, for the same reason. */
export const MAX_STATEMENTS = 500;

/** A file command that names more paths than this is refused. */
const MAX_TARGETS = 200;

/** How many `sh -c` levels are read before the command is refused. */
const MAX_SHELL_DEPTH = 4;

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

/** Commands that write to the last path they are given, or to the `-t` folder. */
const WRITES_LAST = new Set(["cp", "ln", "install", "rsync"]);

/** Programs that run another command in a way the guard cannot read. */
const UNREADABLE = [
  "xargs",
  "eval",
  "sudo",
  "doas",
  "su",
  "pwsh",
  "powershell",
  "cmd",
  "watch",
  "script",
  "flock",
  "caffeinate",
  "parallel",
  "source",
  ".",
  "stdbuf",
  "setsid",
  "ionice",
  "strace",
  "busybox",
];

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
 * @param {string} program
 * @returns {string}
 */
function unreadable(program) {
  return `${program} runs a command the guard cannot read, so a reviewer may not use it`;
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
  if (targets.length > MAX_TARGETS) {
    return `${program} names too many paths to check (over ${MAX_TARGETS})`;
  }
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
 * The folder named by `-t`, `-tDIR`, `--target-directory=DIR` or
 * `--target-directory DIR`, in the words of a `cp`, `ln` or `install`.
 *
 * @param {string[]} args
 * @returns {{ found: boolean, folder: string | undefined }}
 */
function targetDirectory(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const long = /^--target-directory(?:=(.*))?$/.exec(arg);
    const short = /^-[a-zA-Z]*?t(.*)$/.exec(arg);
    if (long) {
      return { found: true, folder: long[1] ?? args[index + 1] };
    }
    if (short && !arg.startsWith("--")) {
      return { found: true, folder: short[1] || args[index + 1] };
    }
  }
  return { found: false, folder: undefined };
}

/**
 * Decides on `ln`: a link inside a worktree must point inside it, because a
 * later write through the link would land outside. A relative source is
 * refused, because it is read from the link's folder, not the shell's.
 *
 * @param {string[]} sources
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkLinkSources(sources, walk) {
  for (const source of sources) {
    const place = resolvePath(source, walk.cwd, walk.context.platform, true);
    const absolute = /^([/\\]|[a-zA-Z]:)/.test(source);
    if (!absolute || !isInside(place, walk.context, 1)) {
      return `ln would link to ${source}, which is not an absolute path inside .claude/worktrees/<name>/; a write through the link would land outside`;
    }
  }
  return undefined;
}

/**
 * The paths a file command writes to, and the paths it links to.
 *
 * @param {string} program
 * @param {string[]} args
 * @returns {{ targets: string[], sources: string[], missing: boolean }}
 */
function pathTargets(program, args) {
  if (program === "dd") {
    const targets = args
      .filter((arg) => arg.startsWith("of="))
      .map((arg) => arg.slice(3));
    return { targets, sources: [], missing: false };
  }
  const dashes = args.indexOf("--");
  const positional = args.filter((arg, index) =>
    dashes === -1 ? !arg.startsWith("-") : index > dashes,
  );
  if (!WRITES_LAST.has(program)) {
    return { targets: positional, sources: [], missing: false };
  }
  const directory =
    program === "rsync"
      ? { found: false, folder: undefined }
      : targetDirectory(args);
  if (directory.found) {
    const skip = directory.folder === undefined ? [] : [directory.folder];
    const sources = positional.filter((arg) => !skip.includes(arg));
    return { targets: skip, sources, missing: directory.folder === undefined };
  }
  return {
    targets: positional.slice(-1),
    sources: positional.slice(0, -1),
    missing: false,
  };
}

/**
 * Decides on a command that writes to files: `rm`, `cp`, `ln`, `tee` and so on.
 *
 * @param {string} program
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkFileCommand(program, args, walk) {
  const { targets, sources, missing } = pathTargets(program, args);
  if (missing) {
    return `${program} -t without a folder cannot be checked`;
  }
  return (
    checkPathWrites(program, targets, walk) ??
    (program === "ln" ? checkLinkSources(sources, walk) : undefined)
  );
}

/**
 * Decides on `sed`: its script may not write or run a command, and an
 * in-place edit may only change files inside a worktree. The files are the
 * words that are not options, after the script unless one is given with `-e`.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkSed(args, walk) {
  /** @type {string[]} */
  const scripts = [];
  /** @type {string[]} */
  const files = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (/^(-[nEsrzu]*e|--expression)$/.test(arg)) {
      scripts.push(args[index + 1] ?? "");
      index += 1;
    } else if (/^(-[a-zA-Z]*f|--file)/.test(arg)) {
      return "sed with a script file cannot be read";
    } else if (arg.startsWith("--expression=")) {
      scripts.push(arg.slice("--expression=".length));
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }
  if (scripts.length === 0) {
    scripts.push(files.shift() ?? "");
  }
  const problem = scripts.map(sedProblem).find((found) => found !== undefined);
  const inPlace = args.some(
    (arg) => /^-[a-zA-Z]*i/.test(arg) || arg.startsWith("--in-place"),
  );
  return (
    problem ??
    (inPlace ? checkPathWrites("an in-place edit", files, walk) : undefined)
  );
}

/**
 * Decides on `perl`: only an in-place edit is read, and a script is not, so
 * `perl -e` is a known gap listed in the guide.
 *
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkPerl(args, walk) {
  const inPlace = args.some((arg) => /^-[a-zA-Z]*i/.test(arg));
  const files = args.filter((arg) => !arg.startsWith("-")).slice(1);
  return inPlace ? checkPathWrites("an in-place edit", files, walk) : undefined;
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
  const here = resolvePath(walk.cwd, null, walk.context.platform);
  return !PACKAGE_WRITES.has(verb) || isInside(here, walk.context, 1)
    ? undefined
    : `${program} ${verb} changes node_modules or the lockfile, so it may run only inside a worktree under .claude/worktrees/<name>/`;
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
 * Decides on a shell: only one started with `-c` can be read, and its command
 * is read as one of ours, a level deeper.
 *
 * @param {string} program
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkShell(program, args, walk) {
  const flag = args.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
  if (flag === -1) {
    return `${program} without -c runs a script or reads commands the guard cannot see, so a reviewer may not use it`;
  }
  return checkCommand(args[flag + 1] ?? "", { ...walk, depth: walk.depth + 1 });
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
  ["sed", checkSed],
  ["perl", checkPerl],
  ["awk", (args) => awkProblem(args)],
  ["gawk", (args) => awkProblem(args)],
  ["find", (args) => checkFind(args)],
  ["dd", (args, walk, program) => checkFileCommand(program, args, walk)],
]);

for (const program of UNREADABLE) {
  PROGRAMS.set(program, (_args, _walk, name) => unreadable(name));
}
for (const program of [...WRITES_ALL, ...WRITES_LAST]) {
  PROGRAMS.set(program, (args, walk) => checkFileCommand(program, args, walk));
}
for (const program of ["sh", "bash", "zsh", "dash", "ksh"]) {
  PROGRAMS.set(program, (args, walk) => checkShell(program, args, walk));
}
for (const program of ["npm", "pnpm", "yarn", "bun"]) {
  PROGRAMS.set(program, (args, walk) =>
    checkPackageManager(program, args, walk),
  );
}

/**
 * @param {string} word
 * @returns {boolean}
 */
function isAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

/**
 * What a wrapper leaves: where the wrapped command starts, the assignments it
 * collected, or why it cannot be read.
 *
 * @typedef {{ next: number, assignments?: string[], reason?: string }} Unwrapped
 */

/**
 * `command`, `builtin`, `exec`, `nohup` and `time`: read only when they have no
 * option, because an option (`command -p`, `exec -a name`) changes what runs.
 *
 * @param {string[]} words
 * @param {number} at The word after the wrapper.
 * @returns {Unwrapped}
 */
function plainWrapper(words, at) {
  return (words[at] ?? "").startsWith("-")
    ? {
        next: at,
        reason: `${programName(words[at - 1] ?? "")} with an option cannot be read`,
      }
    : { next: at };
}

/**
 * `env`: assignments are collected; any option (`-u`, `-S`, `-i`) cannot be read.
 *
 * @param {string[]} words
 * @param {number} at
 * @returns {Unwrapped}
 */
function envWrapper(words, at) {
  /** @type {string[]} */
  const assignments = [];
  let next = at;
  while (isAssignment(words[next] ?? "")) {
    assignments.push(words[next] ?? "");
    next += 1;
  }
  return (words[next] ?? "").startsWith("-")
    ? { next, assignments, reason: "env with an option cannot be read" }
    : { next, assignments };
}

/**
 * `nice`: `-n <level>` and `-<level>` are read; any other option cannot be.
 *
 * @param {string[]} words
 * @param {number} at
 * @returns {Unwrapped}
 */
function niceWrapper(words, at) {
  const first = words[at] ?? "";
  if (first === "-n") {
    return { next: at + 2 };
  }
  if (/^-\d+$/.test(first)) {
    return { next: at + 1 };
  }
  return first.startsWith("-")
    ? { next: at, reason: "nice with that option cannot be read" }
    : { next: at };
}

/**
 * `timeout`: its options, then the duration.
 *
 * @param {string[]} words
 * @param {number} at
 * @returns {Unwrapped}
 */
function timeoutWrapper(words, at) {
  let next = at;
  while ((words[next] ?? "").startsWith("-")) {
    next += /^(-s|-k|--signal|--kill-after)$/.test(words[next] ?? "") ? 2 : 1;
  }
  return { next: next + 1 };
}

/** The wrappers that run the next command, by name. */
const WRAPPERS = new Map([
  ["command", plainWrapper],
  ["builtin", plainWrapper],
  ["exec", plainWrapper],
  ["nohup", plainWrapper],
  ["time", plainWrapper],
  ["env", envWrapper],
  ["nice", niceWrapper],
  ["timeout", timeoutWrapper],
]);

/**
 * Takes the words that only wrap a command (`env`, `timeout`, a variable
 * assignment, a shell keyword) off the front of a statement, and says why one
 * cannot be read.
 *
 * @param {string[]} words
 * @returns {{ rest: string[], assignments: string[], reason?: string }}
 */
function unwrap(words) {
  /** @type {string[]} */
  const assignments = [];
  let at = 0;
  for (;;) {
    const first = words[at] ?? "";
    const wrapper = WRAPPERS.get(programName(first));
    if (isAssignment(first)) {
      assignments.push(first);
      at += 1;
    } else if (KEYWORDS.has(first)) {
      at += 1;
    } else if (wrapper === undefined) {
      return { rest: words.slice(at), assignments };
    } else {
      const result = wrapper(words, at + 1);
      assignments.push(...(result.assignments ?? []));
      if (result.reason !== undefined) {
        return { rest: [], assignments, reason: result.reason };
      }
      at = result.next;
    }
  }
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
 * Why the word that names the program cannot be trusted to be that program: a
 * variable, a glob, a brace list or a quoted escape that the shell expands.
 *
 * @param {string} word
 * @returns {string | undefined}
 */
function builtProgramProblem(word) {
  return /[$`{*?[]/.test(word)
    ? `${word} is built by the shell (a variable, a glob or a brace list), so the program it runs cannot be read`
    : undefined;
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
  if (redirects.words.some((text) => /^GIT_\w*=/i.test(text))) {
    return "a GIT_ variable can point git at another repository or make it run a program, so a reviewer may not set one";
  }
  const { rest, reason } = unwrap(redirects.words);
  const word = rest[0] ?? "";
  const program = programName(word);
  return (
    reason ??
    builtProgramProblem(word) ??
    PROGRAMS.get(program)?.(rest.slice(1), walk, program)
  );
}

/**
 * Decides on a whole shell command.
 *
 * @param {string} command
 * @param {Walk} walk
 * @returns {string | undefined} The reason it is blocked, or nothing.
 */
export function checkCommand(command, walk) {
  if (walk.depth > MAX_SHELL_DEPTH) {
    return `shells are nested more than ${MAX_SHELL_DEPTH} deep, which the guard does not read`;
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return `the command is too long to check (over ${MAX_COMMAND_LENGTH} characters)`;
  }
  const { statements, unterminated } = tokenize(command);
  if (unterminated) {
    return "a here-document is never closed, so what follows it cannot be told from its body";
  }
  if (statements.length > MAX_STATEMENTS) {
    return `the command has too many statements to check (over ${MAX_STATEMENTS})`;
  }
  for (const statement of statements) {
    const reason = checkStatement(statement, walk);
    if (reason !== undefined) {
      return reason;
    }
  }
  return undefined;
}
