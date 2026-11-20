// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Fails when a file that executes holds a command that publishes to npm,
 * changes who may publish, or approves a deployment. Agents never run those
 * commands (`docs/guides/working-with-agents.md`), and this check keeps a
 * committed script, hook or workflow from running them for an agent either.
 *
 *   node scripts/release/publishGuard.mjs
 *
 * It reads the places that execute: the `scripts` of every `package.json`,
 * files under `scripts/` and `packages/<name>/scripts/`, `lefthook.yml`,
 * workflows and composite actions, and Dockerfiles, Makefiles and similar.
 * Prose (instruction files, skills, guides, plans) is not read, because it has
 * to name the commands to forbid them. Comments in JavaScript are not read.
 *
 * It finds the command as text in a shell line (`npm publish`, `npx -y npm
 * publish`, `corepack npm publish`, `node "$npm_execpath" publish`, a
 * shortened name npm accepts such as `npm pub`), as a string or template
 * literal, and as an argument array (`npm(["publish"])`, `run("npm",
 * ["stage", "publish"])`). It cannot find a command assembled at run time
 * (`"pub" + "lish"`), a name read from a variable, or a program that is not
 * npm; the independent review of every change to an executable file covers
 * those (see "Keeping agents from publishing" in plan 0014).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "../entryPoint.mjs";

/**
 * This file and its tests: they hold the commands as fixtures, which the scan
 * of every script and test file would otherwise report. Nothing else is exempt.
 */
export const EXEMPT_FILES = new Set([
  "scripts/release/publishGuard.mjs",
  "packages/core/src/lint/publishGuard.test.ts",
  "packages/core/src/lint/publishGuardWorkflows.test.ts",
  "packages/core/src/lint/agentDenyLists.test.ts",
]);

/**
 * The npm commands an agent never runs, as the maintainer decided. The deny
 * lists, the guard and the tests that read the deny lists all use this list.
 * `logout` is left out on purpose: it only removes a credential, and the
 * release guide has the maintainer run it.
 */
export const FORBIDDEN_NPM_COMMANDS = [
  "publish",
  "stage",
  "login",
  "trust",
  "dist-tag",
  "unpublish",
  "deprecate",
  "access",
  "owner",
  "token",
  "team",
  "profile",
  "org",
  "undeprecate",
];

/**
 * Other names npm accepts for a forbidden command, from `lib/utils/cmd-list.js`
 * in npm 11. That list has no `hook` command.
 */
export const NPM_ALIASES = {
  login: ["adduser", "add-user"],
  owner: ["author"],
  "dist-tag": ["dist-tags"],
  org: ["ogr"],
};

/**
 * Other package managers' commands that publish, as the program followed by
 * the words that make the command. The deny lists carry these too; the guard
 * already treats these programs as launchers.
 */
export const OTHER_PUBLISH_COMMANDS = [
  ["pnpm", "publish"],
  ["yarn", "publish"],
  ["yarn", "npm", "publish"],
  ["bun", "publish"],
];

/** The text the deny lists and the guard both match on for a GitHub deployment approval. */
export const DEPLOYMENT_APPROVAL_TEXT = "pending_deployments";

/** The only commands the `npm` job of `release.yml` may run. */
export const NPM_JOB_COMMANDS = new Set(["publish", "stage"]);

/** The workflow file and the job that may publish. */
export const RELEASE_WORKFLOW = ".github/workflows/release.yml";
export const NPM_JOB = "npm";

/** Every forbidden name, aliases included. */
export const FORBIDDEN_NAMES = FORBIDDEN_NPM_COMMANDS.flatMap((command) => [
  command,
  ...(NPM_ALIASES[command] ?? []),
]);

/** Shortest start of a name that npm resolves to the command. */
const MIN_ABBREVIATION = 3;
/** A start of a forbidden name that is a real, harmless npm command. */
const HARMLESS_ABBREVIATIONS = new Set(["add"]);

/** Programs that can publish: npm itself and the other package managers. */
const LAUNCHERS = new Set([
  "npm",
  "npm-cli",
  "npm_execpath",
  "pnpm",
  "yarn",
  "bun",
  "lerna",
  "changeset",
  "changesets",
]);

