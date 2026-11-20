// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The commands a read-only reviewer may run in Bash, as a default-deny
 * allowlist. `guardWrites.mjs` asks this module first: a command that is not
 * on the list is refused, whatever it does. A command that is on it is then
 * read by the older shell rules in `guardCommands.mjs`, which can only add a
 * refusal.
 *
 * A command is read with a strict lexer, not as a shell would read it. It
 * accepts plain words, single-quoted text and double-quoted text with no `$`,
 * backtick, backslash or `!`, separated by spaces, and one `cd <folder> &&`
 * in front for `test-reviewer`. Anything else (`;`, `|`, `&`, a redirection,
 * a here-document, `$`, a backtick, a glob, a brace, `~`, `#`, a tab or a
 * newline, a character outside printable ASCII, empty quotes) is refused
 * before any word is matched, so the list never has to agree with bash or zsh
 * about what such text means.
 *
 * Each entry names the program and its subcommand, the options it accepts
 * (with a check on each value), the operands it accepts, where it may run
 * (anywhere, the project folder only, or inside a worktree under
 * `.claude/worktrees/<name>/`) and whether only `test-reviewer` may run it.
 * An option that is not listed is refused, so a new option of git, gh, grep or
 * rg that runs a program is refused until someone adds it on purpose.
 *
 * To add a command, a reviewer reports the exact command it needed; the
 * maintainer decides whether it joins the list. See "Keeping reviewers
 * read-only" in `docs/guides/working-with-agents.md`.
 */
import { isInside, isProjectRoot, resolvePath, show } from "./guardPaths.mjs";

/** Where the list lives, as the refusal names it. */
export const ALLOWLIST_FILE = "scripts/agents/guardAllowlist.mjs";

/** A longer command is refused: no command on the list needs it. */
const MAX_ALLOWED_LENGTH = 2000;

/** The reviewer that may change a worktree of its own. */
const TEST_REVIEWER = "test-reviewer";

/** What a refusal ends with: how to ask for a command. */
const HOW_TO_ASK = `Reviewers may run only the commands listed in ${ALLOWLIST_FILE}. If you need another, name the exact command under Deviations in your report; the maintainer decides whether it joins the list`;

/** Characters a word may hold outside quotes. */
const BARE = /^[A-Za-z0-9_./:@%+,=-]$/;

/** Characters double quotes may hold: printable ASCII without `"`, `$`, backtick, backslash or `!`. */
const IN_DOUBLE = /^[\x20-\x7e]$/;
const NOT_IN_DOUBLE = new Set(['"', "$", "`", "\\", "!"]);

/** Characters single quotes may hold: printable ASCII without `'`. */
const IN_SINGLE = /^[\x20-\x7e]$/;

/**
 * @typedef {{ word: string } | { op: "&&" }} Lexeme
 * @typedef {import("./guardCommands.mjs").Walk} Walk
 */

/**
 * Names a character for a refusal.
 *
 * @param {string} char
 * @returns {string}
 */
function describe(char) {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || code > 0x7e
    ? `the character U+${code.toString(16).toUpperCase().padStart(4, "0")}`
    : `\`${char}\``;
}

/**
 * Reads quoted text from `start` (the opening quote) and gives its contents
 * and the index after the closing quote, or why it cannot be read.
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ value: string, end: number } | { reason: string }}
 */
function readQuoted(text, start) {
  const quote = text[start] ?? "";
  const close = text.indexOf(quote, start + 1);
  if (close === -1) {
    return { reason: `a ${quote} quote is never closed` };
  }
  const value = text.slice(start + 1, close);
  if (value === "") {
    return {
      reason:
        "empty quotes are refused, because zsh can read two single-quoted strings side by side as one with a quote in it",
    };
  }
  for (const char of value) {
    const allowed =
      quote === "'"
        ? IN_SINGLE.test(char)
        : IN_DOUBLE.test(char) && !NOT_IN_DOUBLE.has(char);
    if (!allowed) {
      return {
        reason: `${describe(char)} inside ${quote} quotes is refused; only plain text can be quoted`,
      };
    }
  }
  if (quote === "'" && text[close + 1] === "'") {
    return {
      reason:
        "two single-quoted strings side by side are refused, because zsh can read them as one with a quote in it",
    };
  }
  return { value, end: close + 1 };
}

