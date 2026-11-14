// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Refuses a private list of names in the repository's files, in commit
 * messages and in pull request text.
 *
 *   node scripts/names-check.mjs                  every tracked text file (same as `files`)
 *   node scripts/names-check.mjs files
 *   node scripts/names-check.mjs message <path>   a commit message file (the commit-msg hook)
 *   node scripts/names-check.mjs text             PR_TITLE and PR_BODY from the environment, commit messages on standard input (CI)
 *   node scripts/names-check.mjs github           read-only scan of the repository's issues, pull requests, reviews, comments and releases
 *   node scripts/names-check.mjs hash <word>      prints the hash and length to add to the list
 *
 * The list holds only one-way SHA-256 hashes, so the names are not stored in
 * plain text. Hashes of short words can still be found by exhaustive search,
 * so this keeps names out of casual sight and does not hide them from a
 * determined reader. Every mode prints only where a name is, such as
 * `path:3: a forbidden name`, and never the name, a hash or the line. `hash` is
 * the one mode that prints a hash, for the person who keeps the plain list.
 * Exit codes: 0 clean, 1 a name was found, 2 the check could not run, which is
 * never read as a clean result.
 *
 * Text is lower-cased, normalised (Unicode NFKD), stripped of accents and
 * invisible characters, then split into runs of letters and digits, so case,
 * accents, full-width letters and zero-width or direction-changing characters
 * do not hide a name. It only reads, and sends nothing anywhere except the
 * `github` mode, which calls `gh api` with GET requests.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "MapCairn/mapcairn";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FOUND = "a forbidden name";
const CANNOT_RUN = "names check: the check could not run";
const USAGE =
  "usage: node scripts/names-check.mjs [files | message <path> | text | github | hash <word>]";
const GH_TIMEOUT_MS = 120_000;
const GH_MAX_BUFFER = 256 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8000;

/**
 * One forbidden word, stored as the SHA-256 hash of its lower-case form.
 *
 * @typedef {object} ForbiddenName
 * @property {string} hash Hex SHA-256 of the word as `hash <word>` normalises it.
 * @property {number} length The word's length in characters; a substring match hashes substrings of this length.
 * @property {boolean} whole True when only a token equal to the word counts (for a short word that would otherwise match inside ordinary words); false when the word is also forbidden inside a longer token.
 */

/**
 * The forbidden names, as hashes. The maintainer keeps the plain list and adds
 * a name with `node scripts/names-check.mjs hash <word>`, then copies the line
 * it prints into this list. Do not write a name here.
 *
 * @type {ForbiddenName[]}
 */
export const FORBIDDEN = [
  {
    hash: "b2d06fca0a19f88b476bdc2912109243ba2746748790618cb9b1ff298d606311",
    length: 8,
    whole: false,
  },
  {
    hash: "1f59c078843ba9296b71c674a53e3e0ec6308b242c8cdc7fad3df2366c3c340e",
    length: 10,
    whole: false,
  },
  {
    hash: "8535e86c8118bbbb0a18ac72d15d3a2b37b18d1bce1611fc60165f322cf57386",
    length: 3,
    whole: true,
  },
];

/** Combining marks, format characters (zero-width, direction controls, soft hyphen, Unicode tags), variation selectors and the filler letters that render as nothing. */
const INVISIBLE = /[\p{M}\p{Cf}\p{Variation_Selector}ᅟᅠㅤﾠ\u{e0000}-\u{e01ef}]/gu;
const WHITESPACE = /[\s\u0085]/g;
const CONTROL = /\p{Cc}/gu;
const TOKEN = /[\p{L}\p{N}]+/gu;
const LINE_END = /\r\n|\r|\n/;
const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".br",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

/**
 * Lower-cases text, normalises it (NFKD), removes accents and invisible
 * characters, and splits it into runs of letters and digits.
 *
 * @param {string} text
 * @returns {string[]} The tokens in order, with repeats.
 */
