// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Fails when a tracked file points at a guide that moved from `docs/guides/`
 * into the documentation site (`sites/docs/docs/guides/`), by a path, a link or
 * a sibling link inside `docs/guides/`. The names are in `movedGuides.json`;
 * the pull request that moves a guide adds its name there. Addresses on the
 * documentation site itself are not read, because they are the right place to
 * link to.
 *
 *   node scripts/moved-guides-check.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "./entryPoint.mjs";

/** Files that name a moved guide on purpose: this check, its list and its test, and released notes. */
const EXEMPT_FILES = new Set([
  "CHANGELOG.md",
  "scripts/moved-guides-check.mjs",
  "scripts/movedGuides.json",
  "packages/core/src/lint/movedGuides.test.ts",
]);
const TEXT_FILE = /\.(?:md|mdx|ts|tsx|mjs|cjs|yml|yaml|json|jsonc)$/;
/** Lockfiles name no guide and are large. */
const SKIPPED_FILE = /(?:^|\/)package-lock\.json$/;
const GUIDES_FOLDER = "docs/guides/";
/** An address on the documentation site, which may end in a guide's name. */
const SITE_URL = /https?:\/\/(?:docs\.)?mapcairn\.com\/\S*/g;

/**
 * The names of the guides that moved, read from `movedGuides.json`.
 *
 * @param {string} root The repository root.
 * @returns {string[]}
 */
export function readMovedGuides(root) {
  return JSON.parse(
    readFileSync(join(root, "scripts/movedGuides.json"), "utf8"),
  );
}

/**
 * Whether the tracked file is one the check reads.
 *
 * @param {string} path Repository-relative path with forward slashes.
 * @returns {boolean}
 */
export function isChecked(path) {
  return (
    TEXT_FILE.test(path) && !SKIPPED_FILE.test(path) && !EXEMPT_FILES.has(path)
  );
}

/** The pattern for a repository path to a guide: not part of a longer name or of `sites/docs/docs/guides/`. */
function repositoryPath(name) {
  return new RegExp(`(?<!sites/docs/)docs/guides/${name}(?:\\.md)?(?![\\w/-])`);
}

/** The pattern for a link from one guide to a sibling by its file name. */
function siblingLink(name) {
  return new RegExp(`\\]\\((?:\\./)?${name}\\.md[)#]`);
}

/**
 * Each reference in a file to a guide that moved, with its line.
 *
 * @param {string} file Repository-relative path with forward slashes.
 * @param {string} text The file's text.
 * @param {readonly string[]} moved The names of the guides that moved.
 * @returns {{ line: number, guide: string }[]}
 */
export function findMovedGuideReferences(file, text, moved) {
  const inGuides = file.startsWith(GUIDES_FOLDER);
  const references = [];
  text.split(/\r?\n/).forEach((content, index) => {
    const visible = content.replace(SITE_URL, "");
    for (const guide of moved) {
      const hit =
        repositoryPath(guide).test(visible) ||
        (inGuides && siblingLink(guide).test(visible));
      if (hit) {
        references.push({ line: index + 1, guide });
      }
    }
  });
  return references;
}

/**
 * Reports every reference in the tracked files.
 *
 * @param {typeof execFileSync} [exec] Runs git.
 * @param {(line: string) => void} [log] Receives a clean result.
 * @param {(line: string) => void} [error] Receives the references.
 * @returns {number} The exit code.
 */
export function main(
  exec = execFileSync,
  log = console.log,
  error = console.error,
) {
  const root = exec("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const moved = readMovedGuides(root);
  const files = exec("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((file) => file !== "" && isChecked(file))
    .filter((file) => existsSync(join(root, file)));
  const reports = files.flatMap((file) =>
    findMovedGuideReferences(
      file,
      readFileSync(join(root, file), "utf8"),
      moved,
    ).map(
      ({ line, guide }) =>
        `${file}:${line}: docs/guides/${guide}.md moved to sites/docs/docs/guides/${guide}.md (the site's /guides/${guide}/)`,
    ),
  );
  if (reports.length > 0) {
    error(
      `moved guides: ${reports.length} reference(s) to a guide that moved\n${reports.join("\n")}`,
    );
    return 1;
  }
  log(
    `moved guides: ${files.length} files checked, none point at a moved guide`,
  );
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = main();
}