/**
 * Reads one word from `start`, joining plain and quoted parts, up to the next
 * space or the end.
 *
 * @param {string} command
 * @param {number} start
 * @returns {{ word: string, end: number } | { reason: string }}
 */
function readWord(command, start) {
  if (command[start] === "=") {
    return {
      reason:
        "a word that starts with `=` is refused, because zsh replaces `=name` with the path of a program",
    };
  }
  let word = "";
  let index = start;
  while (index < command.length && command[index] !== " ") {
    const char = command[index] ?? "";
    if (char === "'" || char === '"') {
      const quoted = readQuoted(command, index);
      if ("reason" in quoted) {
        return quoted;
      }
      word += quoted.value;
      index = quoted.end;
    } else if (BARE.test(char)) {
      word += char;
      index += 1;
    } else {
      return {
        reason: `${describe(char)} is shell syntax or a character the strict reading does not accept outside quotes`,
      };
    }
  }
  return { word, end: index };
}

/**
 * Splits a command into words and `&&`, or says why it cannot be read
 * strictly.
 *
 * @param {string} command
 * @returns {{ lexemes: Lexeme[] } | { reason: string }}
 */
export function lex(command) {
  if (command.length > MAX_ALLOWED_LENGTH) {
    return {
      reason: `the command is longer than ${MAX_ALLOWED_LENGTH} characters`,
    };
  }
  /** @type {Lexeme[]} */
  const lexemes = [];
  let index = 0;
  while (index < command.length) {
    if (command[index] === " ") {
      index += 1;
    } else if (
      command.startsWith("&&", index) &&
      (command[index + 2] ?? " ") === " "
    ) {
      lexemes.push({ op: "&&" });
      index += 2;
    } else {
      const read = readWord(command, index);
      if ("reason" in read) {
        return read;
      }
      lexemes.push({ word: read.word });
      index = read.end;
    }
  }
  return { lexemes };
}

// Value checks for options and operands.

/** @param {string} v */
const isNumber = (v) => /^[1-9][0-9]{0,6}$/.test(v);
/** @param {string} v */
const isCount = (v) => /^[0-9]{1,6}$/.test(v);
/** @param {string} v */
const isText = (v) => v !== "";
/** @param {string} v */
const isRepo = (v) => v === "MapCairn/mapcairn";
/** @param {string} v */
const isFields = (v) => /^[A-Za-z]+(?:,[A-Za-z]+)*$/.test(v);
/** @param {string} v */
const isLetters = (v) => /^[A-Za-z]+$/.test(v);
/**
 * A revision or range: letters, digits and `_./~^-`, not starting with `-`.
 *
 * @param {string} v
 */
const isRevision = (v) =>
  /^[A-Za-z0-9_][A-Za-z0-9_./~^-]*$/.test(v) && !v.includes("@{");
/**
 * A revision, or `<revision>:<path>` as `git show` takes it.
 *
 * @param {string} v
 */
const isObject = (v) => {
  const colon = v.indexOf(":");
  return colon === -1
    ? isRevision(v)
    : isRevision(v.slice(0, colon)) && !v.slice(colon + 1).startsWith("-");
};
/** @param {string} v */
const isOperand = (v) => v !== "" && !v.startsWith("-");

/**
 * @typedef {object} OptionSpec
 * @property {string[]} [flags] Options that take no value.
 * @property {Record<string, (value: string) => boolean>} [values] Options
 *   that take a value, as `--name=value`, `--name value`, `-x value` or `-xvalue`.
 * @property {string} [bundle] Single-letter flags that may be written together (`-rn`).
 * @property {boolean} [numberFlag] Whether `-<number>` is a count (`git log -5`).
 * @property {boolean} [dashes] Whether `--` ends the options and starts the paths.
 */

/**
 * The value given inline with an option: after `=` for a long option, after
 * the letter for a short one (`-U0`), or nothing.
 *
 * @param {string} arg
 * @returns {string | undefined}
 */
function inlineValue(arg) {
  if (arg.startsWith("--")) {
    const equals = arg.indexOf("=");
    return equals === -1 ? undefined : arg.slice(equals + 1);
  }
  return arg.length > 2 ? arg.slice(2) : undefined;
}

/**
 * Reads one option word (and its value, if it takes one) against a spec.
 *
 * @param {string} name The command, for a refusal.
 * @param {string[]} args
 * @param {number} index Where the option is.
 * @param {OptionSpec} spec
 * @returns {{ reason: string } | { key: string, value: string, used: number }}
 */