/** npm options that take the next word as their value. */
const VALUE_OPTIONS = new Set([
  "-w",
  "-C",
  "--workspace",
  "--prefix",
  "--registry",
  "--userconfig",
  "--globalconfig",
  "--cache",
  "--tag",
  "--otp",
  "--access",
  "--scope",
  "--loglevel",
  "--node-options",
]);

/** Commands whose later words are arguments, not another command. */
const ARGUMENT_TAKING = new Set([
  "run",
  "run-script",
  "rum",
  "urn",
  "exec",
  "x",
  "help",
  "help-search",
  "view",
  "v",
  "info",
  "show",
  "config",
  "c",
  "get",
  "set",
  "install",
  "i",
  "add",
  "ci",
  "ls",
  "list",
  "search",
  "find",
  "s",
  "explain",
  "why",
  "docs",
  "bugs",
  "repo",
  "pkg",
  "test",
  "t",
  "start",
  "stop",
  "restart",
  "outdated",
  "update",
  "up",
  "uninstall",
  "rm",
  "remove",
  "pack",
  "diff",
  "audit",
  "init",
  "create",
]);

/**
 * Array elements that are a publish or a change of publisher in any array, not
 * only one passed to npm. The other forbidden names are ordinary words
 * (`access`, `owner`, `token`, `team`) and count only beside an npm program.
 */
const DISTINCTIVE_NAMES = new Set([
  "publish",
  "unpublish",
  "deprecate",
  "dist-tag",
  "dist-tags",
  "adduser",
  "add-user",
  "undeprecate",
]);

/**
 * Whether a word is, or npm would take it for, a forbidden command.
 *
 * @param {string} word
 * @returns {string | undefined} The forbidden command it names.
 */
export function forbiddenCommandOf(word) {
  const lower = word.toLowerCase();
  for (const command of FORBIDDEN_NPM_COMMANDS) {
    const names = [command, ...(NPM_ALIASES[command] ?? [])];
    for (const name of names) {
      if (lower === name) {
        return command;
      }
      const isAbbreviation =
        lower.length >= MIN_ABBREVIATION &&
        name.startsWith(lower) &&
        !HARMLESS_ABBREVIATIONS.has(lower);
      if (isAbbreviation) {
        return command;
      }
    }
  }
  return undefined;
}

/**
 * The forbidden command a word is, spelled out in full.
 *
 * @param {string} word
 * @returns {string | undefined}
 */
function exactForbiddenCommandOf(word) {
  const lower = word.toLowerCase();
  return FORBIDDEN_NPM_COMMANDS.find(
    (command) =>
      command === lower || (NPM_ALIASES[command] ?? []).includes(lower),
  );
}

/**
 * The program a shell word names: quotes, `$`, `%` and braces removed, the
 * folder and a script or executable extension dropped.
 *
 * @param {string} word
 * @returns {string}
 */
function programName(word) {
  const bare = word
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\$\{?|\}$/g, "")
    .replace(/^%|%$/g, "")
    .replace(/@[^/\\]*$/, "");
  const base = bare.split(/[\\/]/).pop() ?? "";
  return base.toLowerCase().replace(/\.(?:cmd|exe|ps1|bat|js|cjs|mjs)$/, "");
}

/**
 * Whether a word runs npm or another package manager.
 *
 * @param {string} word
 * @returns {boolean}
 */
function isLauncher(word) {
  return LAUNCHERS.has(programName(word));
}

/**
 * The forbidden command a package manager is asked to run, given the words
 * after the program: options (with the value of those that take one) come
 * first, then the command. A command that runs other things (`run`, `exec`)
 * is read no further; for any other, a forbidden name in a later word counts
 * too, so an option this list does not know cannot hide the command.
 *
 * @param {string[]} words
 * @returns {string | undefined}
 */
