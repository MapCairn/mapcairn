// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Checks that the ranked list in `ROADMAP.md` ("Priorities", Now, Next and
 * Later) is still well formed and still names real milestones. Each item is
 * one GitHub milestone, linked as `.../milestone/<number>`, and may link the
 * tracker or plan issue that defines it.
 *
 *   node scripts/roadmap-check.mjs
 *
 * Errors (exit code 1): a linked milestone or issue that does not exist, one
 * listed more than once, more than three items under "Now" or more than six
 * under "Next" (a numbered item or a `-` bullet), an item that does not link
 * exactly one milestone, or a missing section. Later has no cap. A linked
 * milestone or issue that is closed is only a warning, so one closing never
 * fails an unrelated pull request.
 *
 * Issue states come from one read, `gh issue list`, and milestones from one
 * more, `gh api` on the milestones of the project. When `gh` is missing, not
 * signed in, offline or rate limited, the script says so and still runs the
 * checks that need no network. It never writes, and the check is not required
 * for merge.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isEntryPoint } from "./entryPoint.mjs";

const REPO = "MapCairn/mapcairn";
const MAX_ITEMS = new Map([
  ["Now", 3],
  ["Next", 6],
]);
const ISSUE_LIMIT = 1000;
const MILESTONE_PAGE_SIZE = 100;
const GH_TIMEOUT_MS = 30_000;
const ROADMAP_PATH = new URL("../ROADMAP.md", import.meta.url);
const SECTIONS = ["Now", "Next", "Later"];
/** An issue reference, but not part of a longer word, a path, an HTML entity such as `&#39;` or a longer number. */
const ISSUE_REFERENCE = /(?<![\w/&])#(\d+)(?!\d)/g;
/** A Markdown code span: a run of backticks, text without that run's closing backtick, and the same run. */
const CODE_SPAN = /(`+)[^`]*?\1/g;
/** A link to a GitHub milestone of the project, by number. */
const MILESTONE_REFERENCE = /\/milestone\/(\d+)(?!\d)/g;
/** The start of a list item: a number or a `-` bullet, optionally indented. */
const ITEM_START = /^\s*(?:\d+\.|-)\s/;

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
 * Every milestone number linked in the text, in order, with repeats.
 *
 * @param {string} text
 * @returns {number[]}
 */
function milestoneNumbers(text) {
  return Array.from(text.matchAll(MILESTONE_REFERENCE), (match) =>
    Number(match[1]),
  );
}

/**
 * @param {number[]} numbers
 * @param {string} label What a number names, such as `#` or `milestone `.
 * @returns {string[]} One message for each number that appears more than once.
 */
function repeatedProblems(numbers, label) {
  const counts = new Map();
  for (const number of numbers) {
    counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([number]) => `${label}${number} is listed more than once`);
}

/**
 * Checks the Priorities section of the roadmap.
 *
 * @param {string} markdown The text of `ROADMAP.md`.
 * @param {Map<number, string> | null} states Upper-case issue state by number, or null when the states were not read (the checks that need them are skipped). A number above the highest one in the map is unknown, not missing: the list may have been cut at the `gh` limit, or the issue may be newer than the list.
 * @param {Map<number, string> | null} [milestones] Upper-case milestone state by number, or null when the milestones were not read (the existence check is skipped). The list is complete, so a number missing from it does not exist.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkRoadmap(markdown, states, milestones = null) {
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
  const listText = [...sections.values()].flat().join("\n");
  const numbers = issueNumbers(listText);
  const milestoneList = milestoneNumbers(listText);
  errors.push(
    ...repeatedProblems(milestoneList, "milestone "),
    ...repeatedProblems(numbers, "#"),
  );
  errors.push(...itemProblems(sections));
  const milestoneResult = milestoneProblems(milestoneList, milestones);
  const issueResult = issueProblems(numbers, states);
  return {
    errors: [...errors, ...milestoneResult.errors, ...issueResult.errors],
    warnings: [...milestoneResult.warnings, ...issueResult.warnings],
  };
}

/** An item as `ROADMAP.md` writes it: `**Track, [Title](milestone link) (trackers).** Text`. */
const ITEM_SHAPE = /^\s*(?:\d+\.|-)\s+\*\*([\s\S]*?)\.\*\*\s*([\s\S]*)$/;
/** The link to a milestone: its text, its address and its number. */
const MILESTONE_LINK = /\[([^\]]+)\]\(([^)\s]*\/milestone\/(\d+))\)/;
/** The line that dates the last review of the file. */
const LAST_REVIEWED = /^_Last reviewed: (\d{4}-\d{2}-\d{2})\b/m;

