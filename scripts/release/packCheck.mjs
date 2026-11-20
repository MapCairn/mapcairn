// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Fails when a tarball of an SDK package would hold something it should not,
 * or lacks something its manifest points at.
 *
 *   npm run pack:check
 *
 * It lists each package with `npm pack --dry-run --json`, so it writes no
 * tarball, and works on a private package (npm packs one; only `publish`
 * refuses). `consumerCheck.mjs` packs the real tarballs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { runNpm } from "./npm.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The packages that are packed, in release order. */
export const PACKAGES = ["core", "react", "theme", "map"];

/**
 * The most a tarball may weigh, in bytes of the packed `.tgz`. Set at about
 * one and a half times what each measured on 2026-11-20 (core 692 kB, react
 * 18 kB, theme 41 kB, map 470 kB), so a bundled dependency or a stray data
 * file fails and ordinary growth does not. Raising one is a deliberate edit
 * in a pull request.
 *
 * @type {Record<string, number>}
 */
export const SIZE_CEILINGS = {
  core: 1_000_000,
  react: 30_000,
  theme: 60_000,
  map: 700_000,
};

/** The `files` every SDK package declares: the build, without its stamp. */
export const EXPECTED_FILES_FIELD = ["dist", "!dist/.built"];

/** What npm always adds, whatever `files` says, at the top of a tarball. */
const ROOT_FILES = new Set(["package.json", "README.md", "LICENSE"]);

/**
 * The endings a file under `dist` may have: JavaScript, its source map,
 * declarations and a stylesheet. Nothing else is built, so a data file, an
 * image, a font or a tile archive is not on it.
 */
const DIST_ENDING = /\.(?:js|js\.map|d\.ts|css)$/;

/** Names of tests and snapshots, which never belong in a tarball. */
const TEST_NAME = /(?:\.(?:test|spec)\.|\.snap\.|(?:^|\/)__\w+__\/)/;

/**
 * Why a path in a tarball is not allowed, or `undefined` when it is. A
 * tarball may hold npm's three root files and files under `dist` with a
 * built ending, and no dotfile (a `.built` stamp or `.env` file) anywhere.
 *
 * @param {string} file The path in the tarball, with forward slashes.
 * @returns {string | undefined}
 */
export function classifyFile(file) {
  if (file.split("/").some((part) => part.startsWith("."))) {
    return `${file}: a dotfile`;
  }
  if (ROOT_FILES.has(file)) {
    return undefined;
  }
  if (!file.startsWith("dist/")) {
    return `${file}: outside the allowed set (dist, package.json, README.md, LICENSE)`;
  }
  if (/(?:^|\/)__\w+__\//.test(file)) {
    return `${file}: a snapshot`;
  }
  if (TEST_NAME.test(file)) {
    return `${file}: a test or snapshot file`;
  }
  if (!DIST_ENDING.test(file)) {
    return `${file}: an extension a build does not produce (allowed under dist: .js, .js.map, .d.ts, .css)`;
  }
  return undefined;
}

/**
 * The files a manifest's `exports` and `types` point at, relative to the
 * package and without `./`, in the order they are declared. The
 * `@mapcairn/source` condition is left out: it points at a file in this
 * repository that a tarball does not hold, and a consumer never turns it on.
 *
 * @param {Record<string, any>} manifest The package manifest.
 * @returns {string[]}
 */
export function exportTargetsOf(manifest) {
  /** @type {string[]} */
  const targets = [];
  /** @param {unknown} value */
  const collect = (value) => {
    if (typeof value === "string") {
      targets.push(value);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [condition, nested] of Object.entries(value)) {
        if (condition !== "@mapcairn/source") {
          collect(nested);
        }
      }
    }
  };
  collect(manifest.types);
  collect(manifest.exports);
  return [...new Set(targets.map((target) => target.replace(/^\.\//, "")))];
}

/**
 * Everything wrong with one package's tarball and manifest.
 *
 * @param {{
 *   manifest: Record<string, any>,
 *   listing: { size: number, files: { path: string }[] },
 *   ceiling: number,
 * }} input `listing` is one element of `npm pack --dry-run --json`.
 * @returns {string[]} One message for each problem, none when it is fine.
 */
export function checkPackage({ manifest, listing, ceiling }) {
  /** @type {string[]} */
  const problems = [];
  const paths = listing.files.map((file) => file.path.replaceAll("\\", "/"));
  for (const file of paths) {
    const reason = classifyFile(file);
    if (reason !== undefined) {
      problems.push(reason);
    }
  }
  const present = new Set(paths);
  for (const target of exportTargetsOf(manifest)) {
    if (!present.has(target)) {
      problems.push(
        `${target}: named by exports or types, but not in the tarball`,
      );
    }
  }
  if (listing.size > ceiling) {
    problems.push(
      `size: ${listing.size} bytes is over the ceiling of ${ceiling}`,
    );
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(EXPECTED_FILES_FIELD)) {
    problems.push(
      `files: must be ${JSON.stringify(EXPECTED_FILES_FIELD)}, found ${JSON.stringify(manifest.files)}`,
    );
  }
  if (manifest.publishConfig?.access !== "public") {
    problems.push('publishConfig: must set "access" to "public"');
  }
  if ("main" in manifest) {
    problems.push("main: the packages are ESM only and set no main field");
  }
  return problems;
}

/**
 * Lists one package as npm would pack it.
 *
 * @param {string} folder The package folder.
 * @returns {{ size: number, unpackedSize: number, files: { path: string }[] }}
 */
function listPackage(folder) {
  const result = runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: folder,
  });
  if (result.status !== 0) {
    throw new Error(`npm pack failed in ${folder}:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout)[0];
}

/**
 * Checks every SDK package and prints one line for each.
 *
 * @param {string} [root] The repository root.
 * @returns {boolean} Whether every package passed.
 */
export function runPackCheck(root = REPO) {
  let passed = true;
  for (const name of PACKAGES) {
    const folder = path.join(root, "packages", name);
    const manifest = JSON.parse(
      readFileSync(path.join(folder, "package.json"), "utf8"),
    );
    const listing = listPackage(folder);
    const problems = checkPackage({
      manifest,
      listing,
      ceiling: SIZE_CEILINGS[name] ?? 0,
    });
    const summary = `${manifest.name}: ${listing.files.length} files, ${listing.size} bytes packed, ${listing.unpackedSize} unpacked`;
    if (problems.length === 0) {
      console.log(`ok   ${summary}`);
      continue;
    }
    passed = false;
    console.error(`FAIL ${summary}`);
    for (const problem of problems) {
      console.error(`       ${problem}`);
    }
  }
  return passed;
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.exitCode = runPackCheck() ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
