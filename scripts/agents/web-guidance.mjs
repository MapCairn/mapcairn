// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Runs the guides of the pinned `modern-web-guidance` dev dependency the same
 * way on macOS, Linux and Windows, for the `web-platform-guidance` skill.
 *
 *   node scripts/agents/web-guidance.mjs search "<query>"
 *   node scripts/agents/web-guidance.mjs retrieve "<id>[,<id>...]"
 *   node scripts/agents/web-guidance.mjs list
 *
 * The package's own command line sends anonymous usage events to its
 * publisher, including the search text and the guide ids, unless
 * `DISABLE_TELEMETRY` is set. This wrapper always sets it, so a search from
 * this repository sends nothing. It runs the installed copy directly, so it
 * needs no network and never fetches a newer release, and it refuses the
 * commands that install files into a user's own folders or change its settings.
 *
 * Exit 2 for a command that is not allowed; otherwise the exit code of the
 * packaged command line.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The read-only commands of the packaged command line. */
const ALLOWED_COMMANDS = ["search", "list", "retrieve"];
const REFUSED_EXIT_CODE = 2;
const PACKAGE = "modern-web-guidance";

/**
 * Whether the packaged command line may run this command.
 *
 * @param {string | undefined} command
 * @returns {boolean}
 */
export function isAllowedCommand(command) {
  return command !== undefined && ALLOWED_COMMANDS.includes(command);
}

/**
 * The environment for the packaged command line: the given one with usage
 * reporting switched off. The input is not changed.
 *
 * @param {Record<string, string | undefined>} environment
 * @returns {Record<string, string | undefined>}
 */
export function childEnvironment(environment) {
  return { ...environment, DISABLE_TELEMETRY: "1" };
}

/** The path of the packaged command line inside the installed dependency. */
function binaryPath() {
  const load = createRequire(import.meta.url);
  const manifest = load.resolve(`${PACKAGE}/package.json`);
  const { bin } = load(manifest);
  return path.resolve(path.dirname(manifest), bin[PACKAGE]);
}

/** Runs the command in the arguments and sets the exit code. */
function main() {
  const args = process.argv.slice(2);
  if (!isAllowedCommand(args[0])) {
    console.error(
      `usage: node scripts/agents/web-guidance.mjs <${ALLOWED_COMMANDS.join("|")}> [arguments]`,
    );
    process.exitCode = REFUSED_EXIT_CODE;
    return;
  }
  const result = spawnSync(process.execPath, [binaryPath(), ...args], {
    stdio: "inherit",
    env: childEnvironment(process.env),
  });
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