function readOption(name, args, index, spec) {
  const arg = args[index] ?? "";
  const long = arg.startsWith("--");
  const key = long ? (arg.split("=")[0] ?? arg) : arg.slice(0, 2);
  if ((spec.flags ?? []).includes(arg)) {
    return { key: arg, value: "", used: 1 };
  }
  if (spec.numberFlag && /^-[1-9][0-9]{0,5}$/.test(arg)) {
    return { key: "-n", value: arg.slice(1), used: 1 };
  }
  const check = spec.values?.[key];
  if (check !== undefined) {
    const inline = inlineValue(arg);
    const value = inline ?? args[index + 1];
    if (value === undefined || !check(value)) {
      return {
        reason: `${name} ${key} with ${value === undefined ? "no value" : `the value ${value}`} is not on the list`,
      };
    }
    return { key, value, used: inline === undefined ? 2 : 1 };
  }
  const bundle = spec.bundle ?? "";
  if (!long && [...arg.slice(1)].every((letter) => bundle.includes(letter))) {
    return { key: arg, value: "", used: 1 };
  }
  return { reason: `${name} ${long ? key : arg} is not on the list` };
}

/**
 * Reads the options of a command against its spec.
 *
 * @param {string} name The command, for a refusal.
 * @param {string[]} args
 * @param {OptionSpec} spec
 * @returns {{ reason: string } | { options: Map<string, string>, operands: string[], paths: string[] | undefined }}
 */
function readOptions(name, args, spec) {
  /** @type {Map<string, string>} */
  const options = new Map();
  /** @type {string[]} */
  const operands = [];
  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? "";
    if (arg === "--" && spec.dashes) {
      return { options, operands, paths: args.slice(index + 1) };
    }
    if (!arg.startsWith("-") || arg === "-") {
      operands.push(arg);
      index += 1;
      continue;
    }
    const read = readOption(name, args, index, spec);
    if ("reason" in read) {
      return read;
    }
    options.set(read.key, read.value);
    index += read.used;
  }
  return { options, operands, paths: undefined };
}

/**
 * @typedef {object} Context
 * @property {Walk} walk Its `cwd` is the folder the command runs in.
 */

/**
 * @typedef {object} Entry
 * @property {string[]} words The program and its subcommands.
 * @property {"anywhere" | "project" | "worktree"} where Where it may run.
 * @property {boolean} [testReviewer] Whether only `test-reviewer` may run it.
 * @property {(args: string[], context: Context) => string | undefined} check
 *   Why the rest of the words are refused, or nothing.
 */

/**
 * An entry whose words after the command are options and operands.
 *
 * @param {string} name
 * @param {OptionSpec} spec
 * @param {(read: { options: Map<string, string>, operands: string[], paths: string[] | undefined }, context: Context) => string | undefined} operands
 * @returns {(args: string[], context: Context) => string | undefined}
 */
function withOptions(name, spec, operands) {
  return (args, context) => {
    const read = readOptions(name, args, spec);
    return "reason" in read ? read.reason : operands(read, context);
  };
}

/**
 * Checks the number of operands and each one. Paths after `--` are taken as
 * they are: git reads them as paths, never as options.
 *
 * @param {string} name
 * @param {(value: string) => boolean} operand
 * @param {{ min?: number, max?: number }} [count]
 * @returns {(read: { operands: string[] }) => string | undefined}
 */
function each(name, operand, count = {}) {
  return ({ operands }) => {
    const { min = 0, max = Number.POSITIVE_INFINITY } = count;
    if (operands.length < min || operands.length > max) {
      return `${name} takes ${min === max ? min : `${min} to ${max}`} operands here, not ${operands.length}`;
    }
    const bad = operands.find((value) => !operand(value));
    return bad === undefined
      ? undefined
      : `${name} does not take ${bad} as an operand`;
  };
}

/**
 * The `gh` commands that read one pull request or issue by number, always
 * with `--repo MapCairn/mapcairn`.
 *
 * @param {string} name
 * @param {string[]} flags
 * @param {Record<string, (value: string) => boolean>} values
 * @returns {(args: string[], context: Context) => string | undefined}
 */