export function forbiddenCommandAfterProgram(words) {
  let position = 0;
  while (position < words.length && words[position].startsWith("-")) {
    const takesValue =
      VALUE_OPTIONS.has(words[position]) && !words[position].includes("=");
    position += takesValue ? 2 : 1;
  }
  const command = words[position];
  if (command === undefined) {
    return undefined;
  }
  const direct = forbiddenCommandOf(command);
  if (direct !== undefined) {
    return direct;
  }
  if (ARGUMENT_TAKING.has(command)) {
    return undefined;
  }
  for (const later of words.slice(position + 1)) {
    const found = exactForbiddenCommandOf(later);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * The forbidden commands in text that a shell would run: one or more lines,
 * split at the shell's separators.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function forbiddenInShellText(text) {
  const found = [];
  const joined = text.replace(/\\\r?\n/g, " ");
  for (const segment of joined.split(/\r?\n|&&|\|\||[;|&()`]/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    words.forEach((word, index) => {
      if (!isLauncher(word)) {
        return;
      }
      const command = forbiddenCommandAfterProgram(
        words.slice(index + 1).map(stripQuotes),
      );
      if (command !== undefined) {
        found.push(command);
      }
    });
    if (segment.includes(DEPLOYMENT_APPROVAL_TEXT)) {
      found.push(DEPLOYMENT_APPROVAL_TEXT);
    }
  }
  return found;
}

/**
 * @param {string} word
 * @returns {string}
 */
function stripQuotes(word) {
  return word.replace(/^["'`]+|["'`]+$/g, "");
}

/**
 * Splits JavaScript or Python source into strings, words and punctuation.
 * Comments are skipped. A string in single or double quotes ends at a line
 * break, so a stray quote (inside a regular expression, say) cannot swallow
 * the rest of the file.
 *
 * @param {string} source
 * @returns {{ kind: "str" | "id" | "punct", value: string, index: number }[]}
 */
export function tokenise(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i += 1;
    } else if (source.startsWith("//", i)) {
      i = skipTo(source, i, "\n");
    } else if (source.startsWith("/*", i)) {
      i = skipTo(source, i + 2, "*/") + 1;
    } else if (char === '"' || char === "'" || char === "`") {
      const end = stringEnd(source, i);
      tokens.push({
        kind: "str",
        value: source.slice(i + 1, end),
        index: i,
      });
      i = end + 1;
    } else if (/[A-Za-z_$]/.test(char)) {
      let end = i + 1;
      while (end < source.length && /[\w$]/.test(source[end])) {
        end += 1;
      }
      tokens.push({ kind: "id", value: source.slice(i, end), index: i });
      i = end;
    } else {
      tokens.push({ kind: "punct", value: char, index: i });
      i += 1;
    }
  }
  return tokens;
}

/**
 * @param {string} source
 * @param {number} from
 * @param {string} marker
 * @returns {number} The index of the marker, or the end of the source.
 */
function skipTo(source, from, marker) {
  const found = source.indexOf(marker, from);
  return found === -1 ? source.length : found;
}

/**
 * The index of the quote that ends the string starting at `start`.
 *
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
function stringEnd(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\") {
      i += 2;
    } else if (char === quote) {
      return i;
    } else if (char === "\n" && quote !== "`") {
      return i;
    } else {
      i += 1;
    }
  }
  return source.length;
}

/**
 * Whether a token run looks like it names npm: the string `"npm"`, or a name
 * such as `npmCliPath` or `process.env.npm_execpath`.
 *
 * @param {{ kind: string, value: string }[]} tokens
 * @returns {boolean}
 */
function namesNpm(tokens) {
  return tokens.some(
    (token) =>
      (token.kind === "str" && isLauncher(token.value)) ||
      (token.kind === "id" && /npm|execpath/i.test(token.value)),
  );
}

/**
 * The elements of the array or argument list whose opening bracket is at
 * `open`, each as its tokens, and the index of the closing bracket.
 *
 * @param {{ kind: string, value: string }[]} tokens
 * @param {number} open
 * @returns {{ elements: { kind: string, value: string }[][], close: number }}
 */
function elementsFrom(tokens, open) {
  const elements = [[]];
  let depth = 0;
  let i = open;
  for (; i < tokens.length; i += 1) {
    const { kind, value } = tokens[i];
    const isPunct = kind === "punct";
    if (isPunct && "([{".includes(value)) {
      depth += 1;
      if (depth === 1) {
        continue;
      }
    } else if (isPunct && ")]}".includes(value)) {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    } else if (isPunct && value === "," && depth === 1) {
      elements.push([]);
      continue;
    }
    elements[elements.length - 1].push(tokens[i]);
  }
  return {
    elements: elements.filter((element) => element.length > 0),
    close: i,
  };
}

/**
 * The words of an array element: its text when it is one string, a marker for
 * anything computed.
 *
 * @param {{ kind: string, value: string }[]} element
 * @returns {string}
 */
function wordOf(element) {
  return element.length === 1 && element[0].kind === "str"
    ? element[0].value
    : "\u0000";
}

/**
 * Whether the array at `open` is passed to something that names npm: a call to
 * `npm(...)` or `runNpm(...)`, or an argument after one that does (`run("npm",
 * [...])`, `spawnSync(npmBinary, [...])`).
 *
 * @param {{ kind: string, value: string }[]} tokens
 * @param {number} open
 * @returns {boolean}
 */
function isPassedToNpm(tokens, open) {
  let depth = 0;
  for (let i = open - 1; i >= 0; i -= 1) {
    const { kind, value } = tokens[i];
    if (kind === "punct" && ")]}".includes(value)) {
      depth += 1;
    } else if (kind === "punct" && "([{".includes(value)) {
      if (depth === 0) {
        const callee = tokens[i - 1];
        const callNamesNpm =
          value === "(" && callee?.kind === "id" && /npm/i.test(callee.value);
        return callNamesNpm || namesNpm(tokens.slice(i + 1, open));
      }
      depth -= 1;
    }
  }
  return false;
}

/**
 * The forbidden commands in JavaScript (or Python) source: in a string, as an
 * argument array, or as separate string arguments after `"npm"`.
 *
 * @param {string} source
 * @returns {{ command: string, index: number }[]}
 */
export function forbiddenInScript(source) {
  const tokens = tokenise(source);
  const found = [];
  tokens.forEach((token, position) => {
    if (token.kind === "str") {
      for (const command of forbiddenInShellText(token.value)) {
        found.push({ command, index: token.index });
      }
      if (isLauncher(token.value)) {
        const command = forbiddenAfterStrings(tokens, position);
        if (command !== undefined) {
          found.push({ command, index: token.index });
        }
      }
    }
    if (token.kind === "punct" && token.value === "[") {
      const command = forbiddenInArray(tokens, position);
      if (command !== undefined) {
        found.push({ command, index: token.index });
      }
    }
  });
  return found;
}

/**
 * `run("npm", "publish")`: the string arguments that follow the program.
 *
 * @param {{ kind: string, value: string }[]} tokens
 * @param {number} position The program's string.
 * @returns {string | undefined}
 */
function forbiddenAfterStrings(tokens, position) {
  const words = [];
  let i = position + 1;
  while (tokens[i]?.value === "," && tokens[i + 1]?.kind === "str") {
    words.push(tokens[i + 1].value);
    i += 2;
  }
  return forbiddenCommandAfterProgram(words);
}

/**
 * @param {{ kind: string, value: string }[]} tokens
 * @param {number} open The array's opening bracket.
 * @returns {string | undefined}
 */
function forbiddenInArray(tokens, open) {
  const { elements } = elementsFrom(tokens, open);
  const firstNpm = elements.findIndex((element) => namesNpm(element));
  if (firstNpm !== -1) {
    return forbiddenCommandAfterProgram(
      elements.slice(firstNpm + 1).map(wordOf),
    );
  }
  if (isPassedToNpm(tokens, open)) {
    return forbiddenCommandAfterProgram(elements.map(wordOf));
  }
  const distinctive = elements
    .map(wordOf)
    .find((word) => DISTINCTIVE_NAMES.has(word));
  return distinctive === undefined
    ? undefined
    : exactForbiddenCommandOf(distinctive);
}

/** The text of the `jobs:` section split at its two-space keys. */
const JOB_KEY = /^ {2}([A-Za-z0-9_-]+):/;

/**
 * Where each job of a workflow starts and ends, by line (counting from 1).
 * Without a `jobs:` section the result is empty.
 *
 * @param {string} text
 * @returns {Map<string, { start: number, end: number }>}
 */
export function jobRanges(text) {
  const lines = text.split(/\r?\n/);
  const jobs = new Map();
  const jobsLine = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsLine === -1) {
    return jobs;
  }
  let current;
  for (let i = jobsLine + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const isTopLevelKey = /^\S/.test(line) && !line.startsWith("#");
    if (isTopLevelKey) {
      break;
    }
    const key = JOB_KEY.exec(line);
    if (key !== null) {
      current = { start: i + 1, end: i + 1 };
      jobs.set(key[1], current);
    } else if (current !== undefined) {
      current.end = i + 1;
    }
  }
  return jobs;
}

/**
 * A line without its comment: from a `#` that starts a word and is outside
 * quotes, so `echo " #" && npm publish` keeps its command. An unclosed quote
 * keeps the rest of the line, which can only add findings.
 *
 * @param {string} line
 * @returns {string}
 */
export function stripShellComment(line) {
  let quote = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote !== "") {
      if (char === "\\" && quote === '"') {
        i += 1;
      } else if (char === quote) {
        quote = "";
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * The lines of a shell or YAML file as the shell or YAML reader joins them:
 * a line that ends in a backslash continues on the next, and the lines of a
 * folded block (`run: >`) become one line. Each result keeps the number of
 * its first line, and comments are removed.
 *
 * @param {string} text
 * @returns {{ line: number, text: string }[]}
 */
export function logicalLines(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const first = i + 1;
    const indent = lines[i].search(/\S|$/);
    let joined = stripShellComment(lines[i]);
    i += 1;
    if (/:\s*>[-+]?\s*$/.test(joined)) {
      while (
        i < lines.length &&
        (lines[i].trim() === "" || lines[i].search(/\S|$/) > indent)
      ) {
        joined += ` ${stripShellComment(lines[i]).trim()}`;
        i += 1;
      }
    }
    while (/\\\s*$/.test(joined) && i < lines.length) {
      joined = `${joined.replace(/\\\s*$/, "")} ${stripShellComment(lines[i])}`;
      i += 1;
    }
    result.push({ line: first, text: joined });
  }
  return result;
}

/**
 * The lines of a workflow that use an anchor (`&name`) or an alias
 * (`*name`), which could run one job's steps under another job's name.
 *
 * @param {string} text
 * @returns {number[]}
 */
export function yamlAnchorLines(text) {
  const anchor = /(?:^|[:,[{]\s+|-\s+|[,[{])[&*][A-Za-z0-9_-]+/;
  return logicalLines(text)
    .filter((entry) => anchor.test(entry.text))
    .map((entry) => entry.line);
}

/** A workflow step that uses an action that publishes to npm. */
const PUBLISH_ACTION =
  /\buses:\s*["']?[^\s"']*(?:npm-publish|publish-npm|npm_publish|changesets\/action|semantic-release)/i;

/**
 * @typedef {object} Finding
 * @property {string} file Repository-relative path.
 * @property {number} line Line, counting from 1.
 * @property {string} command What was found.
 */

/**
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * Reads the `scripts` of a manifest as lines of shell, with their line.
 *
 * @param {string} text
 * @returns {{ line: number, text: string }[]}
 */
function manifestScripts(text) {
  const lines = text.split("\n");
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return lines.map((line, index) => ({ line: index + 1, text: line }));
  }
  const scripts = Object.values(manifest.scripts ?? {}).filter(
    (value) => typeof value === "string",
  );
  return scripts.map((script) => {
    const encoded = JSON.stringify(script).slice(1, -1);
    const index = lines.findIndex((line) => line.includes(encoded));
    return { line: index === -1 ? 1 : index + 1, text: script };
  });
}

/**
 * Files read as JavaScript (or Python, which writes strings and lists alike),
 * wherever they are: a configuration file or a test can start a process too.
 */
const SCRIPT_FILE = /\.(?:mjs|cjs|js|jsx|ts|tsx|mts|cts|py)$/;
/** Files read as shell lines. */
const SHELL_FILE =
  /(?:\.(?:sh|bash|zsh|ps1|cmd|bat|mk)$|(?:^|\/)(?:Dockerfile[^/]*|Makefile[^/]*|justfile|Taskfile\.ya?ml|lefthook(?:-local)?\.ya?ml)$)/;
/** Workflows and composite actions. */
const WORKFLOW_FILE = /^\.github\/(?:workflows|actions)\/.*\.ya?ml$/;
/** Folders of git and agent hooks, read as shell unless they hold JavaScript. */
const HOOK_FOLDER = /^(?:\.husky|\.claude\/hooks)\//;
/** Folders of scripts. */
const SCRIPT_FOLDER = /^(?:scripts|(?:packages|examples)\/[^/]+\/scripts)\//;

/**
 * Whether a file executes and so is read.
 *
 * @param {string} file Repository-relative path with forward slashes.
 * @returns {boolean}
 */
export function isExecutable(file) {
  if (EXEMPT_FILES.has(file)) {
    return false;
  }
  return (
    path.posix.basename(file) === "package.json" ||
    WORKFLOW_FILE.test(file) ||
    SHELL_FILE.test(file) ||
    SCRIPT_FILE.test(file) ||
    HOOK_FOLDER.test(file) ||
    SCRIPT_FOLDER.test(file)
  );
}

/**
 * @param {string} file
 * @param {string} text
 * @returns {{ command: string, line: number }[]}
 */
function findingsInFile(file, text) {
  if (path.posix.basename(file) === "package.json") {
    return manifestScripts(text).flatMap((script) =>
      forbiddenInShellText(script.text).map((command) => ({
        command,
        line: script.line,
      })),
    );
  }
  if (SCRIPT_FILE.test(file)) {
    return forbiddenInScript(text).map(({ command, index }) => ({
      command,
      line: lineOf(text, index),
    }));
  }
  const lines = logicalLines(text);
  const commands = lines.flatMap((entry) =>
    forbiddenInShellText(entry.text).map((command) => ({
      command,
      line: entry.line,
    })),
  );
  if (!WORKFLOW_FILE.test(file)) {
    return commands;
  }
  const actions = lines
    .filter((entry) => PUBLISH_ACTION.test(entry.text))
    .map((entry) => ({ command: "publish action", line: entry.line }));
  const anchors =
    file === RELEASE_WORKFLOW
      ? yamlAnchorLines(text).map((line) => ({
          command: "yaml anchor or alias",
          line,
        }))
      : [];
  return [...commands, ...actions, ...anchors];
}

/**
 * Whether a finding in `release.yml` sits in the `npm` job and is a command
 * that job may run.
 *
 * @param {string} file
 * @param {string} text
 * @param {{ command: string, line: number }} finding
 * @returns {boolean}
 */
function isAllowedInNpmJob(file, text, finding) {
  if (file !== RELEASE_WORKFLOW || !NPM_JOB_COMMANDS.has(finding.command)) {
    return false;
  }
  const range = jobRanges(text).get(NPM_JOB);
  return (
    range !== undefined &&
    finding.line >= range.start &&
    finding.line <= range.end
  );
}

/**
 * Reads the files that execute and reports each forbidden command.
 *
 * @param {{ path: string, text: string }[]} sources Repository-relative paths with forward slashes.
 * @returns {Finding[]}
 */
export function scanSources(sources) {
  return sources
    .filter((source) => isExecutable(source.path))
    .flatMap((source) =>
      findingsInFile(source.path, source.text)
        .filter(
          (finding) => !isAllowedInNpmJob(source.path, source.text, finding),
        )
        .map((finding) => ({ file: source.path, ...finding })),
    );
}

/**
 * Reads every tracked and new file under `root` that executes.
 *
 * @param {string} root
 * @returns {Finding[]}
 */
export function scanRepository(root) {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const files = [...new Set(listed.split("\0").filter(Boolean))].filter(
    isExecutable,
  );
  const sources = files.map((file) => ({
    path: file,
    text: readFileSync(path.join(root, file), "utf8"),
  }));
  return scanSources(sources);
}

/**
 * The lines to print for a list of findings.
 *
 * @param {Finding[]} findings
 * @returns {string[]}
 */
export function describeFindings(findings) {
  return findings.map(
    ({ file, line, command }) =>
      `${file}:${line}: runs or builds "${command}", which agents never run and no committed file may run (see "Keeping agents from publishing" in docs/plans/0014-sdk-release.md)`,
  );
}

if (isEntryPoint(import.meta.url)) {
  const root = process.argv[2] ?? process.cwd();
  const findings = scanRepository(root);
  if (findings.length > 0) {
    console.error(describeFindings(findings).join("\n"));
    process.exitCode = 1;
  }
}
