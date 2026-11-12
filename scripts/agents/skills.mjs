// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Frontmatter parsing and the rules every skill must meet to work in more than
 * one coding tool. `npm run agents:check` applies them to `.claude/skills`.
 */

/** The longest skill description the tools that set a limit accept. */
export const MAX_DESCRIPTION_LENGTH = 1024;

/** The longest skill name the tools that set a limit accept. */
export const MAX_NAME_LENGTH = 64;

/** A skill name: lowercase words joined by single hyphens. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A single-line `key: value` frontmatter entry. */
const FIELD_LINE = /^([A-Za-z][\w-]*):(?: (.*))?$/;

/** Characters that start a YAML construct, so a plain value cannot begin with them. */
const YAML_INDICATORS = "[]{}&*!|>%@`?:#,";

/**
 * Names that only one coding tool understands. A skill body that uses one is
 * not portable. Kept short and exact so ordinary words, such as a Cloudflare
 * "Workflow", are never flagged.
 */
export const CLAUDE_ONLY_TOOL_NAMES = [
  "mcp__",
  "TodoWrite",
  "AskUserQuestion",
  "ExitPlanMode",
  "NotebookEdit",
  "subagent_type",
  "ultracode",
  "CLAUDE_SKILL_DIR",
  "CLAUDE_PROJECT_DIR",
  "the Agent tool",
  "the Task tool",
  "the Skill tool",
  "the Workflow tool",
];

/**
 * Why strict YAML would reject a plain (unquoted) value, or `undefined` when
 * it would accept it.
 *
 * @param {string} raw
 * @returns {string | undefined}
 */
function plainValueProblem(raw) {
  if (raw.includes(": ") || raw.endsWith(":")) {
    return 'a plain value cannot contain ": " (quote the value)';
  }
  if (raw.includes(" #")) {
    return 'a plain value cannot contain " #" (quote the value)';
  }
  const first = raw.charAt(0);
  if (
    first !== "" &&
    (YAML_INDICATORS.includes(first) || raw.startsWith("- "))
  ) {
    return `a plain value cannot start with ${first} (quote the value)`;
  }
  return undefined;
}

/**
 * Reads one frontmatter value: double-quoted (JSON escapes), single-quoted, or
 * plain. Returns the value and, when strict YAML would reject it, a problem.
 *
 * @param {string} key
 * @param {string} raw
 * @returns {{ value: string, problem?: string }}
 */
function readValue(key, raw) {
  const invalid = (/** @type {string} */ reason) => ({
    value: raw,
    problem: `${key}: ${reason}`,
  });
  if (raw.startsWith('"')) {
    try {
      const value = JSON.parse(raw);
      return typeof value === "string"
        ? { value }
        : invalid("the double-quoted value is not valid");
    } catch {
      return invalid("the double-quoted value is not valid");
    }
  }
  if (raw.startsWith("'")) {
    return raw.length > 1 && raw.endsWith("'")
      ? { value: raw.slice(1, -1).replaceAll("''", "'") }
      : invalid("the single-quoted value is not valid");
  }
  const reason = plainValueProblem(raw);
  return reason === undefined ? { value: raw } : invalid(reason);
}

/**
 * Parses the frontmatter block of a skill or agent file. Only one `key: value`
 * per line is supported, which every tool reads the same way; a value that
 * strict YAML would reject is reported, because Claude Code tolerates it and
 * other tools may skip the file silently.
 *
 * @param {string} text
 * @returns {{ fields: Record<string, string>, body: string, problems: string[] }}
 */
export function parseFrontmatter(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") {
    return {
      fields: {},
      body: text,
      problems: ["the file does not start with a frontmatter block"],
    };
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return {
      fields: {},
      body: text,
      problems: ["the frontmatter block is not closed"],
    };
  }
  /** @type {Record<string, string>} */
  const fields = {};
  const problems = [];
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") {
      continue;
    }
    const match = FIELD_LINE.exec(line);
    if (!match) {
      problems.push(
        `unsupported frontmatter line "${line}": use one "key: value" per line`,
      );
      continue;
    }
    const { value, problem } = readValue(match[1] ?? "", match[2] ?? "");
    fields[match[1] ?? ""] = value;
    if (problem) {
      problems.push(problem);
    }
  }
  return { fields, body: lines.slice(end + 1).join("\n"), problems };
}

/**
 * Checks one skill against the portability rules and returns the problems.
 *
 * @param {string} folder The skill's folder name.
 * @param {string} text The text of its `SKILL.md`.
 * @returns {string[]}
 */
export function checkSkill(folder, text) {
  const { fields, body, problems } = parseFrontmatter(text);
  const { name, description } = fields;
  if (name === undefined) {
    problems.push("name is missing");
  } else {
    if (name !== folder) {
      problems.push(`name "${name}" must equal its folder "${folder}"`);
    }
    if (!KEBAB_CASE.test(name)) {
      problems.push(`name "${name}" must be lowercase kebab-case`);
    }
    if (name.length > MAX_NAME_LENGTH) {
      problems.push(
        `name is ${name.length} characters; the limit is ${MAX_NAME_LENGTH}`,
      );
    }
  }
  if (description === undefined || description === "") {
    problems.push("description is missing");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    problems.push(
      `description is ${description.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}`,
    );
  }
  return [...problems, ...claudeOnlyProblems(body)];
}

/**
 * One problem per Claude-only tool or feature name that a body uses. Applies
 * to skill bodies and to the agent bodies shipped to other tools.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function claudeOnlyProblems(body) {
  return CLAUDE_ONLY_TOOL_NAMES.filter((token) => body.includes(token)).map(
    (token) => `the body names a Claude-only tool or feature: ${token}`,
  );
}