function ghByNumber(name, flags, values) {
  return withOptions(
    name,
    { flags, values: { "--repo": isRepo, "-R": isRepo, ...values } },
    ({ options, operands }) => {
      if (!options.has("--repo") && !options.has("-R")) {
        return `${name} needs --repo MapCairn/mapcairn`;
      }
      return operands.length === 1 && isNumber(operands[0] ?? "")
        ? undefined
        : `${name} takes one pull request or issue number`;
    },
  );
}

/** The one `gh api` read the reviewers use: a file at a commit. */
const CONTENTS =
  /^repos\/MapCairn\/mapcairn\/contents\/[A-Za-z0-9_./-]+\?ref=[A-Za-z0-9_./-]+$/;

/**
 * `gh api` with a contents path and nothing else, so it stays a GET.
 *
 * @param {string[]} args
 * @returns {string | undefined}
 */
function checkGhApi(args) {
  const [endpoint, ...rest] = args;
  const path = (endpoint ?? "").split("?")[0] ?? "";
  const plain =
    rest.length === 0 &&
    CONTENTS.test(endpoint ?? "") &&
    !path.split("/").includes("..");
  return plain
    ? undefined
    : "gh api is allowed only as gh api 'repos/MapCairn/mapcairn/contents/<path>?ref=<sha>', with no options";
}

/** Options that change only how `git log`, `show` and `diff` print. */
const GIT_PRINT_FLAGS = [
  "--stat",
  "--name-only",
  "--name-status",
  "--numstat",
  "--shortstat",
  "--no-color",
  "-p",
  "--patch",
  "--oneline",
  "--no-patch",
  "-s",
  "-w",
];

/** Options with a value that change only how `git log`, `show` and `diff` print. */
const GIT_PRINT_VALUES = {
  "--format": isText,
  "--pretty": isText,
  "-U": isCount,
  "--unified": isCount,
  "--diff-filter": isLetters,
};

/**
 * `git fetch` from `origin` or `upstream`, of nothing, a pull request head or
 * a plain branch name: never a URL, a `:` refspec or a forced one.
 *
 * @param {{ operands: string[] }} read
 * @returns {string | undefined}
 */
function checkFetch({ operands }) {
  const [remote, refspec, ...rest] = operands;
  const remoteOk = remote === "origin" || remote === "upstream";
  const refspecOk =
    refspec === undefined ||
    (refspec.startsWith("pull/")
      ? /^pull\/[1-9][0-9]{0,6}\/head$/.test(refspec)
      : /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(refspec));
  return remoteOk && refspecOk && rest.length === 0 && !refspec?.includes("..")
    ? undefined
    : "git fetch takes origin or upstream and at most a pull/<n>/head or a plain branch name";
}

/**
 * Whether a path is a worktree folder itself: one segment below
 * `.claude/worktrees`.
 *
 * @param {string} raw
 * @param {Context} context
 * @returns {boolean}
 */
function isWorktreeFolder(raw, context) {
  const { walk } = context;
  const place = resolvePath(raw, walk.cwd, walk.context.platform, true);
  return isInside(place, walk.context, 1) && !isInside(place, walk.context, 2);
}

/**
 * Whether a path is inside a worktree (the worktree itself or below it).
 *
 * @param {string} raw
 * @param {Context} context
 * @returns {boolean}
 */
function isInWorktree(raw, context) {
  const { walk } = context;
  const place = resolvePath(raw, walk.cwd, walk.context.platform, true);
  return isInside(place, walk.context, 1);
}

/**
 * The project scripts a reviewer may run, by their path in the project, with a
 * check on their arguments. Only the project's own copy runs, never a pull
 * request's copy in a worktree.
 *
 * @type {Record<string, (args: string[], context: Context) => string | undefined>}
 */
const SCRIPTS = {
  "scripts/agents/thread.mjs": (args) =>
    args.length === 2 &&
    (args[0] === "issue" || args[0] === "pr") &&
    isNumber(args[1] ?? "")
      ? undefined
      : "thread.mjs takes issue or pr and a number",
  "scripts/agents/port.mjs": (args) =>
    args.length === 1 && isNumber(args[0] ?? "")
      ? undefined
      : "port.mjs takes a port number",
  "scripts/agents/docs-refs.mjs": withOptions(
    "docs-refs.mjs",
    { values: { "--ref": isRevision } },
    each("docs-refs.mjs", (v) => isOperand(v) && v.endsWith(".md"), { min: 1 }),
  ),
};

