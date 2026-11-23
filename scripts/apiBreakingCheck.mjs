// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Reports a pull request whose API reports (`packages/*\/api`) change in a way
 * that is likely breaking when it is not marked as breaking, as a warning (see
 * `SEVERITY`). Pull requests are squash-merged with the title as the commit
 * subject, and the release plan reads a `!` there, or a `BREAKING CHANGE:`
 * footer in the body, to choose the version and write the notes.
 *
 *   PR_TITLE=... PR_BODY=... PR_AUTHOR=... PR_LABELS=... BASE_REF=main \
 *     node scripts/apiBreakingCheck.mjs
 *
 * It compares the reports at the merge base with the base branch against those at
 * `HEAD`, using the classifier the release plan uses (`apiChanges.mjs`) and the
 * commit reader the release plan uses (`versionRules.mjs`). The text arrives
 * through the environment, so it is data and never part of a shell command.
 */
import { appendFileSync } from "node:fs";
import { isEntryPoint } from "./entryPoint.mjs";
import { skipReason } from "./prBodyCheck.mjs";
import { compareApiReports } from "./release/apiChanges.mjs";
import { tagReports } from "./release/plan.mjs";
import { git } from "./release/tools.mjs";
import { parseCommit } from "./release/versionRules.mjs";

/**
 * Whether a finding fails the pull request (`error`) or only annotates it
 * (`warning`). It is a warning because the classifier is not yet precise: over
 * the history of `packages/*\/api` it called three changes breaking that were
 * not (added message keys, which the public API guide says are not breaking,
 * and a reformatted constructor). Make it `error` when that is fixed.
 */
export const SEVERITY = "warning";

/**
 * The likely-breaking changes between two sets of API reports.
 *
 * @param {import("./release/apiChanges.mjs").ReportSource} before
 * @param {import("./release/apiChanges.mjs").ReportSource} after
 * @returns {ReturnType<typeof compareApiReports>}
 */
export function breakingApiChanges(before, after) {
  return compareApiReports(before, after).filter(
    (change) => change.likelyBreaking,
  );
}

/**
 * Whether the pull request says it is breaking, as the release plan reads a
 * commit: a `!` after the type or scope in the title, or a `BREAKING CHANGE:`
 * footer in the description.
 *
 * @param {string} title
 * @param {string} body
 * @returns {boolean}
 */
export function isMarkedBreaking(title, body) {
  return parseCommit(title.trim(), body).breaking;
}

/**
 * @param {string} title
 * @returns {string} The title with a `!` after its type and scope.
 */
function markedTitle(title) {
  return title.replace(/^([a-z]+(?:\([^)]*\))?):/, "$1!:");
}

/**
 * The lines to show for an unmarked breaking pull request.
 *
 * @param {string} title
 * @param {ReturnType<typeof breakingApiChanges>} changes
 * @returns {string[]}
 */
function findings(title, changes) {
  return [
    `The API reports show a likely breaking change, but the pull request is not marked as breaking. Change the title to \`${markedTitle(title)}\` and end the description with a \`BREAKING CHANGE:\` line that names what was removed or changed.`,
    ...changes.map(
      (change) => `${change.package} (${change.entry}): ${change.detail}`,
    ),
  ];
}

/**
 * Checks a pull request and reports the result.
 *
 * @param {object} input
 * @param {string} input.author The login that opened the pull request.
 * @param {string[]} input.labels The pull request's label names.
 * @param {string} input.title The pull request title.
 * @param {string} input.body The pull request description.
 * @param {import("./release/apiChanges.mjs").ReportSource} input.before The reports at the merge base.
 * @param {import("./release/apiChanges.mjs").ReportSource} input.after The reports in the pull request.
 * @param {(line: string) => void} input.log Receives the annotations.
 * @param {(text: string) => void} input.summarise Receives the job summary text.
 * @param {"error" | "warning"} [input.severity] How a finding is reported; `SEVERITY` by default.
 * @returns {number} 1 when the finding is an error, otherwise 0.
 */
export function runApiBreakingCheck({
  author,
  labels,
  title,
  body,
  before,
  after,
  log,
  summarise,
  severity = SEVERITY,
}) {
  if (skipReason({ author, labels, title }) !== null) {
    return 0;
  }
  if (isMarkedBreaking(title, body)) {
    return 0;
  }
  const changes = breakingApiChanges(before, after);
  if (changes.length === 0) {
    return 0;
  }
  const lines = findings(title, changes);
  for (const line of lines) {
    log(`::${severity} title=Breaking API change::${line}`);
  }
  summarise(
    `### Breaking API change\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`,
  );
  return severity === "error" ? 1 : 0;
}

/**
 * The revision where the pull request left the base branch.
 *
 * @param {string} baseRef The base branch name.
 * @returns {string}
 */
function mergeBase(baseRef) {
  const result = git(["merge-base", `origin/${baseRef}`, "HEAD"], ".");
  if (!result.ok) {
    throw new Error(`No merge base with origin/${baseRef}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

if (isEntryPoint(import.meta.url)) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  process.exit(
    runApiBreakingCheck({
      author: process.env.PR_AUTHOR ?? "",
      labels: (process.env.PR_LABELS ?? "").split(",").filter(Boolean),
      title: process.env.PR_TITLE ?? "",
      body: process.env.PR_BODY ?? "",
      before: tagReports(mergeBase(process.env.BASE_REF ?? "main"), "."),
      after: tagReports("HEAD", "."),
      log: console.log,
      summarise: (text) => {
        if (summaryFile !== undefined) {
          appendFileSync(summaryFile, text);
        }
      },
    }),
  );
}
