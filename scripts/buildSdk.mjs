// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAMP_FILE } from "./buildPackage.mjs";
import { isEntryPoint } from "./entryPoint.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The SDK packages that build to `dist`, in dependency order: a package comes
 * after every SDK package it depends on. `@mapcairn/map` joins the list when
 * it builds too, after `theme`, and then a rebuilt dependency must rebuild it.
 */
export const SDK_BUILD_ORDER = ["core", "react", "theme"];

/** Files that cannot change what a package builds. */
const NOT_BUILD_INPUT = /\.(test\.[cm]?[jt]sx?|snap\.html)$/;

/**
 * The time of the newest file the build reads: the package's sources and its
 * manifest, without tests.
 *
 * @param {string} folder The package folder.
 * @returns {number} Milliseconds since the epoch.
 */
export function newestInput(folder) {
  const files = readdirSync(path.join(folder, "src"), { recursive: true })
    .map((file) => path.join(folder, "src", String(file)))
    .filter((file) => !NOT_BUILD_INPUT.test(file) && statSync(file).isFile());
  return Math.max(
    statSync(path.join(folder, "package.json")).mtimeMs,
    ...files.map((file) => statSync(file).mtimeMs),
  );
}

/**
 * When the package's last build finished.
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
 * Whether a package must be built: it has no finished build, or something it
 * is built from is newer than that build.
 *
 * @param {string} folder The package folder.
 * @returns {boolean}
 */
function isStale(folder) {
  const stamp = stampTime(folder);
  return (
    stamp === undefined ||
    stamp < newestInput(folder) ||
    stamp < statSync(path.join(REPO, "scripts", "buildPackage.mjs")).mtimeMs
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
    if (force || isStale(folder)) {
      const manifest = JSON.parse(
        readFileSync(path.join(folder, "package.json"), "utf8"),
      );
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
