// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Fails on prose habits that make a document read as machine-written, in the
 * documentation site's hand-written Markdown (`sites/docs/docs`) and every
 * `README.md`: a short list of filler words, more than one em dash in a
 * paragraph, and more bold lead-in bullets in a page than a reader can take in.
 * It prints each problem as `file:line: what`. Code blocks, code spans and
 * table rows are not read for em dashes, and code is not read for words.
 *
 *   node scripts/prose-check.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isEntryPoint } from "./entryPoint.mjs";

/** Filler words that say nothing a plainer word does not. Each also matches its usual endings. */
export const BANNED_WORDS = [
  "seamless",
  "robust",
  "powerful",
  "comprehensive",
  "leverage",
  "elevate",
  "delve",
  "crucial",
  "effortless",
  "streamline",
  "unlock",
  "simply",
  "straightforward",
];

/** The most bullets a page may start with a bold phrase. A page past it reads as a list of labels. */
export const MAX_BOLD_LEAD_INS = 8;

const EM_DASH = "—";
const ENDINGS = "(?:s|es|d|ed|ing|ly|ness)?";
const BANNED_PATTERN = new RegExp(
  `\\b(?:${BANNED_WORDS.map((word) => `${word.replace(/e$/, "e?")}${ENDINGS}`).join("|")})\\b`,
  "gi",
);
const FENCE = /^\s*(?:```|~~~)/;
const CODE_SPAN = /`[^`\n]*`/g;
const BULLET = /^\s*(?:[-*+]|\d+\.)\s+/;
const BOLD_BULLET = /^\s*(?:[-*+]|\d+\.)\s+\*\*/;
const HEADING = /^#{1,6}\s/;
const TABLE_ROW = /^\s*\|/;
const SKIPPED_FOLDER = /^sites\/docs\/docs\/(?:api|generated|changelog)\//;
const SITE_PAGE = /^sites\/docs\/docs\/.+\.mdx?$/;
const README = /(?:^|\/)README\.md$/;

/**
 * Whether the tracked file is one the check reads.
 *
 * @param {string} path Repository-relative path with forward slashes.
 * @returns {boolean}
 */
export function isChecked(path) {
  if (SKIPPED_FOLDER.test(path)) {
    return false;
  }
  return SITE_PAGE.test(path) || README.test(path);
}

/**
 * The lines of a text with fenced code blocks and code spans blanked out, so
 * line numbers stay the same and no rule reads code.
 *
 * @param {string} text
 * @returns {string[]}
 */
function proseLines(text) {
  let inFence = false;
  return text.split(/\r?\n/).map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line.replace(CODE_SPAN, "");
  });
}

/**
 * @param {string[]} lines
 * @returns {{ line: number, rule: string, message: string }[]}
 */
function bannedWords(lines) {
  return lines.flatMap((content, index) =>
    [...content.matchAll(BANNED_PATTERN)].map((match) => ({
      line: index + 1,
      rule: "banned-word",
      message: `"${match[0]}" is filler: say the plain thing instead`,
    })),
  );
}

/**
 * One report for each paragraph with more than one em dash, on the line of its
 * second. A heading, a list item and a blank line each start a new paragraph,
 * and a table row is not a paragraph.
 *
 * @param {string[]} lines
 * @returns {{ line: number, rule: string, message: string }[]}
 */
function extraEmDashes(lines) {
  const reports = [];
  let dashes = 0;
  lines.forEach((content, index) => {
    if (content.trim() === "" || TABLE_ROW.test(content)) {
      dashes = 0;
      return;
    }
    if (HEADING.test(content) || BULLET.test(content)) {
      dashes = 0;
    }
    for (const _dash of content.matchAll(new RegExp(EM_DASH, "g"))) {
      dashes += 1;
      if (dashes === 2) {
        reports.push({
          line: index + 1,
          rule: "em-dashes",
          message:
            "a second em dash in one paragraph: use a comma, colon, bracket or full stop",
        });
      }
    }
  });
  return reports;
}

/**
 * One report for a page with more than {@link MAX_BOLD_LEAD_INS} bullets that
 * start with a bold phrase, on the first bullet past the limit.
 *
 * @param {string[]} lines
 * @returns {{ line: number, rule: string, message: string }[]}
 */
function tooManyBoldLeadIns(lines) {
  let count = 0;
  for (const [index, content] of lines.entries()) {
    count += BOLD_BULLET.test(content) ? 1 : 0;
    if (count > MAX_BOLD_LEAD_INS) {
      return [
        {
          line: index + 1,
          rule: "bold-lead-ins",
          message: `more than ${MAX_BOLD_LEAD_INS} bullets start with a bold phrase: write prose, a table or a definition list`,
        },
      ];
    }
  }
  return [];
}

/**
 * Every problem in a page's text, in line order.
 *
 * @param {string} text The page's Markdown.
 * @returns {{ line: number, rule: string, message: string }[]}
 */
export function findProseProblems(text) {
  const lines = proseLines(text);
  return [
    ...bannedWords(lines),
    ...extraEmDashes(lines),
    ...tooManyBoldLeadIns(lines),
  ].sort((a, b) => a.line - b.line);
}

/** Reports every problem in the tracked files and exits 1 if there is one. */
function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((file) => file !== "" && isChecked(file))
    .filter((file) => existsSync(join(root, file)));
  const reports = files.flatMap((file) =>
    findProseProblems(readFileSync(join(root, file), "utf8")).map(
      ({ line, message }) => `${file}:${line}: ${message}`,
    ),
  );
  if (reports.length > 0) {
    console.error(`prose: ${reports.length} problem(s)\n${reports.join("\n")}`);
    process.exit(1);
  }
  console.log(`prose: ${files.length} files checked, no problems`);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
