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
import { existsSync, readFileSync } from "node:fs";
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
 * 18 kB, theme 56 kB after the contrast check landed, map 470 kB), so a bundled dependency or a stray data
 * file fails and ordinary growth does not. Raising one is a deliberate edit
 * in a pull request.
 *
 * @type {Record<string, number>}
 */
export const SIZE_CEILINGS = {
  core: 1_000_000,
  react: 30_000,
  theme: 80_000,
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

/** The licence every SDK package declares. */
export const EXPECTED_LICENCE = "AGPL-3.0-only";

/**
 * The repository URL every SDK package declares. npm's trusted publishing
 * compares it with the GitHub repository the release workflow runs in and
 * refuses a publish when they differ, so it is npm's normalised form with the
 * owner's capitalisation.
 */
export const EXPECTED_REPOSITORY_URL =
  "git+https://github.com/MapCairn/mapcairn.git";

/** Where the issues of every SDK package are filed. */
export const EXPECTED_BUGS_URL = "https://github.com/MapCairn/mapcairn/issues";

/**
 * What is missing or wrong in the fields the npm page shows beside the
 * README: a repository with the package's own directory, a homepage, the
 * issue tracker, keywords and a description.
 *
 * @param {Record<string, any>} manifest The package manifest.
 * @returns {string[]}
 */
export function metadataProblems(manifest) {
  /** @type {string[]} */
  const problems = [];
  const directory = `packages/${String(manifest.name).replace(/^@[^/]+\//, "")}`;
  const repository = manifest.repository;
  if (typeof repository !== "object" || repository === null) {
    problems.push(
      `repository: must be an object with type, url and directory, found ${JSON.stringify(repository)}`,
    );
  } else {
    if (repository.url !== EXPECTED_REPOSITORY_URL) {
      problems.push(
        `repository.url: must be "${EXPECTED_REPOSITORY_URL}", found ${JSON.stringify(repository.url)}`,
      );
    }
    if (repository.directory !== directory) {
      problems.push(
        `repository.directory: must be "${directory}", found ${JSON.stringify(repository.directory)}`,
      );
    }
  }
  if (typeof manifest.homepage !== "string" || manifest.homepage === "") {
    problems.push("homepage: must be set");
  }
  if (manifest.bugs?.url !== EXPECTED_BUGS_URL) {
    problems.push(
      `bugs.url: must be "${EXPECTED_BUGS_URL}", found ${JSON.stringify(manifest.bugs?.url)}`,
    );
  }
  const { keywords } = manifest;
  if (
    !Array.isArray(keywords) ||
    keywords.length === 0 ||
    !keywords.every((word) => typeof word === "string" && word !== "")
  ) {
    problems.push("keywords: must be a non-empty list of words");
  }
  if (
    typeof manifest.description !== "string" ||
    manifest.description.trim() === ""
  ) {
    problems.push("description: must be set");
  }
  return problems;
}

/**
 * The map of a module compiled from a `*.css.ts` file. The plugin that
 * compiles it records no source, so an empty list is what the build writes.
 */
const STYLES_MAP = /\.styles\.js\.map$/;

/**
 * Scripts the build writes with no source map: the entry points (which only
 * re-export) are found through `exports`, and rolldown's helper module sits
 * under `dist/_virtual`.
 */
const UNMAPPED_SCRIPT_FOLDER = "dist/_virtual/";

/** A path that names a place on one machine: a rooted path, a drive or a URL. */
const MACHINE_PATH = /^(?:[/\\]|[A-Za-z]:|[A-Za-z][A-Za-z0-9+.-]*:\/\/)/;

/**
 * What is wrong with a source map, and the files it names.
 *
 * @param {string} file The map's path in the tarball, such as `dist/a/b.js.map`.
 * @param {string | undefined} text The map's text, `undefined` when unreadable.
 * @returns {{ problems: string[], sources: string[] }} The sources are paths
 *   relative to the package that resolve into its `src`.
 */
export function checkSourceMap(file, text) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const sources = [];
  let map;
  try {
    map = JSON.parse(text ?? "");
  } catch {
    return { problems: [`${file}: not a readable source map`], sources };
  }
  const root = typeof map.sourceRoot === "string" ? map.sourceRoot : "";
  const isArray = Array.isArray(map.sources);
  if (!isArray || (map.sources.length === 0 && !STYLES_MAP.test(file))) {
    problems.push(`${file}: has no sources`);
  }
  if (MACHINE_PATH.test(root)) {
    problems.push(`${file}: sourceRoot "${root}" names a place on one machine`);
  }
  for (const source of Array.isArray(map.sources) ? map.sources : []) {
    if (typeof source !== "string" || MACHINE_PATH.test(source)) {
      problems.push(
        `${file}: source ${JSON.stringify(source)} names a place on one machine`,
      );
      continue;
    }
    const resolved = path.posix.normalize(
      path.posix.join(
        path.posix.dirname(file),
        root.replaceAll("\\", "/"),
        source.replaceAll("\\", "/"),
      ),
    );
    if (resolved.startsWith("src/") && !resolved.split("/").includes("..")) {
      sources.push(resolved);
    } else {
      problems.push(
        `${file}: source "${source}" resolves to ${resolved}, outside the package's src`,
      );
    }
  }
  return { problems, sources };
}

