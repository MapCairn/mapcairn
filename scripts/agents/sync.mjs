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
 * `.claude/skills` is copied to `.agents/skills` (read by Codex, Antigravity
 * and others). Each portable agent in `.claude/agents` is written for opencode,
 * Codex and GitHub Copilot. See `docs/guides/working-with-agents.md`.
 */
import { findDrift, plannedFiles, skillProblems, writePlan } from "./plan.mjs";

const root = process.cwd();
const check = process.argv.includes("--check");

const problems = skillProblems(root);
if (problems.length > 0) {
  console.error(
    `agents: ${problems.length} skill problem(s)\n${problems.join("\n")}`,
  );
  process.exit(1);
}

/** The files to produce, or exit 1 with the reason when an agent file is invalid. */
function planOrExit() {
  try {
    return plannedFiles(root);
  } catch (error) {
    console.error(`agents: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
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
