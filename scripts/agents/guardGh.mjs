// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The rules `guardCommands.mjs` applies to a `gh` command run by a read-only
 * reviewer: it reads GitHub and never writes to it. Only the command groups a
 * reviewer needs are known (`pr`, `issue`, `run`, `repo`, `workflow`,
 * `release`, `label`, `search`, `api`, `auth status`), and in them only the
 * reading verbs. Any other word, such as a user-defined alias or an
 * extension, is refused because what it runs cannot be known.
 */

/** The command groups a reviewer may use. */
const GH_NOUNS = new Set([
  "pr",
  "issue",
  "run",
  "repo",
  "workflow",
  "release",
  "label",
  "search",
  "api",
  "auth",
]);

/** The second words that read. */
const GH_READ_VERBS = new Set(["view", "list", "diff", "checks", "status"]);

/** Options that take the next word as their value. */
const VALUE_OPTIONS = new Set(["-R", "--repo", "--hostname"]);

/**
 * Finds the command group and its verb, skipping the value of `--repo` and the
 * like, so that `gh pr --repo x merge` is read as `pr merge`.
 *
 * @param {string[]} args
 * @returns {string[]}
 */
function positionalWords(args) {
  /** @type {string[]} */
  const words = [];
  for (let index = 0; index < args.length && words.length < 2; index += 1) {
    const arg = args[index] ?? "";
    if (VALUE_OPTIONS.has(arg)) {
      index += 1;
    } else if (!arg.startsWith("-")) {
      words.push(arg);
    }
  }
  return words;
}

/**
 * Collects the HTTP methods, headers and whether fields were sent in a
 * `gh api` command.
 *
 * @param {string[]} args
 * @returns {{ methods: string[], headers: string[], fields: boolean }}
 */
function readApiOptions(args) {
  /** @type {string[]} */
  const methods = [];
  /** @type {string[]} */
  const headers = [];
  let fields = false;
  args.forEach((arg, index) => {
    const next = args[index + 1] ?? "";
    const inlineMethod = /^(?:-X|--method=)(.+)$/.exec(arg);
    const inlineHeader = /^(?:-H|--header=)(.+)$/.exec(arg);
    if (arg === "-X" || arg === "--method") {
      methods.push(next);
    } else if (inlineMethod) {
      methods.push(inlineMethod[1] ?? "");
    } else if (arg === "-H" || arg === "--header") {
      headers.push(next);
    } else if (inlineHeader) {
      headers.push(inlineHeader[1] ?? "");
    }
    fields ||= /^(-[fF]|--field|--raw-field|--input)(=|$)|^-[fF]./.test(arg);
  });
  return { methods, headers, fields };
}

/**
 * Decides on `gh api`, which reads unless it uses a method other than GET, a
 * header that overrides the method, sends fields (which makes it a POST) or
 * calls the GraphQL endpoint, which can run a mutation.
 *
 * @param {string[]} args The words after `api`.
 * @returns {string | undefined}
 */
function checkApi(args) {
  const { methods, headers, fields } = readApiOptions(args);
  const bad = methods.find((method) => method.toUpperCase() !== "GET");
  if (bad !== undefined) {
    return `gh api with the method ${bad.toUpperCase()} writes to GitHub`;
  }
  if (headers.some((header) => /override/i.test(header))) {
    return "gh api with a method-override header writes to GitHub";
  }
  if (args.some((arg) => arg.replace(/^\//, "") === "graphql")) {
    return "gh api graphql can run a mutation, so a reviewer reads with gh pr view or gh api on a REST path";
  }
  return fields && methods.length === 0
    ? "gh api with a field or input sends a POST, which writes to GitHub; add -X GET to read"
    : undefined;
}

/**
 * Decides on a `gh` command.
 *
 * @param {string[]} args The words after `gh`.
 * @returns {string | undefined}
 */
export function checkGh(args) {
  const first = args[0] ?? "";
  if (first.startsWith("-") && !/^(--version|--help|-h)$/.test(first)) {
    return "put the gh command before its options, so it can be checked";
  }
  const [noun, verb = ""] = positionalWords(args);
  if (noun === undefined) {
    return undefined;
  }
  if (!GH_NOUNS.has(noun)) {
    return `gh ${noun} is not a command group a reviewer may use; it may be an alias or extension that writes`;
  }
  if (noun === "search") {
    return undefined;
  }
  if (noun === "api") {
    return checkApi(args.slice(args.indexOf("api") + 1));
  }
  return GH_READ_VERBS.has(verb)
    ? undefined
    : `gh ${noun} ${verb} can change GitHub; a reviewer only reads (view, list, diff, checks, status)`;
}
