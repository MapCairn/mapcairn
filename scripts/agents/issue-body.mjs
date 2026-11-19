// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Saves a GitHub issue's body to a file exactly as GitHub holds it, so an agent
 * edits the file in place and never retypes the body. The same on every
 * system: it avoids a shell `>`, which writes UTF-16 in Windows PowerShell 5.1
 * and can change line ends.
 *
 *   node scripts/agents/issue-body.mjs <issue number> <file> [--repo owner/name]
 *
 * Then edit the file and save it with `gh issue edit <n> --body-file <file>`.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO = "MapCairn/mapcairn";
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

/**
 * The issue number, file and repository from the command line, or undefined
 * when they are missing or malformed.
 *
 * @param {string[]} args
 * @returns {{ number: string, file: string, repo: string } | undefined}
 */
export function parseArguments(args) {
  const [number, file, option, repo] = args;
  if (number === undefined || !/^\d+$/.test(number) || file === undefined) {
    return undefined;
  }
  if (option === undefined) {
    return { number, file, repo: DEFAULT_REPO };
  }
  return option === "--repo" && repo !== undefined
    ? { number, file, repo }
    : undefined;
}

/** Runs gh and returns its standard output, or throws with its error text. */
function gh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "gh did not run");
  }
  return result.stdout;
}

/**
 * Writes the issue's body to the file as UTF-8, unchanged.
 *
 * @param {{ number: string, file: string, repo: string }} request
 * @param {(args: string[]) => string} [run] Runs gh; replaced in tests.
 */
export function saveIssueBody({ number, file, repo }, run = gh) {
  const { body } = JSON.parse(
    run(["issue", "view", number, "--repo", repo, "--json", "body"]),
  );
  if (typeof body !== "string") {
    throw new Error(`issue ${number} has no body`);
  }
  writeFileSync(file, body, "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const request = parseArguments(process.argv.slice(2));
  if (request === undefined) {
    console.error(
      "usage: node scripts/agents/issue-body.mjs <issue number> <file> [--repo owner/name]",
    );
    process.exit(2);
  }
  try {
    saveIssueBody(request);
  } catch (error) {
    console.error(`issue-body: ${error.message}`);
    process.exit(1);
  }
}
