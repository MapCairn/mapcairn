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
 * wrapper with options, a shell without a leading `-c`, `rsync`, `scp`, and a command longer than
 * `MAX_COMMAND_LENGTH` or with more than `MAX_STATEMENTS` statements.
 */
import { checkGh } from "./guardGh.mjs";
import { checkGit } from "./guardGit.mjs";
import { canWrite, isInside, resolvePath, show } from "./guardPaths.mjs";
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

/**
 * Words that start a statement without being the command. `noglob`,
 * `nocorrect` and `-` are zsh precommand modifiers that pass the rest of the
 * statement through, so the words after them are read as the statement.
 */
const KEYWORDS = new Set([
  "noglob",
  "nocorrect",
  "-",
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
const WRITES_LAST = new Set(["cp", "ln", "install"]);

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
  "taskset",
  "arch",
  "ssh",
  "unshare",
  "chroot",
  "nsenter",
  "chrt",
  "unbuffer",
  "rlwrap",
  "coproc",
  "repeat",
  "select",
  "foreach",
  "function",
  "rsync",
  "scp",
];

/**
 * Programs whose words are assignments to variables: the shell builtins that
 * set them, and `make`, which exports a variable given on its command line to
 * every recipe it runs. Other programs may be given `PATH=` as an ordinary
 * argument (`grep 'PATH=' .github`), so their words are not read as assignments.
 */
const ASSIGNERS = new Set([
  "export",
  "declare",
  "typeset",
  "local",
  "readonly",
  "integer",
  "float",
  "make",
  "gmake",
]);

/**
 * The start of an assignment: a name, an optional array index, an optional `+`
 * for append, then `=`.
 */
const ASSIGNMENT = String.raw`(?:\[[^\]]*\])?\+?=`;

/** Shells that run the text after `-c` as a command. */
const SHELLS = [
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "fish",
  "csh",
  "tcsh",
  "mksh",
  "ash",
];

/**
 * What may follow `LESS` in the name of a variable that `less` reads (its
 * manual lists them), as an alternation. `LESS` alone is risky too, and a name
 * such as `LESSON` is not on the list.
 */
const LESS_NAMES = [
  "OPEN",
  "CLOSE",
  "KEY",
  "KEY_SYSTEM",
  "KEY_CONTENT",
  "KEY_CONTENT_SYSTEM",
  "KEYIN",
  "KEYIN_SYSTEM",
  "CHARSET",
  "CHARDEF",
  "UTFCHARDEF",
  "BINFMT",
  "UTFBINFMT",
  "EDIT",
  "ECHO",
  "COLOR",
  "COLORING",
  "HISTFILE",
  "HISTSIZE",
  "SECURE",
  "ANSIENDCHARS",
  "ANSIMIDCHARS",
  "GLOBALTAGS",
  "METACHARS",
  "METAESCAPE",
  "NOCONFIG",
].join("|");

/**
 * Variables that change what a command runs or which files it reads, so a
 * reviewer may not set them: git's, the home and config folders, the search
 * path, pagers and editors, and the loader and startup-file variables.
 */
const RISKY_VARIABLE = new RegExp(
  `^(?:GIT_\\w*|HOME|XDG_\\w*|PATH|PAGER|EDITOR|VISUAL|LESS(?:${LESS_NAMES})?|LD_\\w*|DYLD_\\w*|GH_\\w*|BROWSER|NODE_OPTIONS|NODE_PATH|NPM_CONFIG_\\w*|PYTHON(?:STARTUP|PATH|HOME)|PERL5(?:OPT|LIB)|RUBY(?:OPT|LIB)|ZDOTDIR|SHELLOPTS|BASHOPTS|PROMPT_COMMAND|IFS|CDPATH|PS4|BASH_ENV|ENV|SSH_\\w*)${ASSIGNMENT}`,
  "i",
);

/** Package-manager commands that add a package when given a name. */
const INSTALLS_PACKAGES = new Set([
  "install",
  "i",
  "add",
  "update",
  "up",
  "upgrade",
]);

/** Package-manager commands that run install scripts unless told not to. */
const RUNS_SCRIPTS = new Set(["install", "i", "ci"]);

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
    if (canWrite(place, walk.context)) {
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
  if (program === "mv") {
    const moved = targetDirectory(args);
    const folder = moved.folder === undefined ? [] : [moved.folder];
    return {
      targets: [...positional, ...folder],
      sources: [],
      missing: moved.found && moved.folder === undefined,
    };
  }
  if (!WRITES_LAST.has(program)) {
    return { targets: positional, sources: [], missing: false };
  }
  const directory = targetDirectory(args);
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
    if (/^(-l|--line-length)$/.test(arg)) {
      index += 1;
    } else if (/^(-[nEsrzu]*e|--expression)$/.test(arg)) {
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
  if (args.some((arg) => /^(-g|--global|--prefix|--location)/.test(arg))) {
    return `${program} with -g, --global, --prefix or --location installs outside the worktree`;
  }
  const at = args.findIndex((arg) => PACKAGE_WRITES.has(arg));
  const verb = args[at] ?? "";
  if (at === -1) {
    return undefined;
  }
  const here = resolvePath(walk.cwd, null, walk.context.platform);
  if (!isInside(here, walk.context, 1)) {
    return `${program} ${verb} changes node_modules or the lockfile, so it may run only inside a worktree under .claude/worktrees/<name>/`;
  }
  const named = args.slice(at + 1).some((arg) => !arg.startsWith("-"));
  if (named && INSTALLS_PACKAGES.has(verb)) {
    return `${program} ${verb} with a package name adds a dependency, which a reviewer may not do`;
  }
  return RUNS_SCRIPTS.has(verb) && !args.includes("--ignore-scripts")
    ? `${program} ${verb} needs --ignore-scripts, because install scripts run code`
    : undefined;
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

/** Short options of a shell that change nothing the guard has to read. */
const PLAIN_SHELL_OPTIONS = /^-[abefhilmnpuvxc]+$/;

/** Long options of a shell that change nothing the guard has to read. */
const PLAIN_LONG_SHELL_OPTIONS = /^--(norc|noprofile|posix|login|restricted)$/;

/**
 * Reads the options at the front of a shell's words, up to the first operand
 * (or `--`). Only these set the command: `-c` after the script runs the script.
 *
 * @param {string[]} args
 * @returns {{ command: boolean, operand: number, reason?: string }}
 */
function readShellOptions(args) {
  let command = false;
  let interactive = false;
  let index = 0;
  for (; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      index += 1;
      break;
    }
    if (!/^[-+]./.test(arg)) {
      break;
    }
    if (!PLAIN_SHELL_OPTIONS.test(arg) && !PLAIN_LONG_SHELL_OPTIONS.test(arg)) {
      return {
        command,
        operand: index,
        reason: `the shell option ${arg} can load a start-up file or run a command the guard cannot read`,
      };
    }
    command ||= /^-[a-z]*c/.test(arg);
    interactive ||= /^-[a-z]*i/.test(arg);
  }
  return interactive && command
    ? {
        command,
        operand: index,
        reason:
          "an interactive shell with -c reads start-up files the guard cannot read",
      }
    : { command, operand: index };
}

/**
 * Decides on a shell: only one started with `-c` among its leading options can
 * be read, and its command is read as one of ours, a level deeper.
 *
 * @param {string} program
 * @param {string[]} args
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function checkShell(program, args, walk) {
  if (program === "fish" && !(args.length === 2 && args[0] === "-c")) {
    return "fish is read only as -c and one command string, because its options (-C, --init-command) run commands the guard cannot read";
  }
  const { command, operand, reason } = readShellOptions(args);
  if (reason !== undefined) {
    return reason;
  }
  if (!command) {
    return `${program} without -c among its leading options runs a script or reads commands the guard cannot see, so a reviewer may not use it`;
  }
  return checkCommand(args[operand] ?? "", { ...walk, depth: walk.depth + 1 });
}

/**
 * Decides on `set`: keyword mode (`-k`, `-o keyword`) hands later words that
 * look like assignments to the next command as variables.
 *
 * @param {string[]} args
 * @returns {string | undefined}
 */
function checkSet(args) {
  return args.some((arg) => /^-[a-zA-Z]*k/.test(arg) || arg === "keyword")
    ? "set -k (keyword mode) passes assignments in a command's words to it as variables, so a reviewer may not use it"
    : undefined;
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
  ["set", (args) => checkSet(args)],
  ["dd", (args, walk, program) => checkFileCommand(program, args, walk)],
]);

for (const program of UNREADABLE) {
  PROGRAMS.set(program, (_args, _walk, name) => unreadable(name));
}
for (const program of [...WRITES_ALL, ...WRITES_LAST]) {
  PROGRAMS.set(program, (args, walk) => checkFileCommand(program, args, walk));
}
for (const program of SHELLS) {
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
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]+\])?\+?=/.test(word);
}