export function tokensOf(text) {
  const plain = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(INVISIBLE, "")
    .replace(WHITESPACE, " ")
    .replace(CONTROL, "")
    .toLowerCase();
  return plain.match(TOKEN) ?? [];
}

/**
 * @param {string} text
 * @returns {string}
 */
function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * @param {string[]} characters The token as an array of characters.
 * @param {ForbiddenName} item
 * @returns {boolean}
 */
function substringMatches(characters, item) {
  for (let start = 0; start + item.length <= characters.length; start += 1) {
    const part = characters.slice(start, start + item.length).join("");
    if (sha256(part) === item.hash) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} token
 * @param {ForbiddenName[]} list
 * @returns {boolean} Whether the token is, or for a substring entry holds, a forbidden word.
 */
function tokenIsForbidden(token, list) {
  const characters = Array.from(token);
  return list.some((item) => {
    if (characters.length < item.length) {
      return false;
    }
    if (item.whole) {
      return characters.length === item.length && sha256(token) === item.hash;
    }
    return substringMatches(characters, item);
  });
}

/**
 * Finds the lines of a text that hold a forbidden name. Each distinct token is
 * hashed once.
 *
 * @param {string} text
 * @param {ForbiddenName[]} list
 * @returns {number[]} The 1-based line numbers, never the name itself.
 */
export function findForbidden(text, list) {
  const verdicts = new Map();
  const verdictOf = (token) => {
    if (!verdicts.has(token)) {
      verdicts.set(token, tokenIsForbidden(token, list));
    }
    return verdicts.get(token);
  };
  const lines = [];
  text.split(LINE_END).forEach((line, index) => {
    if (tokensOf(line).some(verdictOf)) {
      lines.push(index + 1);
    }
  });
  return lines;
}

/**
 * The hash and length to add to the list for one word.
 *
 * @param {string} word
 * @returns {{ hash: string, length: number } | null} Null unless the word is exactly one token.
 */
export function hashWord(word) {
  const tokens = tokensOf(word);
  if (tokens.length !== 1) {
    return null;
  }
  return { hash: sha256(tokens[0]), length: Array.from(tokens[0]).length };
}

/**
 * @param {string} path
 * @returns {boolean} Whether the file is text that should be scanned: not a binary extension and not a lockfile.
 */
export function isScannable(path) {
  return (
    basename(path) !== "package-lock.json" &&
    !BINARY_EXTENSIONS.has(extname(path).toLowerCase())
  );
}

/**
 * @param {string} label Where the text came from, such as a path.
 * @param {string} text
 * @param {ForbiddenName[]} list
 * @returns {string[]} One `label:line: a forbidden name` for each line with a name.
 */
function locate(label, text, list) {
  return findForbidden(text, list).map((line) => `${label}:${line}: ${FOUND}`);
}

/**
 * @param {string} path
 * @returns {string | null} The text of a regular file, or null for a directory, a missing file or a binary file.
 */
function readText(path) {
  try {
    if (!statSync(path).isFile()) {
      return null;
    }
    const buffer = readFileSync(path);
    return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)
      ? null
      : buffer.toString("utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      return null;
    }
    throw error;
  }
}

/**
 * Findings for the tracked files. A name in a file name is reported by its
 * position, never by the name.
 *
 * @param {Deps} deps
 * @returns {string[]}
 */
function scanFiles(deps) {
  const findings = [];
  deps.trackedFiles().forEach((path, index) => {
    const nameIsForbidden = findForbidden(path, deps.list).length > 0;
    if (nameIsForbidden) {
      findings.push(`file name ${index + 1}: ${FOUND}`);
    }
    const text = isScannable(path) ? readText(resolve(deps.root, path)) : null;
    if (text !== null) {
      findings.push(
        ...locate(
          nameIsForbidden ? `file ${index + 1}` : path,
          text,
          deps.list,
        ),
      );
    }
  });
  return findings;
}

/**
 * @param {string[]} findings
 * @param {Deps} deps
 * @returns {number} 1 when there is a finding, otherwise 0.
 */
