// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Saves a GitHub issue's body to a file exactly as GitHub holds it, so an agent
 * edits the file in place and never retypes the body. The same on every
 * system: it avoids a shell `>`, which writes UTF-16 in Windows PowerShell 5.1
 * and can change line ends.
 *
 *   node scripts/agents/issue-body.mjs <issue number> <file> [--repo owner/name] [--force]
 *
 * Save the file outside the repository, in the tool's scratch or temporary
 * folder, so the body is never committed. An existing file is not overwritten
 * unless `--force` is given. Then edit the file and save it with
 * `gh issue edit <n> --body-file <file>`.
 *
 * Exit 0 on success, 1 when gh or the write fails, 2 for bad arguments.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { isEntryPoint } from "../entryPoint.mjs";

const DEFAULT_REPO = "MapCairn/mapcairn";
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const USAGE =
  "usage: node scripts/agents/issue-body.mjs <issue number> <file> [--repo owner/name] [--force]";

/**
 * The issue number, file, repository and force flag from the command line, or
 * undefined when they are missing, malformed or followed by anything else.
 *
 * @param {string[]} args
 * @returns {{ number: string, file: string, repo: string, force: boolean } | undefined}
 */
export function parseArguments(args) {
  const [number, file, ...options] = args;
  if (number === undefined || !/^\d+$/.test(number) || file === undefined) {
    return undefined;
  }
  const request = { number, file, repo: DEFAULT_REPO, force: false };
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--force") {
      request.force = true;
    } else if (
      options[index] === "--repo" &&
      options[index + 1] !== undefined &&
      !options[index + 1].startsWith("--")
    ) {
      index += 1;
      request.repo = options[index];
    } else {
      return undefined;
    }
  }
  return request;
}

/** Runs gh and returns its standard output, or throws with its error text. */
function gh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
  });
  if (result.status !== 0) {
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || "gh did not run"),
    );
  }
  return result.stdout;
}

/**
 * Writes the issue's body to the file as UTF-8, unchanged. Throws when the file
 * exists and `force` is not set.
 *
 * @param {{ number: string, file: string, repo: string, force: boolean }} request
 * @param {(args: string[]) => string} [run] Runs gh; replaced in tests.
 */
export function saveIssueBody({ number, file, repo, force }, run = gh) {
  const { body } = JSON.parse(
    run(["issue", "view", number, "--repo", repo, "--json", "body"]),
  );
  if (typeof body !== "string") {
    throw new Error(`issue ${number} has no body`);
  }
  try {
    writeFileSync(file, body, { encoding: "utf8", flag: force ? "w" : "wx" });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(`${file} already exists; pass --force to overwrite it`);
    }
    throw error;
  }
}

/**
 * Runs the command and returns the exit code.
 *
 * @param {string[]} args The command-line arguments.
 * @param {(args: string[]) => string} [run] Runs gh; replaced in tests.
 * @param {(line: string) => void} [report] Prints an error line.
 * @returns {number}
 */
export function main(args, run = gh, report = console.error) {
  const request = parseArguments(args);
  if (request === undefined) {
    report(USAGE);
    return 2;
  }
  try {
    saveIssueBody(request, run);
    return 0;
  } catch (error) {
    report(`issue-body: ${error.message}`);
    return 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
