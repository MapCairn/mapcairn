// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where npm's command line script is, so it can be run with `node` on every
 * system. `npm run` sets `npm_execpath`; run directly, the script sits in the
 * folder that holds the node binary (the Windows installer) or beside it
 * (`lib/node_modules`, which Unix installers and version managers use).
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to read.
 * @param {string} [execPath] The node binary.
 * @returns {string} The absolute path of `npm-cli.js`.
 */
export function npmCliPath(env = process.env, execPath = process.execPath) {
  const fromEnv = env.npm_execpath;
  if (fromEnv && /npm-cli\.[cm]?js$/.test(fromEnv) && existsSync(fromEnv)) {
    return fromEnv;
  }
  const folder = path.dirname(execPath);
  const candidates = [
    path.join(folder, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(folder, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(
      "Could not find npm. Run this through `npm run`, which tells it where npm is.",
    );
  }
  return found;
}

/**
 * The environment without the `npm_*` variables that `npm run` sets. A
 * child npm reads them as its configuration, so one that inherits the
 * repository's `npm_config_local_prefix` would work on the repository, not
 * on the folder it is run in.
 *
 * @param {NodeJS.ProcessEnv} [env] The environment to filter.
 * @returns {NodeJS.ProcessEnv}
 */
export function withoutNpmVariables(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) => !name.toLowerCase().startsWith("npm_"),
    ),
  );
}

/**
 * Runs npm with an argument array and no shell, so it behaves the same on
 * every system, and with none of the `npm run` variables.
 *
 * @param {string[]} args The npm arguments.
 * @param {import("node:child_process").SpawnSyncOptions} options Spawn options.
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
export function runNpm(args, options = {}) {
  return spawnSync(process.execPath, [npmCliPath(), ...args], {
    encoding: "utf8",
    env: withoutNpmVariables(),
    ...options,
  });
}