function report(findings, deps) {
  for (const finding of findings) {
    deps.error(finding);
  }
  return findings.length > 0 ? 1 : 0;
}

/**
 * @param {string} _argument
 * @param {Deps} deps
 * @returns {number}
 */
function filesMode(_argument, deps) {
  return report(scanFiles(deps), deps);
}

/**
 * @param {string | undefined} path
 * @param {Deps} deps
 * @returns {number}
 */
function messageMode(path, deps) {
  if (!path) {
    deps.error(USAGE);
    return 2;
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    deps.error("names check: the commit message file could not be read");
    return 2;
  }
  return report(locate(path, raw, deps.list), deps);
}

/**
 * @param {string} _argument
 * @param {Deps} deps
 * @returns {number}
 */
function textMode(_argument, deps) {
  const findings = [
    ...locate("pull request title", deps.env.PR_TITLE ?? "", deps.list),
    ...locate("pull request body", deps.env.PR_BODY ?? "", deps.list),
    ...locate("commit messages", deps.readStdin(), deps.list),
  ];
  return report(findings, deps);
}

/**
 * @param {string} word
 * @param {Deps} deps
 * @returns {number}
 */
function hashMode(word, deps) {
  const result = hashWord(word ?? "");
  if (result === null) {
    deps.error("usage: node scripts/names-check.mjs hash <word> (one word)");
    return 2;
  }
  deps.log(`${result.hash} ${result.length}`);
  return 0;
}

/**
 * A `gh api` read of one list endpoint, with `jq` reshaping each element to
 * `{label, parts}`: where the text is, and its named pieces.
 *
 * @param {string} path
 * @param {string} jq
 * @returns {{ path: string, jq: string }}
 */
function source(path, jq) {
  return { path: `repos/${REPO}/${path}`, jq };
}

const PAGE = "per_page=100";
/** What the `github` mode reads. Issues include pull requests, with their titles and descriptions. */
const GITHUB_SOURCES = [
  source(
    `issues?state=all&${PAGE}`,
    '.[] | {label: "#\\(.number)", parts: {title: (.title // ""), body: (.body // "")}}',
  ),
  source(
    `issues/comments?${PAGE}`,
    '.[] | {label: "#\\(.issue_url | split("/") | last)", parts: {comment: (.body // "")}}',
  ),
  source(
    `pulls/comments?${PAGE}`,
    '.[] | {label: "#\\(.pull_request_url | split("/") | last)", parts: {"review comment": (.body // "")}}',
  ),
  source(
    `releases?${PAGE}`,
    '.[] | {label: "release \\(.id)", parts: {name: (.name // ""), body: (.body // "")}}',
  ),
];
const PULL_REQUEST_LIST = source(`pulls?state=all&${PAGE}`, ".[] | {number}");

/**
 * @param {number} number
 * @returns {{ path: string, jq: string }}
 */
function reviewSource(number) {
  return source(
    `pulls/${number}/reviews?${PAGE}`,
    `.[] | {label: "#${number}", parts: {review: (.body // "")}}`,
  );
}

/**
 * Reads one endpoint through `gh api`.
 *
 * @param {{ path: string, jq: string }} request
 * @param {Deps} deps
 * @returns {object[] | null} The rows, or null when the call failed or its answer was not one JSON object per line (so a failure is never read as an empty list).
 */
