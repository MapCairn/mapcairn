// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Prints an issue or pull request thread for an agent to read: who wrote each
 * item, whether that login is one of the project's people (write access to the
 * repository) or outside it, and the text with hidden content removed and the
 * whole body on one JSON line, so a body cannot pass as a separate item written
 * by someone else.
 *
 *   node scripts/agents/thread.mjs issue <number>
 *   node scripts/agents/thread.mjs pr <number>
 *
 * It only reads (`gh api` GET calls). A login is "project" only if it is on the
 * repository's write-access list; `author_association` is shown but never
 * decides, because `MEMBER` and `COLLABORATOR` can mean read access. Without
 * write access the list cannot be read, and every login is shown as outside.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = "MapCairn/mapcairn";
/**
 * Markup a person reading the thread on GitHub does not see: each opens with
 * `open` and runs to the first `close` after it, or to the end of the text when
 * it is never closed. The odd comment closers (`--!>`, `<!-->`) are not ends, so
 * the larger reading stays hidden.
 */
const HIDDEN_MARKUP = [
  { open: /<!--/y, close: /-->/g },
  { open: /<!\[CDATA\[/y, close: /\]\]>/g },
  { open: /<![a-z]/iy, close: />/g },
  { open: /<\?/y, close: /\?>/g },
  { open: /<script(?=[\s>/]|$)/iy, close: /<\/script\s*>/gi },
  { open: /<style(?=[\s>/]|$)/iy, close: /<\/style\s*>/gi },
];
/** Any opener of `HIDDEN_MARKUP`, anywhere in a piece of text. */
const ANY_OPENER = new RegExp(
  HIDDEN_MARKUP.map(({ open }) => open.source).join("|"),
  "i",
);
/** A fence opens on a line of up to three spaces and three or more backticks or tildes. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/my;
/** A reference-style link definition without its line end: a label, a destination, and at most a quoted or bracketed title. Footnotes (`[^1]:`) are rendered, so they do not match. */
const DEFINITION_LINE =
  " {0,3}\\[(?!\\^)[^\\]\\n]+\\]:[ \\t]*(?:<[^<>\\n]*>|[^\\s<]\\S*)(?:[ \\t]+(?:\"[^\"\\n]*\"|'[^'\\n]*'|\\([^()\\n]*\\)))?[ \\t]*";
/** A definition line, which GitHub does not render. */
const LINK_DEFINITION = new RegExp(`^${DEFINITION_LINE}(?:\\n|$)`, "my");
/** A line after which a definition can start a paragraph: the start, a blank line, a heading or another definition. */
const BEFORE_DEFINITION = new RegExp(
  `^(?:[ \\t]*|[ \\t]{0,3}#{1,6}(?:[ \\t].*)?|${DEFINITION_LINE})$`,
);
/** Text that can be printed bare: no space, quote or control character, so it cannot read as a second item. */
const SAFE_TOKEN = /^[\w.@+/[\]-]+$/;

/** Code points that hide or reorder text: control characters other than tab, line feed and carriage return (the JSON line escapes those), soft hyphen, zero-width and bidirectional controls, separators, variation selectors, the byte order mark and Unicode tags. */
const HIDDEN_RANGES = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0xad, 0xad],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x3164, 0x3164],
  [0xffa0, 0xffa0],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe01ef],
];

/**
 * Where the fenced code block that opens at `start` ends. An unclosed fence
 * runs to the end of the text, as it does on GitHub.
 *
 * @param {string} text
 * @param {number} start
 * @param {RegExpExecArray} opening The match of `FENCE_OPEN` at `start`.
 * @returns {number}
 */
function fenceEnd(text, start, opening) {
  const marker = opening[1];
  const closing = new RegExp(
    `^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*(?:\\n|$)`,
  );
  let position = start + opening[0].length;
  while (position < text.length) {
    const lineEnd = text.indexOf("\n", position);
    const next = lineEnd === -1 ? text.length : lineEnd + 1;
    if (closing.test(text.slice(position, next))) {
      return next;
    }
    position = next;
  }
  return text.length;
}