/**
 * The listed script a word names, as its path in the project, when the word
 * resolves to that script in the project folder itself: relative from the
 * project folder, or by its absolute path from anywhere.
 *
 * @param {string} word
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function projectScript(word, walk) {
  const place = resolvePath(word, walk.cwd, walk.context.platform, true);
  if (place === undefined) {
    return undefined;
  }
  const name = place.segments.slice(-3).join("/");
  const folder = { root: place.root, segments: place.segments.slice(0, -3) };
  return Object.hasOwn(SCRIPTS, name) && isProjectRoot(folder, walk.context)
    ? name
    : undefined;
}

/**
 * `node <script> <args>`: no option before the script, and only the project's
 * own copy of a script on the list.
 *
 * @param {string[]} args
 * @param {Context} context
 * @returns {string | undefined}
 */
function checkNode(args, context) {
  const [script, ...rest] = args;
  const name = projectScript(script ?? "", context.walk);
  const check = name === undefined ? undefined : SCRIPTS[name];
  if (check === undefined) {
    return `node runs only the project's own ${Object.keys(SCRIPTS).join(", ")}, with no option before the script`;
  }
  return check(rest, context);
}

/**
 * `npx --no-install vitest run`, with the options the `review-tests` skill
 * names. Vitest runs the worktree's tests and config, which the reviewer may
 * have changed, so this is for `test-reviewer` inside its worktree only.
 *
 * @param {string[]} args
 * @param {Context} context
 * @returns {string | undefined}
 */
function checkVitest(args, context) {
  if (args[0] !== "--no-install" || args[1] !== "vitest" || args[2] !== "run") {
    return "npx is allowed only as npx --no-install vitest run";
  }
  return withOptions(
    "vitest run",
    {
      flags: ["--coverage"],
      values: {
        "--coverage.include": isText,
        "--coverage.reporter": isLetters,
        "--reporter": isLetters,
        "-t": isText,
        "--testNamePattern": isText,
      },
    },
    each("vitest run", isOperand),
  )(args.slice(3), context);
}

