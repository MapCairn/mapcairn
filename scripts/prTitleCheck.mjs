// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Fails when a pull request title is not a Conventional Commit
 * (`<type>[optional scope][!]: <description>`). Pull requests are squash-merged
 * with the title as the commit subject, and the release scripts read that
 * subject, so a title that does not parse is a change the release plan cannot
 * see.
 *
 *   PR_TITLE='fix(core): handle bounds' node scripts/prTitleCheck.mjs
 *
 * The title reaches the script through the environment, never through shell
 * text. Exit codes: 0 valid, 1 invalid, 2 no title was given (never a pass).
 */
import { isEntryPoint } from "./entryPoint.mjs";
import { parseCommit } from "./release/versionRules.mjs";

/** The types the project uses, the standard Conventional Commit set. */
export const COMMIT_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

const INVALID =
  "The pull request title must be a Conventional Commit: <type>[optional scope][!]: <description>, with a type from " +
  `${COMMIT_TYPES.join(", ")}. Example: fix(map): keep the credits button visible`;

/**
 * Reads the title with the rule the release scripts use for a commit subject.
 *
 * @param {string} title
 * @returns {string | null} Null when the title is valid, otherwise what is wrong.
 */
export function titleProblem(title) {
  const { type } = parseCommit(title.trim(), "");
  return type !== null && COMMIT_TYPES.includes(type) ? null : INVALID;
}

/**
 * @param {Record<string, string | undefined>} env Holds `PR_TITLE`.
 * @param {(line: string) => void} error Where a problem is reported.
 * @returns {number} 0 valid, 1 invalid, 2 no title given.
 */
export function runCli(env, error) {
  const title = env.PR_TITLE;
  if (title === undefined) {
    error("PR_TITLE is not set, so the title could not be checked.");
    return 2;
  }
  const problem = titleProblem(title);
  if (problem !== null) {
    error(problem);
    return 1;
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  process.exit(runCli(process.env, console.error));
}