/**
 * One ranked milestone of the roadmap.
 *
 * @typedef {object} RoadmapItem
 * @property {string} track `SDK` or `Site`, or an empty string when the item names none.
 * @property {string} title The milestone's title.
 * @property {number} milestone The milestone's number.
 * @property {string} milestoneUrl The milestone's address as the item links it.
 * @property {number[]} trackers The issue numbers the item names, in order.
 * @property {string} text What the milestone is for, on one line.
 */

/**
 * Reads the ranked list of the roadmap for a page or a report to show. It
 * reads the lists with the parts `checkRoadmap` uses, and throws on what that
 * check would fail on without the network: a missing section, a repeated or
 * missing milestone link or a list over its cap.
 *
 * @param {string} markdown The text of `ROADMAP.md`.
 * @returns {{ lanes: { name: string, items: RoadmapItem[] }[], reviewed: string | null }} The lanes in order, and the date of the last review as `YYYY-MM-DD`, or null.
 */
export function parseRoadmap(markdown) {
  const { errors } = checkRoadmap(markdown, null, null);
  if (errors.length > 0) {
    throw new Error(`ROADMAP.md is not well formed: ${errors.join("; ")}`);
  }
  const priorities = sectionLines(markdown.split(/\r?\n/), "## Priorities");
  const lanes = SECTIONS.map((name) => ({
    name,
    items: itemsOf(sectionLines(priorities ?? [], `### ${name}`) ?? []).map(
      readItem,
    ),
  }));
  return { lanes, reviewed: LAST_REVIEWED.exec(markdown)?.[1] ?? null };
}

/**
 * @param {string} item One list item, its lines joined by newlines.
 * @returns {RoadmapItem}
 */
function readItem(item) {
  const shape = ITEM_SHAPE.exec(item);
  const heading = shape?.[1] ?? item;
  const link = MILESTONE_LINK.exec(item);
  const comma = heading.indexOf(", ");
  return {
    track: shape && comma > 0 ? heading.slice(0, comma) : "",
    title: link?.[1] ?? "",
    milestone: Number(link?.[3]),
    milestoneUrl: link?.[2] ?? "",
    trackers: issueNumbers(heading),
    text: (shape?.[2] ?? "").replace(/\s*\n\s*/g, " ").trim(),
  };
}

/**
 * The list items of a section, each as its lines joined, so an item that wraps
 * onto the next line is read as one.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
function itemsOf(lines) {
  const items = [];
  for (const line of lines) {
    if (ITEM_START.test(line)) {
      items.push(line);
    } else if (items.length > 0 && line.trim() !== "") {
      items[items.length - 1] += `\n${line}`;
    }
  }
  return items;
}

/**
 * @param {Map<string, string[]>} sections The lines of each list by name.
 * @returns {string[]} One message for each list that has more items than its cap, and for each item that does not link exactly one milestone.
 */
function itemProblems(sections) {
  const problems = [];
  for (const [name, lines] of sections) {
    const items = itemsOf(lines);
    const max = MAX_ITEMS.get(name);
    if (max !== undefined && items.length > max) {
      problems.push(
        `${name} has ${items.length} items, at most ${max} are allowed`,
      );
    }
    items.forEach((item, index) => {
      const links = milestoneNumbers(item).length;
      if (links !== 1) {
        problems.push(
          `${name} item ${index + 1} links ${links} milestones, exactly 1 is required`,
        );
      }
    });
  }
  return problems;
}

/**
 * @param {number[]} numbers The linked milestone numbers.
 * @param {Map<number, string> | null} milestones See `checkRoadmap`.
 * @returns {{ errors: string[], warnings: string[] }}
 */
