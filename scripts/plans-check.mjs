// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Warns about a plan in `docs/plans/` whose tracking issue is closed. The pull
 * request that finishes a plan's last step deletes the plan (or folds what still
 * governs the code into the guides), so a closed plan is one that was missed.
 *
 *   node scripts/plans-check.mjs
 *
 * It only ever warns (exit code 0). Issue states come from the same single
 * `gh` read as the roadmap check; when `gh` is missing, not signed in, offline
 * or rate limited, the script says so and checks nothing.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { isEntryPoint } from "./entryPoint.mjs";
import { readIssueStates } from "./roadmap-check.mjs";

const PLANS_URL = new URL("../docs/plans/", import.meta.url);
const GH_TIMEOUT_MS = 30_000;
/** A plan file: a number, a short name and `.md`. The folder's `README.md` is not one. */
const PLAN_FILE = /^\d{4}-.+\.md$/;
/** The status line: `Status: in progress.` or `Status: done: both slices merged.` */
const STATUS_LINE = /^Status: (.+)$/m;
/** The tracking issue a plan names, as `#316` or `[#49](...)`, on its status line. */
const TRACKING_ISSUE = /Tracking issue: \[?#(\d+)/;

/**
 * @param {{ file: string, text: string }[]} plans Each plan's file name and text.
 * @param {Map<number, string>} states Upper-case issue state by number. A number not in the map is unknown and is skipped.
 * @returns {string[]} One warning for each plan whose tracking issue is closed.
 */
export function checkPlans(plans, states) {
  const warnings = [];
  for (const { file, text } of plans) {
    const status = STATUS_LINE.exec(text)?.[1];
    const issue = TRACKING_ISSUE.exec(status ?? "")?.[1];
    if (status === undefined || issue === undefined) {
      continue;
    }
    if (states.get(Number(issue)) === "CLOSED") {
      warnings.push(
        `warning: docs/plans/${file}: tracking issue #${issue} is closed; delete the plan, its README entry and its references, or fold what still governs the code into the guides`,
      );
    }
  }
  return warnings;
}

/**
 * Checks the plans and prints the result.
 *
 * @param {object} input
 * @param {{ file: string, text: string }[]} input.plans Each plan's file name and text.
 * @param {Map<number, string> | null} input.states The issue states, or null when they could not be read.
 * @param {(line: string) => void} input.log Receives the notices and the warnings.
 * @returns {number} The exit code, always 0: this check only warns.
 */
export function runPlansCheck({ plans, states, log }) {
  if (states === null) {
    log(
      "plans check: issue states were not checked (gh is missing, not signed in, offline or rate limited)",
    );
    return 0;
  }
  for (const warning of checkPlans(plans, states)) {
    log(`plans check: ${warning}`);
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  const runGh = (args) =>
    spawnSync("gh", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: GH_TIMEOUT_MS,
    });
  const plans = readdirSync(PLANS_URL)
    .filter((file) => PLAN_FILE.test(file))
    .map((file) => ({
      file,
      text: readFileSync(new URL(file, PLANS_URL), "utf8"),
    }));
  process.exit(
    runPlansCheck({
      plans,
      states: readIssueStates(runGh),
      log: console.log,
    }),
  );
}
