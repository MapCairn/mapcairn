/**
 * Walks the repository, applies the harmony rules and filters the result
 * through the exempt surfaces and the allow-list.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOW_LIST } from "./allowlist.mjs";
import { EXEMPT_SURFACES, isTestOrToolingFile } from "./config.mjs";
import { scanSource } from "./rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repository root, two levels above this directory. */
export const REPO_ROOT = path.resolve(HERE, "..", "..");

const SKIP_DIRS = new Set([
  "node_modules",
  "build",
  "dist",
  "coverage",
  ".react-router",
  "test-results",
  "playwright-report",
  ".wrangler",
  "e2e",
  "scripts",
  "project.inlang",
  "paraglide",
]);

/**
 * Every file the scanner reads: scripts, styles and html under `packages`,
 * and under `examples`, whose apps follow the same design rules.
 * @param {string} root
 * @returns {string[]} Repository relative paths with forward slashes.
 */
export function listSourceFiles(root = REPO_ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(rel);
        }
      } else if (/\.(ts|tsx|css|html)$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  walk("packages");
  walk("examples");
  return out.sort();
}

/**
 * Whether the scanner skips this file entirely.
 * @param {string} file
 * @returns {boolean}
 */
export function isExemptSurface(file) {
  return (
    isTestOrToolingFile(file) ||
    EXEMPT_SURFACES.some(({ pattern }) => pattern.test(file))
  );
}

/**
 * Removes violations the allow-list excuses.
 * @param {import("./rules.mjs").Violation[]} violations
 * @param {(file: string) => string[]} linesOf Source lines of a file.
 * @param {typeof ALLOW_LIST} [allowList]
 * @returns {{ violations: import("./rules.mjs").Violation[], unused: typeof ALLOW_LIST }}
 */
export function applyAllowList(violations, linesOf, allowList = ALLOW_LIST) {
  const used = new Set();
  const kept = violations.filter((violation) => {
    const text = linesOf(violation.file)[violation.line - 1] ?? "";
    const index = allowList.findIndex(
      (entry) =>
        entry.rule === violation.rule &&
        entry.file === violation.file &&
        text.includes(entry.contains),
    );
    if (index === -1) {
      return true;
    }
    used.add(index);
    return false;
  });
  return {
    violations: kept,
    unused: allowList.filter((_, index) => !used.has(index)),
  };
}

/**
 * Scans the repository.
 * @param {object} [options]
 * @param {string} [options.root] Repository root.
 * @param {typeof ALLOW_LIST} [options.allowList]
 * @returns {{ violations: import("./rules.mjs").Violation[], unused: typeof ALLOW_LIST, scanned: number }}
 */
export function scanRepo({ root = REPO_ROOT, allowList = ALLOW_LIST } = {}) {
  const cache = new Map();
  const linesOf = (file) => cache.get(file) ?? [];
  const all = [];
  let scanned = 0;
  for (const file of listSourceFiles(root)) {
    if (isExemptSurface(file)) {
      continue;
    }
    const source = readFileSync(path.join(root, file), "utf8");
    cache.set(file, source.split("\n"));
    scanned += 1;
    all.push(...scanSource(file, source));
  }
  const { violations, unused } = applyAllowList(all, linesOf, allowList);
  return { violations, unused, scanned };
}
