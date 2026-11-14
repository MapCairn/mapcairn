// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Keeps the other coding tools' skill and agent folders in step with the
 * Claude Code sources. Run through `npm run agents:sync` and
 * `npm run agents:check`.
 *
 *   node scripts/agents/sync.mjs           writes the mirror and generated agents
 *   node scripts/agents/sync.mjs --check   fails when a skill breaks a rule or
 *                                          when a generated file is out of date
 *
 * The project's skills in `.claude/skills` are copied to `.agents/skills` (read
 * by Codex, Antigravity, Qwen Code and others). Skills named in `skills-lock.json` are
 * vendored from elsewhere and are neither checked nor copied. Each
 * agent in `.claude/agents` is written for Antigravity, opencode, Codex, GitHub Copilot and Qwen Code. See `docs/guides/working-with-agents.md`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDrift, plannedFiles, skillProblems, writePlan } from "./plan.mjs";

/** The repository root, taken from this file so the working directory cannot change it. */
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const check = process.argv.includes("--check");

/** Prints the reason and exits 1. */
function fail(message) {
  console.error(`agents: ${message}`);
  process.exit(1);
}

/**
 * The files to produce. Exits 1 when a skill breaks a rule, an agent file or
 * the lock file is invalid, or there is nothing to produce (a repository with
 * no skills would otherwise pass the check and write nothing).
 */
function planOrExit() {
  try {
    const problems = skillProblems(root);
    if (problems.length > 0) {
      fail(`${problems.length} skill problem(s)\n${problems.join("\n")}`);
    }
    const files = plannedFiles(root);
    if (files.size === 0) {
      fail("nothing to generate: no project skills or agents found");
    }
    return files;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

const plan = planOrExit();

if (!check) {
  writePlan(root, plan);
  console.log(`agents: wrote ${plan.size} files`);
} else {
  const { missing, changed, extra } = findDrift(root, plan);
  const stale = [
    ...missing.map((file) => `missing  ${file}`),
    ...changed.map((file) => `changed  ${file}`),
    ...extra.map((file) => `extra    ${file}`),
  ];
  if (stale.length > 0) {
    console.error(
      `agents: ${stale.length} generated file(s) are out of date. Run "npm run agents:sync".\n${stale.join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`agents: ${plan.size} generated files are current`);
}
