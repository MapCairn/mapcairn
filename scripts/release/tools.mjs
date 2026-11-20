// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** The repository the releases belong to. */
export const REPOSITORY = "MapCairn/mapcairn";

const LARGE_OUTPUT = 64 * 1024 * 1024;

/**
 * Runs a program with an argument array and no shell, so nothing in an
 * argument is read as shell syntax and the call works the same on every system.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env] The environment of the program, this process's by default.
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: LARGE_OUTPUT,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Runs `git`.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function git(args, cwd) {
  return run("git", args, cwd);
}

/**
 * How to start npm without a shell. A bare `npm` is a script on Windows and
 * cannot be started that way, so the command is Node running npm's own entry
 * file: the one that started this script (when npm did, not npx), or the one
 * that ships beside Node.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [nodePath]
 * @returns {{ command: string, prefix: string[] }}
 */
export function npmInvocation(env = process.env, nodePath = process.execPath) {
  const started = env.npm_execpath;
  if (
    started !== undefined &&
    path.basename(started) === "npm-cli.js" &&
    existsSync(started)
  ) {
    return { command: nodePath, prefix: [started] };
  }
  const folder = path.dirname(nodePath);
  const bundled = [
    path.join(folder, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(folder, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ].find((candidate) => existsSync(candidate));
  return bundled === undefined
    ? { command: "npm", prefix: [] }
    : { command: nodePath, prefix: [bundled] };
}

/**
 * Settings that a person may have given npm through the environment on
 * purpose, and that stay when the parent npm's own variables are dropped.
 */
const KEPT_NPM_SETTINGS = new Set([
  "npm_config_registry",
  "npm_config_proxy",
  "npm_config_https_proxy",
  "npm_config_noproxy",
  "npm_config_cafile",
  "npm_config_strict_ssl",
  "npm_config_cache",
  "npm_config_userconfig",
  "npm_config_globalconfig",
]);

/**
 * The environment for a nested npm. When this script runs under `npm run`, npm
 * has copied its settings into `npm_config_*` variables, and a nested install
 * that reads them can fail (`allow-scripts` is refused as a project-scoped
 * setting) or look at the wrong project. Dropping them makes the nested npm
 * read the `.npmrc` files again, as it does when started by hand.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function nestedNpmEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        !/^npm_(?:config|package|lifecycle)_|^npm_(?:command|execpath|node_execpath)$/i.test(
          name,
        ) || KEPT_NPM_SETTINGS.has(name.toLowerCase()),
    ),
  );
}

/**
 * Runs `npm` in a folder.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function npm(args, cwd) {
  const { command, prefix } = npmInvocation();
  return run(
    command,
    [...prefix, ...args],
    cwd,
    nestedNpmEnvironment(process.env),
  );
}