/**
 * Where the code span that opens at `start` ends, or -1 when its backtick run
 * is never closed by a run of the same length before the paragraph ends.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} length The length of the opening backtick run.
 * @returns {number}
 */
function codeSpanEnd(text, start, length) {
  const closer = new RegExp(`(?<!\`)\`{${length}}(?!\`)`, "g");
  closer.lastIndex = start + length;
  const found = closer.exec(text);
  if (found === null || /\n[ \t]*\n/.test(text.slice(start, found.index))) {
    return -1;
  }
  return found.index + length;
}

/**
 * Where the hidden markup that opens at `position` ends, or -1 when none opens
 * there.
 *
 * @param {string} text
 * @param {number} position
 * @returns {number}
 */
function hiddenMarkupEnd(text, position) {
  for (const { open, close } of HIDDEN_MARKUP) {
    open.lastIndex = position;
    const opening = open.exec(text);
    if (opening === null) {
      continue;
    }
    close.lastIndex = position + opening[0].length;
    const closing = close.exec(text);
    return closing === null ? text.length : closing.index + closing[0].length;
  }
  return -1;
}

/**
 * One pass over the text: copies code (fenced blocks and code spans) as it is
 * and drops what GitHub does not show: the markup in `HIDDEN_MARKUP` and link
 * definitions.
 *
 * @param {string} text Text with `\n` line endings only.
 * @returns {{ text: string, hidden: number, codeWithOpener: number }} The kept text, the characters dropped, and how many kept code spans or fences hold an opener of hidden markup.
 */
