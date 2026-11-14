// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Checks that the ranked list in `ROADMAP.md` ("Priorities", Now, Next and
 * Later) is still well formed and still names real issues.
 *
 *   node scripts/roadmap-check.mjs
 *
 * Errors (exit code 1): a listed issue that does not exist, an issue listed
 * more than once, more than five numbered items under "Now", or a missing
 * section. A listed issue that is closed is only a warning, so an issue closing
 * never fails an unrelated pull request.
 *
 * Issue states come from one read, `gh issue list`. When `gh` is missing, not
 * signed in, offline or rate limited, the script says so and still runs the
 * checks that need no network. It never writes, and the check is not required
 * for merge.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = "MapCairn/mapcairn";
const MAX_NOW_ITEMS = 5;
const ISSUE_LIMIT = 1000;
const GH_TIMEOUT_MS = 30_000;
const ROADMAP_PATH = new URL("../ROADMAP.md", import.meta.url);
const SECTIONS = ["Now", "Next", "Later"];
/** An issue reference, but not part of a longer word, a path, an HTML entity such as `&#39;` or a longer number. */
const ISSUE_REFERENCE = /(?<![\w/&])#(\d+)(?!\d)/g;
/** A Markdown code span: a run of backticks, text without that run's closing backtick, and the same run. */
const CODE_SPAN = /(`+)[^`]*?\1/g;
const NUMBERED_ITEM = /^\d+\.\s/;

/**
 * The lines from a heading to the next heading of the same or a higher level.
 *
 * @param {string[]} lines
 * @param {string} heading The full heading line, such as `## Priorities`.
 * @returns {string[] | null} The lines after the heading, or null when it is missing.
 */
function sectionLines(lines, heading) {
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) {
    return null;
  }
  const level = heading.indexOf(" ");
  const sameOrHigher = new RegExp(`^#{1,${level}} `);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => sameOrHigher.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Every issue number in the text, in order, with repeats. A number inside a
 * code span is an example, not a reference.
 *
 * @param {string} text
 * @returns {number[]}
 */
function issueNumbers(text) {
  return Array.from(
    text.replace(CODE_SPAN, "").matchAll(ISSUE_REFERENCE),
    (match) => Number(match[1]),
  );
}

/**
 * @param {number[]} numbers
 * @returns {string[]} One message for each number that appears more than once.
 */
function repeatedProblems(numbers) {
  const counts = new Map();
  for (const number of numbers) {
    counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([number]) => `#${number} is listed more than once`);
}

/**
 * Checks the Priorities section of the roadmap.
 *
 * @param {string} markdown The text of `ROADMAP.md`.
 * @param {Map<number, string> | null} states Upper-case issue state by number, or null when the states were not read (the checks that need them are skipped). A number above the highest one in the map is unknown, not missing: the list may have been cut at the `gh` limit, or the issue may be newer than the list.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkRoadmap(markdown, states) {
  const lines = markdown.split(/\r?\n/);
  const priorities = sectionLines(lines, "## Priorities");
  if (priorities === null) {
    return {
      errors: ['the "## Priorities" section is missing'],
      warnings: [],
    };
  }
  const errors = [];
  const sections = new Map();
  for (const name of SECTIONS) {
    const section = sectionLines(priorities, `### ${name}`);
    if (section === null) {
      errors.push(`the "### ${name}" section is missing`);
    } else {
      sections.set(name, section);
    }
  }
  const numbers = issueNumbers([...sections.values()].flat().join("\n"));
  errors.push(...repeatedProblems(numbers));
  const nowItems = (sections.get("Now") ?? []).filter((line) =>
    NUMBERED_ITEM.test(line),
  ).length;
  if (nowItems > MAX_NOW_ITEMS) {
    errors.push(
      `Now has ${nowItems} items, at most ${MAX_NOW_ITEMS} are allowed`,
    );
  }
  const warnings = [];
  if (states !== null) {
    const highest = Math.max(...states.keys());
    for (const number of new Set(numbers)) {
      const state = states.get(number);
      if (state === undefined) {
        if (number < highest) {
          errors.push(`#${number} does not exist`);
        }
      } else if (state === "CLOSED") {
        warnings.push(`warning: #${number} is closed, move or remove it`);
      }
    }
  }
  return { errors, warnings };
}

/**
 * Reads the output of `gh issue list --json number,state`.
 *
 * @param {string} json
 * @returns {Map<number, string> | null} Upper-case state by issue number, or null when the output is not a list of issues (an error message, a rate-limit reply or an empty list is an unusable answer, and must never read as "no such issue").
 */
export function parseIssueStates(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (issue) =>
        Number.isInteger(issue?.number) && typeof issue?.state === "string",
    );
  return valid
    ? new Map(parsed.map((issue) => [issue.number, issue.state.toUpperCase()]))
    : null;
}

/**
 * Reads every issue of the project with one `gh` call.
 *
 * @param {(args: string[]) => { status: number | null, stdout: string }} runGh Runs `gh` with the arguments; a status other than 0 (or null, when `gh` is missing) means the call failed.
 * @returns {Map<number, string> | null} The issue states, or null when `gh` failed or its answer was unusable.
 */
export function readIssueStates(runGh) {
  const result = runGh([
    "issue",
    "list",
    "--repo",
    REPO,
    "--state",
    "all",
    "--limit",
    String(ISSUE_LIMIT),
    "--json",
    "number,state",
  ]);
  return result.status === 0 ? parseIssueStates(result.stdout) : null;
}

/**
 * Checks the roadmap and prints the result.
 *
 * @param {object} input
 * @param {string} input.roadmapText The text of `ROADMAP.md`.
 * @param {Map<number, string> | null} input.states The issue states, or null when they could not be read.
 * @param {(line: string) => void} input.log Receives the notice and the warnings.
 * @param {(line: string) => void} input.error Receives the errors.
 * @returns {number} The exit code: 1 when there is an error, otherwise 0.
 */
export function runRoadmapCheck({ roadmapText, states, log, error }) {
  if (states === null) {
    log(
      "roadmap check: issue states were not checked (gh is missing, not signed in, offline or rate limited); the list itself was checked",
    );
  }
  const result = checkRoadmap(roadmapText, states);
  for (const warning of result.warnings) {
    log(`roadmap check: ${warning}`);
  }
  for (const problem of result.errors) {
    error(`roadmap check: ${problem}`);
  }
  return result.errors.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const states = readIssueStates((args) =>
    spawnSync("gh", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: GH_TIMEOUT_MS,
    }),
  );
  process.exit(
    runRoadmapCheck({
      roadmapText: readFileSync(ROADMAP_PATH, "utf8"),
      states,
      log: console.log,
      error: console.error,
    }),
  );
}