/** @type {Entry[]} */
const ENTRIES = [
  {
    words: ["gh", "pr", "view"],
    where: "anywhere",
    check: ghByNumber("gh pr view", ["--comments"], { "--json": isFields }),
  },
  {
    words: ["gh", "pr", "diff"],
    where: "anywhere",
    check: ghByNumber("gh pr diff", ["--name-only", "--patch"], {
      "--color": (v) => ["never", "always", "auto"].includes(v),
    }),
  },
  {
    words: ["gh", "pr", "checks"],
    where: "anywhere",
    check: ghByNumber("gh pr checks", ["--required"], { "--json": isFields }),
  },
  {
    words: ["gh", "issue", "view"],
    where: "anywhere",
    check: ghByNumber("gh issue view", ["--comments"], { "--json": isFields }),
  },
  { words: ["gh", "api"], where: "anywhere", check: checkGhApi },
  {
    words: ["git", "show"],
    where: "anywhere",
    check: withOptions(
      "git show",
      { flags: GIT_PRINT_FLAGS, values: GIT_PRINT_VALUES, dashes: true },
      each("git show", isObject),
    ),
  },
  {
    words: ["git", "log"],
    where: "anywhere",
    check: withOptions(
      "git log",
      {
        flags: [
          ...GIT_PRINT_FLAGS,
          "--no-merges",
          "--merges",
          "--first-parent",
          "--reverse",
          "--follow",
          "--graph",
          "--decorate",
          "--no-decorate",
        ],
        values: {
          ...GIT_PRINT_VALUES,
          "-n": isNumber,
          "--max-count": isNumber,
          "--since": isText,
          "--until": isText,
          "--author": isText,
          "--grep": isText,
          "-S": isText,
          "-G": isText,
        },
        numberFlag: true,
        dashes: true,
      },
      each("git log", isRevision),
    ),
  },
  {
    words: ["git", "diff"],
    where: "anywhere",
    check: withOptions(
      "git diff",
      {
        flags: [...GIT_PRINT_FLAGS, "--cached", "--staged", "--merge-base"],
        values: GIT_PRINT_VALUES,
        dashes: true,
      },
      each("git diff", isRevision),
    ),
  },
  {
    words: ["git", "fetch"],
    where: "anywhere",
    check: withOptions(
      "git fetch",
      { flags: ["-q", "--quiet", "--no-tags"] },
      checkFetch,
    ),
  },
  {
    words: ["git", "rev-parse"],
    where: "anywhere",
    check: withOptions(
      "git rev-parse",
      {
        flags: ["--show-toplevel", "--abbrev-ref", "--short", "--verify", "-q"],
      },
      each("git rev-parse", isRevision),
    ),
  },
  {
    words: ["git", "merge-base"],
    where: "anywhere",
    check: withOptions(
      "git merge-base",
      { flags: ["--is-ancestor"] },
      each("git merge-base", isRevision, { min: 2, max: 2 }),
    ),
  },
  {
    words: ["git", "status"],
    where: "anywhere",
    check: withOptions(
      "git status",
      {
        flags: ["--short", "--porcelain", "--branch"],
        bundle: "sb",
        dashes: true,
      },
      each("git status", isOperand),
    ),
  },
  {
    words: ["git", "ls-files"],
    where: "anywhere",
    check: withOptions(
      "git ls-files",
      {
        flags: ["--others", "--exclude-standard", "--cached"],
        dashes: true,
      },
      each("git ls-files", isOperand),
    ),
  },
  {
    words: ["git", "blame"],
    where: "anywhere",
    check: withOptions(
      "git blame",
      {
        flags: ["-w", "-s"],
        values: { "-L": (v) => /^[0-9]{1,6},\+?[0-9]{1,6}$/.test(v) },
        dashes: true,
      },
      each("git blame", isOperand, { min: 0, max: 2 }),
    ),
  },
  {
    words: ["git", "worktree", "list"],
    where: "anywhere",
    check: withOptions(
      "git worktree list",
      { flags: ["--porcelain"] },
      each("git worktree list", isOperand, { max: 0 }),
    ),
  },
  {
    words: ["git", "worktree", "add", "--detach"],
    where: "project",
    testReviewer: true,
    check: (args, context) =>
      args.length === 2 &&
      isWorktreeFolder(args[0] ?? "", context) &&
      isRevision(args[1] ?? "")
        ? undefined
        : "git worktree add is allowed only as git worktree add --detach .claude/worktrees/<name> <sha>",
  },
  {
    words: ["git", "worktree", "remove"],
    where: "project",
    testReviewer: true,
    check: (args, context) =>
      args.length === 1 && isWorktreeFolder(args[0] ?? "", context)
        ? undefined
        : "git worktree remove is allowed only as git worktree remove .claude/worktrees/<name>, with no option",
  },
  {
    words: ["git", "restore"],
    where: "worktree",
    testReviewer: true,
    check: withOptions(
      "git restore",
      { values: { "--source": isRevision }, dashes: true },
      ({ operands, paths }, context) => {
        const all = [...operands, ...(paths ?? [])];
        return all.length > 0 &&
          all.every((p) => isOperand(p) && isInWorktree(p, context))
          ? undefined
          : "git restore takes paths inside the worktree";
      },
    ),
  },
  {
    words: ["npm", "ci", "--ignore-scripts"],
    where: "worktree",
    testReviewer: true,
    check: (args) =>
      args.length === 0
        ? undefined
        : "npm is allowed only as npm ci --ignore-scripts",
  },
  { words: ["npx"], where: "worktree", testReviewer: true, check: checkVitest },
  { words: ["node"], where: "anywhere", check: checkNode },
  {
    words: ["grep"],
    where: "anywhere",
    check: withOptions(
      "grep",
      {
        bundle: "rRnilLcwxEFohHsvI",
        values: {
          "-e": isText,
          "-m": isNumber,
          "-A": isCount,
          "-B": isCount,
          "-C": isCount,
          "--include": isText,
          "--exclude": isText,
          "--exclude-dir": isText,
        },
      },
      ({ options, operands }) => {
        const needed = options.has("-e") ? 1 : 2;
        return operands.length >= needed
          ? undefined
          : "grep needs a pattern and at least one path, so it never waits on standard input";
      },
    ),
  },
  {
    words: ["rg"],
    where: "anywhere",
    check: withOptions(
      "rg",
      {
        bundle: "niSlcwFovuHN",
        flags: [
          "--hidden",
          "--no-ignore",
          "--files",
          "--files-with-matches",
          "--count",
          "--line-number",
          "--ignore-case",
          "--smart-case",
          "--fixed-strings",
          "--word-regexp",
          "--no-config",
          "--no-heading",
          "--with-filename",
        ],
        values: {
          "-e": isText,
          "--regexp": isText,
          "-g": isText,
          "--glob": isText,
          "-t": isLetters,
          "--type": isLetters,
          "-m": isNumber,
          "--max-count": isNumber,
          "-A": isCount,
          "-B": isCount,
          "-C": isCount,
        },
      },
      ({ options, operands }) => {
        const pattern =
          options.has("-e") || options.has("--regexp") || options.has("--files")
            ? 0
            : 1;
        return operands.length >= pattern + 1
          ? undefined
          : "rg needs at least one path, so it never waits on standard input";
      },
    ),
  },
];

