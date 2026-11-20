// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Lists the references in Markdown files that point at nothing: a file or
 * folder named in backticks or in a code block, a relative link, or an
 * `npm run` script that does not exist. The `review-docs` skill runs it first,
 * so the reviewer spends its reading on claims a script cannot check.
 *
 *   node scripts/agents/docs-refs.mjs [--ref <commit>] <file.md>...
 *
 * Without `--ref` it reads the working tree: the files git tracks, plus new
 * files git does not ignore. With `--ref` it reads the documents and the list
 * of files from that commit through git, so a pull request head that was only
 * fetched needs no checkout. Names are matched exactly, whatever the system's
 * rule for letter case.
 *
 * Exit 0 when every reference resolves, 1 when one does not, 2 for a usage
 * error or a file that cannot be read.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isEntryPoint } from "../entryPoint.mjs";

/** Folders that are build output or installed, so absent from a clean checkout. */
const GENERATED_SEGMENTS = new Set([
  "dist",
  ".cloudflare",
  ".react-router",
  "node_modules",
  "coverage",
]);
/** Extensions that mark a token as a file name even when its folder is unknown. */
const FILE_EXTENSION = /\.(?:md|json|jsonc|mjs|cjs|ts|tsx|yml|yaml|css|toml)$/;
/** Folder names a prose example uses as a stand-in for a real one. */
const PLACEHOLDER_SEGMENTS = new Set(["path", "your", "example", "foo"]);
const CODE_SPAN = /`([^`\n]+)`/g;
const FENCE = /^\s*(?:```|~~~)/;
const LINK = /\]\(([^)\s]+)\)/g;
const NPM_RUN = /npm run ([\w:.-]+)/;
const WORKSPACE_FLAG = /(?:-w|--workspace[= ])\s*(\S+)/;
const WORKSPACE_MANIFEST = /^(?:packages|examples)\/[^/]+\/package\.json$/;
/** The most references printed; the rest are counted. */
const MAX_PRINTED = 50;
const MAX_GIT_OUTPUT_BYTES = 1 << 26;

/** The text with Windows separators changed to the forward slash. */
function forwardSlashes(text) {
  return text.replaceAll("\\", "/");
}

/**
 * Each token of a code span that names a repository path, without a trailing
 * line number or punctuation.
 *
 * @param {string} span
 * @param {{ topLevel: Set<string> }} context
 * @returns {string[]}
 */
function pathsIn(span, context) {
  const found = [];
  for (const raw of span.split(/\s+/)) {
    const token = forwardSlashes(raw)
      .replace(/:\d+$/, "")
      .replace(/[.,;:)]+$/, "");
    if (token === "" || /[*<>{}$|=]|\.\.\.|^(?:[a-z]+:|[/@~-])/.test(token)) {
      continue;
    }
    const segments = token.split("/");
    if (
      segments.some(
        (s) => PLACEHOLDER_SEGMENTS.has(s) || GENERATED_SEGMENTS.has(s),
      )
    ) {
      continue;
    }
    const isRootDocument =
      segments.length === 1 && /^[A-Z][A-Z_]*\.md$/.test(token);
    const isRepoPath =
      segments.length > 1 &&
      (context.topLevel.has(segments[0]) || FILE_EXTENSION.test(token)) &&
      !/^[a-z]+\/[a-z]+$/.test(token);
    if (isRootDocument || isRepoPath) {
      found.push(token.replace(/\/$/, ""));
    }
  }
  return found;
}

/** The relative links on one line that resolve to nothing. */
function deadLinks(content, folder, context) {
  const dead = [];
  for (const [, target] of content.matchAll(LINK)) {
    const bare = forwardSlashes(target.split("#")[0]);
    if (bare === "" || /^[a-z]+:/.test(bare)) {
      continue;
    }
    const resolved = bare.startsWith("/")
      ? bare.slice(1)
      : path.posix.normalize(path.posix.join(folder, bare));
    if (!context.exists(resolved)) {
      dead.push(bare);
    }
  }
  return dead;
}

/** The paths and the `npm run` script in one code span that resolve to nothing. */
function deadInSpan(span, folder, context) {
  const dead = pathsIn(span, context).filter((token) => {
    const here = path.posix.normalize(path.posix.join(folder, token));
    return (
      !context.exists(token) &&
      !context.exists(here) &&
      !context.isInside(token)
    );
  });
  const run = NPM_RUN.exec(span);
  if (run === null) {
    return dead;
  }
  const workspace = WORKSPACE_FLAG.exec(span)?.[1];
  const known =
    workspace === undefined
      ? context.scripts.root
      : context.scripts.workspaces.get(workspace);
  if (known === undefined || !known.has(run[1])) {
    dead.push(span.slice(span.indexOf("npm run")));
  }
  return dead;
}

