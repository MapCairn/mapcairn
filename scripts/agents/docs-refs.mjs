// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Lists the references in Markdown files that point at nothing: a file or
 * folder named in backticks, a relative link, or an `npm run` script that does
 * not exist. The `review-docs` skill runs it first, so the reviewer spends its
 * reading on claims a script cannot check.
 *
 *   node scripts/agents/docs-refs.mjs <file.md>...
 *
 * Exit 0 when every reference resolves, 1 when one does not.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const LINK = /\]\(([^)\s]+)\)/g;
const NPM_RUN = /npm run ([\w:.-]+)/;
const WORKSPACE_FLAG = /(?:-w|--workspace[= ])\s*(\S+)/;

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
    const token = raw.replace(/:\d+$/, "").replace(/[.,;:)]+$/, "");
    if (token === "" || /[*<>{}$|=]|\.\.\.|^(?:[a-z]+:|[/@~-])/.test(token)) {
      continue;
    }
    const segments = token.split("/");
    if (segments.some((s) => PLACEHOLDER_SEGMENTS.has(s))) {
      continue;
    }
    if (segments.some((s) => GENERATED_SEGMENTS.has(s))) {
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
    const bare = target.split("#")[0];
    if (bare === "" || /^[a-z]+:/.test(bare)) {
      continue;
    }
    const resolved = path.posix.normalize(path.posix.join(folder, bare));
    if (!context.exists(resolved) && !context.exists(bare)) {
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
 * Finds the references in one Markdown file that do not resolve.
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
  const folder = path.posix.dirname(file);
  const dead = [];
  text.split("\n").forEach((content, index) => {
    const refs = deadLinks(content, folder, context);
    for (const [, span] of content.matchAll(CODE_SPAN)) {
      refs.push(...deadInSpan(span, folder, context));
    }
    dead.push(...refs.map((ref) => ({ line: index + 1, ref })));
  });
  return dead;
}

/** The scripts a package.json declares. */
function scriptsOf(file) {
  return new Set(
    Object.keys(JSON.parse(readFileSync(file, "utf8")).scripts ?? {}),
  );
}

/** Builds the context from the working tree, which is the current folder. */
function readContext() {
  const workspaces = new Map();
  for (const entry of ["packages", "examples"]) {
    if (!existsSync(entry)) {
      continue;
    }
    for (const name of readdirSync(entry)) {
      const manifest = path.join(entry, name, "package.json");
      if (existsSync(manifest)) {
        const { name: packageName } = JSON.parse(
          readFileSync(manifest, "utf8"),
        );
        workspaces.set(packageName, scriptsOf(manifest));
      }
    }
  }
  const tracked = execFileSync("git", ["ls-files"], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  }).split("\n");
  return {
    exists: (repoPath) => existsSync(repoPath),
    // A path written relative to a package, such as src/app/root.tsx.
    isInside: (partial) =>
      tracked.some(
        (f) => f.endsWith(`/${partial}`) || f.includes(`/${partial}/`),
      ),
    topLevel: new Set(readdirSync(".")),
    scripts: { root: scriptsOf("package.json"), workspaces },
  };
}

/** Prints each dead reference as `file:line - ref` and sets the exit code. */
function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node scripts/agents/docs-refs.mjs <file.md>...");
    process.exitCode = 2;
    return;
  }
  const context = readContext();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const { line, ref } of findDeadReferences(file, text, context)) {
      console.log(`${file}:${line} - ${ref}`);
      process.exitCode = 1;
    }
  }
}

if (isEntryPoint(import.meta.url)) {
  main();
}
