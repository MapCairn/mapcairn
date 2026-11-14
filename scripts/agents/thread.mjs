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
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Code points that hide or reorder text: soft hyphen, zero-width and bidirectional controls, separators, variation selectors, the byte order mark and Unicode tags. */
const HIDDEN_RANGES = [
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
 * Removes HTML comments and invisible or text-reordering characters, so what an
 * agent reads is what a person sees.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
  let withoutComments = text;
  for (;;) {
    const next = withoutComments.replace(HTML_COMMENT, "");
    if (next === withoutComments) {
      break;
    }
    withoutComments = next;
  }
  return Array.from(withoutComments)
    .filter((character) => {
      const point = character.codePointAt(0) ?? 0;
      return !HIDDEN_RANGES.some(([from, to]) => point >= from && point <= to);
    })
    .join("");
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
  return `${label} ${login} (${association}): ${JSON.stringify(cleanText(body ?? ""))}`;
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
        .map((line) => JSON.parse(line));
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
 * @param {Set<string> | null} people
 * @param {any} item An issue, comment, review or review comment from the API.
 * @param {string} [prefix]
 * @returns {string}
 */
function line(people, item, prefix = "") {
  const login = item.user?.login ?? "unknown";
  return `${prefix}${formatItem(login, item.author_association ?? "NONE", item.body, people)}`;
}

/**
 * @param {number} number
 * @param {Set<string> | null} people
 */
function printIssue(number, people) {
  const issue = JSON.parse(
    gh(["api", `repos/${REPO}/issues/${number}`]) ?? "{}",
  );
  console.log(`# ${issue.state ?? "?"} #${number}`);
  console.log(line(people, { ...issue, body: issue.title }, "title: "));
  console.log(line(people, issue, "body: "));
  printAll(
    "comments",
    listAll(`repos/${REPO}/issues/${number}/comments`),
    (comment) => line(people, comment, "comment: "),
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
      `head: ${headRepo} (${headRepo === REPO ? "this repository" : "another repository"}), ${outsideCommits} of ${commits.length} commits by logins outside the project; a pull request with any of these is reviewed as outside`,
    );
  }
  printAll(
    "reviews",
    listAll(`repos/${REPO}/pulls/${number}/reviews`),
    (review) => line(people, review, `review ${review.state}: `),
  );
  printAll(
    "review comments",
    listAll(`repos/${REPO}/pulls/${number}/comments`),
    (comment) =>
      line(
        people,
        comment,
        `review comment ${comment.path}:${comment.line ?? "?"}: `,
      ),
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
      console.log(
        `unresolved thread ${thread.path}: ${formatItem(comment.author?.login ?? "unknown", "n/a", comment.body, people)}`,
      );
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
      ? `write-access list: ${[...people].join(", ")}`
      : "write-access list unavailable (it needs write access): every login is shown as outside",
  );
  if (kind === "issue") {
    printIssue(number, people);
  } else {
    printPullRequest(number, people);
  }
}
