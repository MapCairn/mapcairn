// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The settings and lookups for the consumer check's Worker, Yarn and Bun legs
 * (`consumerCheck.mjs`), kept apart so they can be tested without installing
 * anything.
 */
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The conditions a Worker bundle resolves the packages with: `workerd` first,
 * then the generic `worker` and `browser` ones. Plain Node resolves `node`
 * and `default` instead, which is why a Node render does not prove a Worker.
 */
export const WORKER_CONDITIONS = ["workerd", "worker", "browser"];

/**
 * The Yarn Berry release the check runs, through corepack. It is exact, and
 * older than the repository's seven-day minimum release age.
 */
export const YARN_VERSION = "4.18.1";

/** Seven days, in the seconds Bun counts a release age in. */
export const BUN_MINIMUM_RELEASE_AGE = 7 * 24 * 60 * 60;

/**
 * Yarn's settings for the throwaway app: real `node_modules` (what most
 * projects use), no lifecycle scripts, no telemetry, a lockfile that may be
 * created (the app has none, and Yarn's hardened mode on a pull request
 * forbids that), and the same seven-day
 * minimum release age as the repository's `.npmrc`.
 *
 * @returns {string} The text of `.yarnrc.yml`.
 */
export function yarnSettings() {
  return [
    "nodeLinker: node-modules",
    "enableScripts: false",
    "enableImmutableInstalls: false",
    "enableHardenedMode: false",
    "enableTelemetry: false",
    'npmMinimalAgeGate: "7d"',
    "",
  ].join("\n");
}

/**
 * The manifest Yarn reads: Yarn ignores npm's `overrides` and takes
 * `resolutions`, so each SDK package resolves to its tarball.
 *
 * @param {{ overrides: Record<string, string> } & Record<string, unknown>} manifest
 *   The consumer manifest.
 * @returns {Record<string, unknown>}
 */
export function yarnManifest(manifest) {
  return { ...manifest, resolutions: manifest.overrides };
}

/**
 * Bun's settings for the throwaway app: the same seven-day minimum release
 * age as the repository's `.npmrc`, in Bun's own unit.
 *
 * @returns {string} The text of `bunfig.toml`.
 */
export function bunSettings() {
  return `[install]\nminimumReleaseAge = ${BUN_MINIMUM_RELEASE_AGE}\n`;
}

/**
 * The line for a skipped leg. On GitHub Actions it is a warning annotation,
 * so a runner without the tool shows up on the run's page.
 *
 * @param {string} message What was skipped and why.
 * @param {NodeJS.ProcessEnv} env The environment to read.
 */
function skipLine(message, env) {
  return env.GITHUB_ACTIONS === "true" ? `::warning::${message}` : message;
}

/**
 * The line for a skipped Yarn install. Yarn comes from corepack, which ships
 * with Node 24 and earlier; nothing is installed for it.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function yarnSkipped(env = process.env) {
  return skipLine(
    "the Yarn install was skipped: this Node has no corepack to fetch Yarn with",
    env,
  );
}

/**
 * The line for a skipped Bun install. Bun is not installed for the check.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @returns {string}
 */
export function bunSkipped(env = process.env) {
  return skipLine(
    "the Bun install was skipped: Bun is not on the path, and the check does not install it",
    env,
  );
}

/**
 * Where corepack's script is, so it can be run with `node` on every system,
 * found the way `npmCliPath` finds npm: in the folder that holds the node
 * binary (the Windows installer) or beside it (`lib/node_modules`). Node 25
 * and later ship none.
 *
 * @param {string} [execPath] The node binary.
 * @returns {string | undefined} The absolute path of `corepack.js`, if any.
 */
export function corepackCliPath(execPath = process.execPath) {
  const folder = path.dirname(execPath);
  return [
    path.join(folder, "node_modules", "corepack", "dist", "corepack.js"),
    path.join(
      folder,
      "..",
      "lib",
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    ),
  ].find((candidate) => existsSync(candidate));
}