function removeHidden(text) {
  let kept = "";
  let hidden = 0;
  let codeWithOpener = 0;
  let position = 0;
  const drop = (end) => {
    hidden += Array.from(text.slice(position, end)).length;
    position = end;
  };
  const keep = (end) => {
    kept += text.slice(position, end);
    position = end;
  };
  const keepCode = (end) => {
    if (ANY_OPENER.test(text.slice(position, end))) {
      codeWithOpener += 1;
    }
    keep(end);
  };
  while (position < text.length) {
    const atLineStart = position === 0 || text[position - 1] === "\n";
    FENCE_OPEN.lastIndex = position;
    const fence = atLineStart ? FENCE_OPEN.exec(text) : null;
    if (fence) {
      keepCode(fenceEnd(text, position, fence));
      continue;
    }
    LINK_DEFINITION.lastIndex = position;
    const definition = atLineStart ? LINK_DEFINITION.exec(text) : null;
    if (definition && startsParagraph(text, position)) {
      drop(position + definition[0].length);
      continue;
    }
    const markupEnd = hiddenMarkupEnd(text, position);
    if (markupEnd !== -1) {
      drop(markupEnd);
      continue;
    }
    if (text[position] === "`") {
      const length = /^`+/.exec(text.slice(position))?.[0].length ?? 1;
      const end = codeSpanEnd(text, position, length);
      if (end === -1) {
        keep(position + length);
      } else {
        keepCode(end);
      }
      continue;
    }
    keep(position + 1);
  }
  return { text: kept, hidden, codeWithOpener };
}

/**
 * Whether a line at `position` can start a paragraph, which a link definition
 * needs: it cannot interrupt one.
 *
 * @param {string} text
 * @param {number} position The start of a line.
 * @returns {boolean}
 */
function startsParagraph(text, position) {
  if (position === 0) {
    return true;
  }
  const previousStart = text.lastIndexOf("\n", position - 2) + 1;
  return BEFORE_DEFINITION.test(text.slice(previousStart, position - 1));
}

/**
 * Removes what a person reading the thread on GitHub cannot see (HTML
 * comments, including an unclosed one that hides the rest of the body, and
 * link definitions), and invisible or text-reordering characters, so what an
 * agent reads is what a person sees. Code spans and fenced blocks show their
 * text, so they are left alone; but GitHub may render one inside an HTML block
 * differently, so each that holds an opener of hidden markup is counted for a flag.
 *
 * @param {string} text
 * @returns {{ text: string, hiddenCharacters: number, codeWithOpener: number }} The cleaned text, how many characters of hidden markup or link definition were removed, and how many code spans or fences hold a comment opener.
 */
export function inspectText(text) {
  let current = text.replace(/\r\n?/g, "\n");
  let hiddenCharacters = 0;
  let codeWithOpener = 0;
  for (;;) {
    const pass = removeHidden(current);
    codeWithOpener = Math.max(codeWithOpener, pass.codeWithOpener);
    if (pass.hidden === 0) {
      break;
    }
    hiddenCharacters += pass.hidden;
    current = pass.text;
  }
  const visible = Array.from(current)
    .filter((character) => {
      const point = character.codePointAt(0) ?? 0;
      return !HIDDEN_RANGES.some(([from, to]) => point >= from && point <= to);
    })
    .join("");
  return { text: visible, hiddenCharacters, codeWithOpener };
}

/**
 * The text an agent may read: `inspectText` without the count.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
  return inspectText(text).text;
}

/**
 * A short field from outside the repository (a login, a path, a state), made
 * safe to print on one line: cleaned, and bare only when it holds nothing but
 * word characters and `.@+/[]-`, otherwise a JSON string, so it cannot break
 * the line or read as a second item.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function token(value) {
  const text = cleanText(String(value ?? ""));
  return SAFE_TOKEN.test(text) ? text : JSON.stringify(text);
}

/**
 * One line for one item: whether the login is the project's or outside, the
 * login and its association, and the cleaned body as a single JSON string.
 *
 * @param {string} login
 * @param {string} association GitHub's `author_association`, shown for reference only.
 * @param {string | null | undefined} body
 * @param {Set<string> | null} people Lower-case logins with write access, or null when the list is unavailable.
 * @returns {string}
 */
export function formatItem(login, association, body, people) {
  const label = people?.has(login.toLowerCase()) ? "project" : "outside";
  const { text, hiddenCharacters, codeWithOpener } = inspectText(body ?? "");
  const flags = [
    hiddenCharacters > 0
      ? ` [hidden content removed: ${hiddenCharacters} characters of hidden markup (a comment, declaration, script or style block) or link definition not rendered by GitHub; the thread holds text a person reading it cannot see]`
      : "",
    codeWithOpener > 0
      ? ` [${codeWithOpener} code span or fence holding an opener of hidden markup is shown as written; GitHub may render it as hidden, so a person may not see it]`
      : "",
  ];
  return `${label} ${token(login)} (${token(association)}): ${JSON.stringify(text)}${flags.join("")}`;
}

/**
 * The line for a review comment: its file and line are printed through
 * `token`, because the path comes from outside the repository.
 *
 * @param {Set<string> | null} people
 * @param {any} comment
 * @returns {string}
 */
export function reviewCommentLine(people, comment) {
  const line = Number.isInteger(comment.line) ? comment.line : "?";
  const prefix = `review comment ${token(comment.path)}:${line}: `;
  return itemLine(people, comment, prefix);
}

/**
 * The line for a comment in an unresolved review thread.
 *
 * @param {Set<string> | null} people
 * @param {string | null | undefined} path The file the thread is on.
 * @param {any} comment A GraphQL comment node.
 * @returns {string}
 */
export function unresolvedThreadLine(people, path, comment) {
  return `unresolved thread ${token(path)}: ${formatItem(comment.author?.login ?? "unknown", "n/a", comment.body, people)}`;
}

/**
 * @param {Set<string> | null} people
 * @param {any} item An issue, comment, review or review comment from the API.
 * @param {string} [prefix] Printed before the item; it must already be safe.
 * @returns {string}
 */
function itemLine(people, item, prefix = "") {
  const login = item.user?.login ?? "unknown";
  return `${prefix}${formatItem(login, item.author_association ?? "NONE", item.body, people)}`;
}

/**
 * @param {string[]} args
 * @returns {string | null} Standard output, or null when the call failed.
 */
function gh(args) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

/**
 * @param {string} path
 * @returns {any[] | null} The items, or null when the call failed (so a failure is never read as an empty list).
 */
function listAll(path) {
  const out = gh(["api", path, "--paginate", "--jq", ".[]"]);
  return out === null
    ? null
    : out
        .split("\n")
        .filter(Boolean)
        .map((row) => JSON.parse(row));
}

/**
 * Prints each item of a list, or says the list is unavailable.
 *
 * @param {string} name
 * @param {any[] | null} items
 * @param {(item: any) => string} show
 */
function printAll(name, items, show) {
  if (items === null) {
    console.log(
      `${name} unavailable (the call failed): do not rely on this thread and do not merge`,
    );
    return;
  }
  for (const item of items) {
    console.log(show(item));
  }
}

/** @returns {Set<string> | null} */
function writeAccessList() {
  const out = gh([
    "api",
    `repos/${REPO}/collaborators`,
    "--paginate",
    "--jq",
    ".[] | select(.permissions.push) | .login",
  ]);
  return out === null
    ? null
    : new Set(
        out
          .split("\n")
          .filter(Boolean)
          .map((login) => login.toLowerCase()),
      );
}

/**
 * @param {number} number
 * @param {Set<string> | null} people
 */
function printIssue(number, people) {
  const issue = JSON.parse(
    gh(["api", `repos/${REPO}/issues/${number}`]) ?? "{}",
  );
  console.log(`# ${token(issue.state ?? "?")} #${number}`);
  console.log(itemLine(people, { ...issue, body: issue.title }, "title: "));
  console.log(itemLine(people, issue, "body: "));
  printAll(
    "comments",
    listAll(`repos/${REPO}/issues/${number}/comments`),
    (comment) => itemLine(people, comment, "comment: "),
  );
}

/**
 * @param {number} number
 * @param {Set<string> | null} people
 */
function printPullRequest(number, people) {
  printIssue(number, people);
  const pull = JSON.parse(gh(["api", `repos/${REPO}/pulls/${number}`]) ?? "{}");
  const headRepo = pull.head?.repo?.full_name ?? "unknown";
  const commits = listAll(`repos/${REPO}/pulls/${number}/commits`);
  if (commits === null) {
    console.log(
      "commits unavailable (the call failed): treat the pull request as from outside and do not merge",
    );
  } else {
    const outsideCommits = commits.filter(
      (commit) => !people?.has((commit.author?.login ?? "").toLowerCase()),
    ).length;
    console.log(
      `head: ${token(headRepo)} (${headRepo === REPO ? "this repository" : "another repository"}), ${outsideCommits} of ${commits.length} commits by logins outside the project; a pull request with any of these is reviewed as outside`,
    );
  }
  printAll(
    "reviews",
    listAll(`repos/${REPO}/pulls/${number}/reviews`),
    (review) => itemLine(people, review, `review ${token(review.state)}: `),
  );
  printAll(
    "review comments",
    listAll(`repos/${REPO}/pulls/${number}/comments`),
    (comment) => reviewCommentLine(people, comment),
  );
  const threads = gh([
    "api",
    "graphql",
    "-F",
    `number=${number}`,
    "-f",
    `query=query($number:Int!){repository(owner:"MapCairn",name:"mapcairn"){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved path comments(first:20){nodes{author{login} body}}}}}}}`,
    "--jq",
    ".data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)",
  ]);
  if (threads === null) {
    console.log(
      "threads unavailable (the call failed): do not merge until the unresolved review threads are known",
    );
    return;
  }
  for (const text of threads.split("\n").filter(Boolean)) {
    const thread = JSON.parse(text);
    for (const comment of thread.comments?.nodes ?? []) {
      console.log(unresolvedThreadLine(people, thread.path, comment));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, raw] = process.argv.slice(2);
  const number = Number(raw);
  if (
    !["issue", "pr"].includes(kind) ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    console.error("usage: node scripts/agents/thread.mjs issue|pr <number>");
    process.exit(2);
  }
  const people = writeAccessList();
  console.log(
    people
      ? `write-access list: ${[...people].map(token).join(", ")}`
      : "write-access list unavailable (it needs write access): every login is shown as outside",
  );
  if (kind === "issue") {
    printIssue(number, people);
  } else {
    printPullRequest(number, people);
  }
}
