// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAMP_FILE } from "./buildPackage.mjs";
import { isEntryPoint } from "./entryPoint.mjs";
import { BUILT_SDK_PACKAGES } from "./sdkPackages.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The SDK packages that build to `dist`, in dependency order: a package comes
 * after every SDK package it depends on, and a rebuilt dependency rebuilds it
 * (see `isStale`). `map` builds against the built `theme`, so its stylesheet
 * names the same custom properties as `theme`'s `tokens.css`.
 */
export const SDK_BUILD_ORDER = BUILT_SDK_PACKAGES;

/** Files that cannot change what a package builds. */
const NOT_BUILD_INPUT = /\.(test\.[cm]?[jt]sx?|snap\.html)$/;

/** Files at the repository root, and the build scripts, that every package build reads. */
const SHARED_INPUTS = [
  "tsconfig.base.json",
  "package-lock.json",
  "scripts/buildSdk.mjs",
  "scripts/buildPackage.mjs",
  "scripts/entryPoint.mjs",
];

/**
 * The time of the newest file a package build reads: its sources without
 * tests, its manifest and its `tsconfig.json`.
 *
 * @param {string} folder The package folder.
 * @returns {number} Milliseconds since the epoch.
 */
export function newestInput(folder) {
  const files = readdirSync(path.join(folder, "src"), { recursive: true })
    .map((file) => path.join(folder, "src", String(file)))
    .filter((file) => !NOT_BUILD_INPUT.test(file) && statSync(file).isFile());
  const configs = ["package.json", "tsconfig.json"]
    .map((name) => path.join(folder, name))
    .filter((file) => existsSync(file));
  return Math.max(
    ...[...configs, ...files].map((file) => statSync(file).mtimeMs),
  );
}

/**
 * The time of the newest file every package build reads, whichever package.
 *
 * @param {string} [root] The repository root.
 * @returns {number} Milliseconds since the epoch.
 */
export function newestSharedInput(root = REPO) {
  return Math.max(
    ...SHARED_INPUTS.map((file) => statSync(path.join(root, file)).mtimeMs),
  );
}

/**
 * When the package's last build started: the build sets the stamp's time to
 * its start, so an edit made while it ran is newer and builds again.
 *
 * @param {string} folder The package folder.
 * @returns {number | undefined} Milliseconds since the epoch, or `undefined`
 *   when there is no finished build.
 */
export function stampTime(folder) {
  try {
    return statSync(path.join(folder, "dist", STAMP_FILE)).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * The SDK packages a manifest depends on, in build order.
 *
 * @param {{ dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }} manifest
 * @returns {string[]} Folder names, such as `core`.
 */
export function sdkDependenciesOf(manifest) {
  const declared = new Set(
    Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }),
  );
  return SDK_BUILD_ORDER.filter((name) => declared.has(`@mapcairn/${name}`));
}

/**
 * Whether a package must be built: it has no finished build, something it is
 * built from is newer than that build, or an SDK package it depends on was
 * built after it (a package's declarations and stylesheet follow its
 * dependencies' `dist`).
 *
 * @param {string} folder The package folder.
 * @param {string[]} [dependencyFolders] The folders of the SDK packages it
 *   depends on.
 * @returns {boolean}
 */
export function isStale(folder, dependencyFolders = []) {
  const stamp = stampTime(folder);
  if (stamp === undefined) {
    return true;
  }
  const dependencyStamps = dependencyFolders.map(stampTime);
  return (
    stamp < newestInput(folder) ||
    stamp < newestSharedInput() ||
    dependencyStamps.some((built) => built === undefined || built > stamp)
  );
}

/**
 * Builds every SDK package that is out of date, in dependency order, and
 * returns the names it built.
 *
 * @param {{ force?: boolean }} [options] `force` builds every package.
 * @returns {string[]}
 */
export function buildSdk({ force = false } = {}) {
  const built = [];
  for (const name of SDK_BUILD_ORDER) {
    const folder = path.join(REPO, "packages", name);
    const manifest = JSON.parse(
      readFileSync(path.join(folder, "package.json"), "utf8"),
    );
    const dependencyFolders = sdkDependenciesOf(manifest).map((dependency) =>
      path.join(REPO, "packages", dependency),
    );
    if (force || isStale(folder, dependencyFolders)) {
      console.log(`Building ${manifest.name}`);
      const result = spawnSync(
        process.execPath,
        [path.join(REPO, "scripts", "buildPackage.mjs")],
        { cwd: folder, stdio: "inherit" },
      );
      if (result.status !== 0) {
        throw new Error(`The build of ${manifest.name} failed.`);
      }
      built.push(name);
    }
  }
  return built;
}

if (isEntryPoint(import.meta.url)) {
  try {
    buildSdk({ force: process.argv.includes("--force") });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
