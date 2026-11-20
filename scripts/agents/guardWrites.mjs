// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * A Claude Code `PreToolUse` hook that keeps the read-only review agents from
 * writing to the repository or changing shared state.
 *
 *   node scripts/agents/guardWrites.mjs        (reads the hook input on stdin)
 *
 * `.claude/settings.json` runs it before every Edit, Write, MultiEdit,
 * NotebookEdit and Bash call. The hook input names the calling subagent in
 * `agent_type` (Claude Code adds it only inside a subagent, or in a session
 * started with `--agent`), so the guard acts on the agents in
 * `READ_ONLY_AGENTS` and lets everyone else through: the main session and the
 * `implementer` are never blocked. A blocked call exits with code 2 and the
 * reason on standard error, which Claude Code shows to the agent.
 *
 * A reviewer may write a file only inside a worktree under
 * `.claude/worktrees/<name>/` of the project: the detached worktree it makes
 * for its own experiments. `guardPaths.mjs` reads paths in the forms of macOS,
 * Linux and Windows (backslashes, drive letters, Git Bash `/c/` paths, `\\?\`
 * prefixes, `.` and `..`, case-insensitive file systems, symbolic links), and
 * `guardCommands.mjs` holds the rules for shell commands.
 *
 * It is a best-effort check of text, not a sandbox. It reads what a shell
 * command says (quotes, `&&`, `;`, `|`, command substitution, backticks, `sh -c`, `env` and
 * `timeout` wrappers, redirections), not what a program does. It cannot see
 * what an interpreter writes (`node -e`, `python -c`, a script), a command
 * assembled in a variable, or a path that a glob or `$VAR` expands; it blocks a
 * path that holds one rather than guess. Tools other than Claude Code do not
 * run it. A fault in the guard never blocks the main session or another
 * agent: input it cannot read exits 0 with a warning, and only a failure while
 * deciding on a reviewer's own call blocks it. If the script is missing or
 * times out, Claude Code reports a hook error and lets the call go ahead,
 * which the script cannot change. See "Keeping reviewers read-only" in
 * `docs/guides/working-with-agents.md`.
 */
import { isEntryPoint } from "../entryPoint.mjs";
import { checkCommand } from "./guardCommands.mjs";
import {
  isInside,
  projectOf,
  realpathOfExisting,
  resolvePath,
  show,
  ZONE,
} from "./guardPaths.mjs";

/**
 * The agents the guard applies to: the reviewers, which are read-only except
 * that `test-reviewer` edits code inside a scratch worktree of its own. The
 * names are the `name` of each file in `.claude/agents`.
 */
export const READ_ONLY_AGENTS = [
  "architecture-reviewer",
  "fresh-eyes-reviewer",
  "lean-reviewer",
  "security-reviewer",
  "test-reviewer",
  "ux-reviewer",
];

/** The tools that name the file they write, and the input field that holds it. */
const FILE_TOOLS = new Map([
  ["Edit", "file_path"],
  ["Write", "file_path"],
  ["MultiEdit", "file_path"],
  ["NotebookEdit", "notebook_path"],
]);

/** What a reviewer is told to do when it is blocked. */
const INSTEAD =
  "Report the change you wanted in your findings instead of making it; the caller decides, and do not reword the call.";

/**
 * @typedef {{ allow: true } | { allow: false, reason: string }} Decision
 */

/**
 * The refusal, with the agent's name and why.
 *
 * @param {string} agent
 * @param {string} what
 * @returns {Decision}
 */
function refuse(agent, what) {
  return {
    allow: false,
    reason: `${agent} is a read-only reviewer: ${what}. It may write only inside a worktree it made under .claude/worktrees/<name>/. ${INSTEAD}`,
  };
}

/**
 * @returns {import("./guardPaths.mjs").Platform}
 */
function thisPlatform() {
  return process.platform === "win32" || process.platform === "darwin"
    ? process.platform
    : "linux";
}

/**
 * Decides on a write by a file tool.
 *
 * @param {string} agent
 * @param {unknown} raw The path the tool was given.
 * @param {string} cwd
 * @param {import("./guardPaths.mjs").Context} context
 * @returns {Decision}
 */
function decideFile(agent, raw, cwd, context) {
  const place = resolvePath(raw, cwd, context.platform);
  if (isInside(place, context, 2)) {
    return { allow: true };
  }
  const shown = typeof raw === "string" && raw !== "" ? raw : "a missing path";
  return refuse(agent, `writing ${shown} is outside .claude/worktrees/<name>/`);
}

/**
 * Decides on a Bash command.
 *
 * @param {string} agent
 * @param {unknown} command
 * @param {string} cwd
 * @param {import("./guardPaths.mjs").Context} context
 * @returns {Decision}
 */
function decideCommand(agent, command, cwd, context) {
  const here = resolvePath(cwd, null, context.platform);
  const walk = { cwd: here === undefined ? null : show(here), context };
  const reason = checkCommand(typeof command === "string" ? command : "", walk);
  return reason === undefined ? { allow: true } : refuse(agent, reason);
}

/**
 * Decides whether a tool call may go ahead.
 *
 * @param {Record<string, any>} input The hook input Claude Code sends.
 * @param {object} [options]
 * @param {string} [options.projectDir] The project folder (`CLAUDE_PROJECT_DIR`).
 * @param {import("./guardPaths.mjs").Platform} [options.platform] Defaults to this system.
 * @param {(p: string) => string} [options.realpath] Follows symbolic links.
 * @returns {Decision}
 */
export function decide(input, options = {}) {
  const agent = input.agent_type;
  if (typeof agent !== "string" || !READ_ONLY_AGENTS.includes(agent)) {
    return { allow: true };
  }
  const tool = String(input.tool_name);
  const field = FILE_TOOLS.get(tool);
  if (field === undefined && tool !== "Bash") {
    return { allow: true };
  }
  const platform = options.platform ?? thisPlatform();
  const cwd = typeof input.cwd === "string" ? input.cwd : "";
  const project = projectOf(options.projectDir, cwd, platform);
  if (project === undefined) {
    return refuse(
      agent,
      "the project folder could not be found, so no path can be checked",
    );
  }
  const context = {
    platform,
    realpath: options.realpath ?? realpathOfExisting,
    zone: { root: project.root, segments: [...project.segments, ...ZONE] },
  };
  const toolInput = input.tool_input ?? {};
  return field === undefined
    ? decideCommand(agent, toolInput.command, cwd, context)
    : decideFile(agent, toolInput[field], cwd, context);
}

/**
 * Whether the hook input is a call by one of the guarded agents.
 *
 * @param {unknown} input
 * @returns {input is Record<string, any>}
 */
function isReviewerCall(input) {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (/** @type {any} */ (input).agent_type) === "string" &&
    READ_ONLY_AGENTS.includes(/** @type {any} */ (input).agent_type)
  );
}

/**
 * Runs the hook on its input text and says how Claude Code should be told.
 *
 * Only a call by a guarded agent can be blocked (exit code 2). Input that
 * cannot be read, or that names no guarded agent, is let through with a
 * warning, so a fault in the guard never stops the main session or the
 * `implementer`. A fault while deciding on a guarded agent's call blocks it,
 * because that is the caller the guard exists for.
 *
 * @param {string} raw The text on standard input.
 * @param {{ CLAUDE_PROJECT_DIR?: string }} [env]
 * @param {{ platform?: import("./guardPaths.mjs").Platform, realpath?: (p: string) => string }} [options]
 * @returns {{ code: 0 | 2, message?: string }}
 */
export function runHook(raw, env = {}, options = {}) {
  /** @type {unknown} */
  let input;
  try {
    input = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return {
      code: 0,
      message:
        "guardWrites could not read the hook input, so it did not check this call.",
    };
  }
  if (!isReviewerCall(input)) {
    return { code: 0 };
  }
  try {
    const decision = decide(input, {
      projectDir: env.CLAUDE_PROJECT_DIR,
      ...options,
    });
    return decision.allow ? { code: 0 } : { code: 2, message: decision.reason };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return {
      code: 2,
      message: `guardWrites could not decide on this call by ${input.agent_type} (${why}), so it blocked the call. ${INSTEAD}`,
    };
  }
}

/**
 * Reads the hook input from standard input.
 *
 * @returns {Promise<string>}
 */
async function readInput() {
  const chunks = [];
  try {
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
  } catch {
    return "";
  }
  return Buffer.concat(chunks).toString("utf8");
}

if (isEntryPoint(import.meta.url)) {
  const { code, message } = runHook(await readInput(), process.env);
  if (message !== undefined) {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = code;
}