function readRows(request, deps) {
  const result = deps.runGh([
    "api",
    request.path,
    "--paginate",
    "--jq",
    request.jq,
  ]);
  if (result.status !== 0) {
    return null;
  }
  try {
    return result.stdout
      .split("\n")
      .filter((row) => row.trim() !== "")
      .map((row) => JSON.parse(row));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} row
 * @returns {boolean} Whether the row has a label and named string parts.
 */
function isItem(row) {
  return (
    typeof row?.label === "string" &&
    typeof row?.parts === "object" &&
    row.parts !== null &&
    Object.values(row.parts).every((part) => typeof part === "string")
  );
}

/**
 * Scans every issue, pull request, review, comment and release body.
 *
 * @param {string} _argument
 * @param {Deps} deps
 * @returns {number} 0 clean, 1 a finding, 2 a request failed.
 */
function githubMode(_argument, deps) {
  const failed = (request) => {
    deps.error(
      `names check: a request to GitHub failed (${request.path.split("?")[0]})`,
    );
    return 2;
  };
  const pulls = readRows(PULL_REQUEST_LIST, deps);
  if (pulls === null || !pulls.every((row) => Number.isInteger(row?.number))) {
    return failed(PULL_REQUEST_LIST);
  }
  const requests = [
    ...GITHUB_SOURCES,
    ...pulls.map((row) => reviewSource(row.number)),
  ];
  const findings = [];
  let scanned = 0;
  for (const request of requests) {
    const rows = readRows(request, deps);
    if (rows === null || !rows.every(isItem)) {
      return failed(request);
    }
    for (const row of rows) {
      scanned += 1;
      for (const [part, text] of Object.entries(row.parts)) {
        findings.push(...locate(`${row.label} ${part}`, text, deps.list));
      }
    }
  }
  const code = report(findings, deps);
  deps.log(`github: scanned ${scanned} items, ${findings.length} findings`);
  return code;
}

/**
 * The command line modes, by name.
 *
 * @type {Record<string, (argument: string | undefined, deps: Deps) => number>}
 */
const MODES = {
  files: filesMode,
  message: messageMode,
  text: textMode,
  github: githubMode,
  hash: hashMode,
};

/**
 * What the command line needs from outside, so a test can replace it.
 *
 * @typedef {object} Deps
 * @property {ForbiddenName[]} list
 * @property {Record<string, string | undefined>} env
 * @property {string} root The directory tracked paths are relative to.
 * @property {() => string} readStdin
 * @property {() => string[]} trackedFiles
 * @property {(args: string[]) => { status: number | null, stdout: string }} runGh
 * @property {(line: string) => void} log
 * @property {(line: string) => void} error
 */

/**
 * Runs one mode and returns the exit code. Findings go to `error`, and the
 * hash and the `github` counts go to `log`.
 *
 * @param {string[]} argv The arguments after the script name.
 * @param {Deps} deps
 * @returns {number} 0 clean, 1 a name was found, 2 the check could not run.
 */
export function runCli(argv, deps) {
  const [mode = "files", argument] = argv;
  const run = Object.hasOwn(MODES, mode) ? MODES[mode] : null;
  if (run === null) {
    deps.error(USAGE);
    return 2;
  }
  try {
    return run(argument, { root: ROOT, ...deps });
  } catch {
    deps.error(CANNOT_RUN);
    return 2;
  }
}

/** @returns {string[]} The paths git tracks, relative to the repository root. */
function gitTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: GH_MAX_BUFFER,
  });
  if (result.status !== 0) {
    throw new Error("git ls-files failed");
  }
  return result.stdout.split("\0").filter(Boolean);
}

/** @returns {string} Standard input when it is piped, otherwise nothing. A read error is thrown, so it is never taken for an empty input. */
function readPipedStdin() {
  return process.stdin.isTTY ? "" : readFileSync(0, "utf8");
}

/**
 * Whether this file was started directly, comparing real paths so that a
 * symbolic link or junction to it does not make the check run nothing.
 *
 * @returns {boolean}
 */
function isEntryPoint() {
  const entry = process.argv[1];
  return (
    entry !== undefined &&
    realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  );
}

if (isEntryPoint()) {
  process.exit(
    runCli(process.argv.slice(2), {
      list: FORBIDDEN,
      env: process.env,
      root: ROOT,
      readStdin: readPipedStdin,
      trackedFiles: gitTrackedFiles,
      runGh: (args) =>
        spawnSync("gh", args, {
          encoding: "utf8",
          maxBuffer: GH_MAX_BUFFER,
          timeout: GH_TIMEOUT_MS,
        }),
      log: console.log,
      error: console.error,
    }),
  );
}