/**
 * Finds the references in one Markdown file that do not resolve, in text and
 * in fenced code blocks.
 *
 * @param {string} file Repository-relative path of the file.
 * @param {string} text The file's text.
 * @param {{
 *   exists: (repoPath: string) => boolean,
 *   isInside: (partialPath: string) => boolean,
 *   topLevel: Set<string>,
 *   scripts: { root: Set<string>, workspaces: Map<string, Set<string>> },
 * }} context
 * @returns {{ line: number, ref: string }[]}
 */
export function findDeadReferences(file, text, context) {
  const folder = path.posix.dirname(forwardSlashes(file));
  const dead = [];
  let inFence = false;
  text.split("\n").forEach((content, index) => {
    if (FENCE.test(content)) {
      inFence = !inFence;
      return;
    }
    const refs = deadLinks(content, folder, context);
    const spans = inFence
      ? [content]
      : [...content.matchAll(CODE_SPAN)].map((match) => match[1]);
    for (const span of spans) {
      refs.push(...deadInSpan(span, folder, context));
    }
    dead.push(...refs.map((ref) => ({ line: index + 1, ref })));
  });
  return dead;
}

/** The scripts a package.json text declares. */
function scriptsIn(manifestText) {
  return new Set(Object.keys(JSON.parse(manifestText).scripts ?? {}));
}

/**
 * Builds the context from a list of repository files and a function that
 * reads one of them, so the working tree and a commit are read the same way.
 *
 * @param {string[]} files Every repository-relative path, with forward slashes.
 * @param {(repoPath: string) => string} read Returns a file's text.
 */
export function buildContext(files, read) {
  const known = new Set();
  for (const file of files) {
    const parts = file.split("/");
    for (let end = 1; end <= parts.length; end += 1) {
      known.add(parts.slice(0, end).join("/"));
    }
  }
  const workspaces = new Map();
  for (const file of files.filter((f) => WORKSPACE_MANIFEST.test(f))) {
    const text = read(file);
    workspaces.set(JSON.parse(text).name, scriptsIn(text));
  }
  return {
    exists: (repoPath) => known.has(repoPath),
    // A path written relative to a package, such as src/app/root.tsx.
    isInside: (partial) =>
      files.some(
        (f) => f.endsWith(`/${partial}`) || f.includes(`/${partial}/`),
      ),
    topLevel: new Set(files.map((f) => f.split("/")[0])),
    scripts: { root: scriptsIn(read("package.json")), workspaces },
  };
}

/** Runs git and returns its output. */
function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The files and the reader for a commit, or for the working tree. */
function source(ref) {
  if (ref !== undefined) {
    return {
      files: git(["ls-tree", "-r", "--name-only", ref]).split("\n"),
      read: (repoPath) => git(["show", `${ref}:${repoPath}`]),
    };
  }
  const listed =
    git(["ls-files"]) + git(["ls-files", "--others", "--exclude-standard"]);
  return {
    files: listed.split("\n"),
    read: (repoPath) => readFileSync(repoPath, "utf8"),
  };
}

/**
 * Splits the arguments into the commit and the Markdown files.
 *
 * @param {string[]} args
 * @returns {{ ref: string | undefined, files: string[] }}
 */
export function parseArguments(args) {
  const flag = args.indexOf("--ref");
  const ref = flag === -1 ? undefined : args[flag + 1];
  const rest =
    flag === -1 ? args : args.filter((_, i) => i !== flag && i !== flag + 1);
  return { ref, files: rest.map(forwardSlashes) };
}

/** Prints each dead reference as `file:line - ref` and sets the exit code. */
function main() {
  const { ref, files } = parseArguments(process.argv.slice(2));
  const wantsRef = process.argv.includes("--ref");
  if (files.length === 0 || (wantsRef && ref === undefined)) {
    console.error(
      "usage: node scripts/agents/docs-refs.mjs [--ref <commit>] <file.md>...",
    );
    process.exitCode = 2;
    return;
  }
  try {
    const { files: all, read } = source(ref);
    const context = buildContext(all.filter(Boolean), read);
    const lines = files.flatMap((file) =>
      findDeadReferences(file, read(file), context).map(
        ({ line, ref: target }) => `${file}:${line} - ${target}`,
      ),
    );
    console.log(lines.slice(0, MAX_PRINTED).join("\n") || "no dead references");
    if (lines.length > MAX_PRINTED) {
      console.log(`${lines.length - MAX_PRINTED} more`);
    }
    process.exitCode = lines.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`docs-refs: ${error.message.split("\n")[0]}`);
    process.exitCode = 2;
  }
}

if (isEntryPoint(import.meta.url)) {
  main();
}
