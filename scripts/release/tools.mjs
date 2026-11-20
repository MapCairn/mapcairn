// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { runNpm } from "./npm.mjs";

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
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
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
 * Runs `npm` in a folder, through `runNpm`, which needs no shell and drops the
 * `npm_*` variables of a parent `npm run`.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function npm(args, cwd) {
  const result = runNpm(args, { cwd, maxBuffer: LARGE_OUTPUT });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