/**
 * Whether `env` takes a word as a setting: any word with an `=` that is not an
 * option, whatever its name (`X.Y=1`), because `env` does not check the name.
 *
 * @param {string} word
 * @returns {boolean}
 */
function isEnvSetting(word) {
  return !word.startsWith("-") && word.includes("=");
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
  while (isEnvSetting(words[next] ?? "")) {
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
  return canWrite(place, walk.context)
    ? undefined
    : `the redirection ${op} ${target} would write outside .claude/worktrees/<name>/ and the session scratchpad`;
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
 * @param {import("./guardPaths.mjs").Platform} platform
 * @returns {string | undefined}
 */
function builtProgramProblem(word, platform) {
  if (word === "[" || word === "[[") {
    return undefined;
  }
  const windowsPath = platform === "win32" && /^[a-zA-Z]:\\/.test(word);
  return /[$`{*?[]/.test(word) || (word.includes("\\") && !windowsPath)
    ? `${word} is built or escaped by the shell (a variable, a glob, a brace list or a backslash), so the program it runs cannot be read`
    : undefined;
}

/** A variable name with a subscript that is not a plain number. */
const UNSAFE_SUBSCRIPT = /^[A-Za-z_][A-Za-z0-9_]*\[(?![0-9]+\])/;

/**
 * Why a `[[ ... ]]` cannot be read: in zsh a command may follow `]]` as a
 * short form of `if`, so `]]` must be the last word.
 *
 * @param {string[]} words
 * @returns {string | undefined}
 */
function testBracketProblem(words) {
  return words[0] === "[[" && words[words.length - 1] !== "]]"
    ? "[[ is allowed only when ]] is its last word, because zsh runs a command written after it"
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
  const { rest, reason, assignments } = unwrap(redirects.words);
  const assigned = ASSIGNERS.has(programName(rest[0] ?? ""))
    ? [...assignments, ...rest.slice(1)]
    : assignments;
  const risky = assigned.find((text) => RISKY_VARIABLE.test(text));
  if (risky !== undefined) {
    return `the variable ${risky.split("=")[0]} changes what a command runs or which files it reads (git's repository, the home folder, the search path, a pager, the loader), so a reviewer may not set it`;
  }
  const subscript = ASSIGNERS.has(programName(rest[0] ?? ""))
    ? rest.slice(1).find((text) => UNSAFE_SUBSCRIPT.test(text))
    : undefined;
  if (subscript !== undefined) {
    return `${subscript} has a subscript that is not a number, which the shell evaluates as arithmetic and can run a command`;
  }
  const word = rest[0] ?? "";
  const program = programName(word);
  return (
    reason ??
    testBracketProblem(rest) ??
    builtProgramProblem(word, walk.context.platform) ??
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
  const { statements, unterminated, expands, glued } = tokenize(command);
  if (unterminated) {
    return "a here-document is never closed, so what follows it cannot be told from its body";
  }
  if (expands) {
    return "an unquoted here-document body holds a command substitution, which the shell runs; quote the delimiter ('EOF')";
  }
  if (glued) {
    return "a backtick command substitution is joined to a word, which can build a program name the guard cannot read";
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