/**
 * Finds the entry whose words start the command, the longest first.
 *
 * @param {string[]} words
 * @returns {Entry | undefined}
 */
function findEntry(words) {
  return ENTRIES.filter((entry) =>
    entry.words.every((word, index) => words[index] === word),
  ).sort((a, b) => b.words.length - a.words.length)[0];
}

/**
 * Why a command may not run in the folder it runs in.
 *
 * @param {Entry} entry
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function placeProblem(entry, walk) {
  const here =
    walk.cwd === null
      ? undefined
      : resolvePath(walk.cwd, null, walk.context.platform);
  if (entry.where === "project" && !isProjectRoot(here, walk.context)) {
    return `${entry.words.join(" ")} runs only from the project folder, so the project's own copy runs`;
  }
  if (entry.where === "worktree" && !isInside(here, walk.context, 1)) {
    return `${entry.words.join(" ")} runs only inside a worktree under .claude/worktrees/<name>/ (use cd <worktree> && ...)`;
  }
  return undefined;
}

/**
 * Takes a leading `cd <folder> &&` off the command, for `test-reviewer`, and
 * moves the walk there. The folder must be inside a worktree.
 *
 * @param {Lexeme[]} lexemes
 * @param {string} agent
 * @param {Walk} walk
 * @returns {{ words: string[] } | { reason: string }}
 */
function takeCd(lexemes, agent, walk) {
  const ops = lexemes.filter((lexeme) => "op" in lexeme).length;
  const words = lexemes.map((lexeme) => ("word" in lexeme ? lexeme.word : ""));
  if (ops === 0) {
    return { words };
  }
  const shaped =
    ops === 1 &&
    "op" in (lexemes[2] ?? {}) &&
    words[0] === "cd" &&
    lexemes.length > 3;
  if (!shaped) {
    return {
      reason:
        "`&&` is allowed only once, as cd <worktree> && <command>; any other way of joining commands is refused",
    };
  }
  if (agent !== TEST_REVIEWER) {
    return { reason: "cd <worktree> && is only for test-reviewer" };
  }
  const place = resolvePath(
    words[1] ?? "",
    walk.cwd,
    walk.context.platform,
    true,
  );
  if (place === undefined || !isInside(place, walk.context, 1)) {
    return {
      reason: `cd ${words[1]} is not a folder inside a worktree under .claude/worktrees/<name>/`,
    };
  }
  walk.cwd = show(place);
  return { words: words.slice(3) };
}

/**
 * Decides whether a reviewer's command is on the allowlist.
 *
 * @param {string} command
 * @param {string} agent
 * @param {Walk} walk Its `cwd` is moved by a leading `cd`.
 * @returns {string | undefined} Why it is refused, or nothing.
 */
export function checkAllowlist(command, agent, walk) {
  const reason = allowlistProblem(command, agent, walk);
  return reason === undefined ? undefined : `${reason}. ${HOW_TO_ASK}`;
}

/**
 * @param {string} command
 * @param {string} agent
 * @param {Walk} walk
 * @returns {string | undefined}
 */
function allowlistProblem(command, agent, walk) {
  const lexed = lex(command);
  if ("reason" in lexed) {
    return lexed.reason;
  }
  const taken = takeCd(lexed.lexemes, agent, walk);
  if ("reason" in taken) {
    return taken.reason;
  }
  const { words } = taken;
  if (words.length === 0) {
    return "the command is empty";
  }
  const entry = findEntry(words);
  if (entry === undefined) {
    return `${words.slice(0, 2).join(" ")} is not on the list`;
  }
  if (entry.testReviewer && agent !== TEST_REVIEWER) {
    return `${entry.words.join(" ")} is only for test-reviewer`;
  }
  return (
    placeProblem(entry, walk) ??
    entry.check(words.slice(entry.words.length), { walk })
  );
}