/**
 * What is wrong with the files under `dist`, beyond their names: a script
 * needs a readable source map that names files in `src` (an entry point and
 * rolldown's helper module are the two exceptions), a map needs its script,
 * and a declaration or stylesheet must be one an export names. A file
 * a build did not make, such as a stray `dist/secret.js`, has none of these.
 *
 * @param {{
 *   paths: string[],
 *   targets: string[],
 *   readFile: (file: string) => string | undefined,
 *   sourceExists: (source: string) => boolean,
 * }} input
 * @returns {string[]}
 */
function buildProblems({ paths, targets, readFile, sourceExists }) {
  /** @type {string[]} */
  const problems = [];
  const present = new Set(paths);
  const named = new Set(targets);
  for (const file of paths.filter((entry) => entry.startsWith("dist/"))) {
    if (file.endsWith(".js") && !present.has(`${file}.map`)) {
      if (named.has(file) || file.startsWith(UNMAPPED_SCRIPT_FOLDER)) {
        continue;
      }
      problems.push(
        `${file}: no source map, so nothing says what it was built from`,
      );
    } else if (file.endsWith(".js.map")) {
      if (!present.has(file.slice(0, -".map".length))) {
        problems.push(`${file}: a source map with no script`);
        continue;
      }
      const checked = checkSourceMap(file, readFile(file));
      problems.push(...checked.problems);
      for (const source of checked.sources.filter(
        (entry) => !sourceExists(entry),
      )) {
        problems.push(`${file}: source ${source} is not a file in the package`);
      }
    } else if (/\.(?:d\.ts|css)$/.test(file) && !named.has(file)) {
      problems.push(
        `${file}: not named by exports or types, so no build step is known to make it`,
      );
    }
  }
  return problems;
}

/**
 * Everything wrong with one package's tarball and manifest.
 *
 * @param {{
 *   manifest: Record<string, any>,
 *   listing: { size: number, files: { path: string }[] },
 *   ceiling: number,
 *   readFile: (file: string) => string | undefined,
 *   sourceExists: (source: string) => boolean,
 * }} input `listing` is one element of `npm pack --dry-run --json`;
 *   `readFile` reads a packed file by its path in the tarball and
 *   `sourceExists` says whether a path relative to the package is a file.
 * @returns {string[]} One message for each problem, none when it is fine.
 */
export function checkPackage({
  manifest,
  listing,
  ceiling,
  readFile,
  sourceExists,
}) {
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
  for (const required of ROOT_FILES) {
    if (!present.has(required)) {
      problems.push(`${required}: missing from the tarball`);
    }
  }
  const targets = exportTargetsOf(manifest);
  for (const target of targets) {
    if (!present.has(target)) {
      problems.push(
        `${target}: named by exports or types, but not in the tarball`,
      );
    }
  }
  problems.push(...buildProblems({ paths, targets, readFile, sourceExists }));
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
  if (manifest.license !== EXPECTED_LICENCE) {
    problems.push(
      `license: must be "${EXPECTED_LICENCE}", found ${JSON.stringify(manifest.license)}`,
    );
  }
  problems.push(...metadataProblems(manifest));
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

/** The text of a file, or `undefined` when it cannot be read. */
function readIfPresent(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Packs every SDK package as a dry run and checks each one.
 *
 * @param {string} [root] The repository root.
 * @returns {Array<{ name: string, files: number, size: number, unpackedSize: number, problems: string[] }>} One entry for each package, in release order; `name` is the package name.
 */
export function packResults(root = REPO) {
  return PACKAGES.map((folderName) => {
    const folder = path.join(root, "packages", folderName);
    const manifest = JSON.parse(
      readFileSync(path.join(folder, "package.json"), "utf8"),
    );
    const listing = listPackage(folder);
    return {
      name: String(manifest.name),
      files: listing.files.length,
      size: listing.size,
      unpackedSize: listing.unpackedSize,
      problems: checkPackage({
        manifest,
        listing,
        ceiling: SIZE_CEILINGS[folderName] ?? 0,
        readFile: (file) => readIfPresent(path.join(folder, file)),
        sourceExists: (source) => existsSync(path.join(folder, source)),
      }),
    };
  });
}

/**
 * Checks every SDK package and prints one line for each.
 *
 * @param {string} [root] The repository root.
 * @returns {boolean} Whether every package passed.
 */
export function runPackCheck(root = REPO) {
  let passed = true;
  for (const result of packResults(root)) {
    const summary = `${result.name}: ${result.files} files, ${result.size} bytes packed, ${result.unpackedSize} unpacked`;
    if (result.problems.length === 0) {
      console.log(`ok   ${summary}`);
      continue;
    }
    passed = false;
    console.error(`FAIL ${summary}`);
    for (const problem of result.problems) {
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