function milestoneProblems(numbers, milestones) {
  const result = { errors: [], warnings: [] };
  if (milestones === null) {
    return result;
  }
  for (const number of new Set(numbers)) {
    const state = milestones.get(number);
    if (state === undefined) {
      result.errors.push(`milestone ${number} does not exist`);
    } else if (state === "CLOSED") {
      result.warnings.push(`warning: milestone ${number} is closed, remove it`);
    }
  }
  return result;
}

/**
 * @param {number[]} numbers The linked issue numbers.
 * @param {Map<number, string> | null} states See `checkRoadmap`.
 * @returns {{ errors: string[], warnings: string[] }}
 */
function issueProblems(numbers, states) {
  const result = { errors: [], warnings: [] };
  if (states === null) {
    return result;
  }
  const highest = Math.max(...states.keys());
  for (const number of new Set(numbers)) {
    const state = states.get(number);
    if (state === undefined) {
      if (number < highest) {
        result.errors.push(`#${number} does not exist`);
      }
    } else if (state === "CLOSED") {
      result.warnings.push(`warning: #${number} is closed, move or remove it`);
    }
  }
  return result;
}

/**
 * Reads a JSON list of objects with a number and a state.
 *
 * @param {string} json
 * @returns {Map<number, string> | null} Upper-case state by number, or null when the output is not such a list (an error message, a rate-limit reply or an empty list is an unusable answer, and must never read as "no such issue").
 */
function parseStates(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
    parsed = parsed.flat();
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
 * Reads the output of `gh issue list --json number,state`.
 *
 * @param {string} json
 * @returns {Map<number, string> | null} Upper-case state by issue number, or null when the output is unusable.
 */
export function parseIssueStates(json) {
  return parseStates(json);
}

/**
 * Reads the output of `gh api --paginate --slurp` on the milestones of the project: a list of pages, or one list.
 *
 * @param {string} json
 * @returns {Map<number, string> | null} Upper-case state by milestone number, or null when the output is unusable.
 */
export function parseMilestoneStates(json) {
  return parseStates(json);
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
 * Reads every milestone of the project with one `gh` call.
 *
 * @param {(args: string[]) => { status: number | null, stdout: string }} runGh Runs `gh` with the arguments; a status other than 0 (or null, when `gh` is missing) means the call failed.
 * @returns {Map<number, string> | null} The milestone states, or null when `gh` failed or its answer was unusable.
 */
export function readMilestoneStates(runGh) {
  const result = runGh([
    "api",
    "--paginate",
    "--slurp",
    `repos/${REPO}/milestones?state=all&per_page=${MILESTONE_PAGE_SIZE}`,
  ]);
  return result.status === 0 ? parseMilestoneStates(result.stdout) : null;
}

/**
 * Checks the roadmap and prints the result.
 *
 * @param {object} input
 * @param {string} input.roadmapText The text of `ROADMAP.md`.
 * @param {Map<number, string> | null} input.states The issue states, or null when they could not be read.
 * @param {Map<number, string> | null} input.milestones The milestone states, or null when they could not be read.
 * @param {(line: string) => void} input.log Receives the notices and the warnings.
 * @param {(line: string) => void} input.error Receives the errors.
 * @returns {number} The exit code: 1 when there is an error, otherwise 0.
 */
export function runRoadmapCheck({
  roadmapText,
  states,
  milestones,
  log,
  error,
}) {
  if (states === null) {
    log(
      "roadmap check: issue states were not checked (gh is missing, not signed in, offline or rate limited); the list itself was checked",
    );
  }
  if (milestones === null) {
    log(
      "roadmap check: milestones were not checked (gh is missing, not signed in, offline or rate limited); the list itself was checked",
    );
  }
  const result = checkRoadmap(roadmapText, states, milestones);
  for (const warning of result.warnings) {
    log(`roadmap check: ${warning}`);
  }
  for (const problem of result.errors) {
    error(`roadmap check: ${problem}`);
  }
  return result.errors.length > 0 ? 1 : 0;
}

if (isEntryPoint(import.meta.url)) {
  const runGh = (args) =>
    spawnSync("gh", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: GH_TIMEOUT_MS,
    });
  const states = readIssueStates(runGh);
  const milestones = readMilestoneStates(runGh);
  process.exit(
    runRoadmapCheck({
      roadmapText: readFileSync(ROADMAP_PATH, "utf8"),
      states,
      milestones,
      log: console.log,
      error: console.error,
    }),
  );
}
