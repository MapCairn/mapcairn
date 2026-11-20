// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Checks `CHANGELOG.md` against the release notes style guide
 * (`docs/guides/releasing.md`): notes written for people, not a commit log.
 *
 *   npm run release:notes-check
 *   node scripts/release/notesCheck.mjs [path]
 *
 * It fails on a commit prefix in the notes, an `@handle` outside a code span
 * (which would notify someone), a raw pull request number, an emoji, an
 * attribution line, a heading the guide does not name, a change to make on
 * upgrade without a before and an after, and a forbidden name. A bullet that
 * repeats a commit subject needs the history, so that rule runs only where
 * git has it and prints a notice in a shallow clone.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { FORBIDDEN, findForbidden } from "../names-check.mjs";
import { parseChangelog, scanLines } from "./changelog.mjs";
import { parseVersion, previousTag, releaseTags } from "./semver.mjs";
import { git } from "./tools.mjs";
import { parseCommit } from "./versionRules.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The `###` headings the style guide allows. */
export const SECTION_HEADINGS = [
  "What is new",
  "What got better",
  "What to change when you upgrade",
  "Thanks",
];

/** The heading whose entries are changes a person must make. */
const UPGRADE_HEADING = "What to change when you upgrade";

const COMMIT_PREFIX =
  /^\s*[-*]?\s*(feat|fix|perf|refactor|docs|chore|build|ci|test|style|revert)(\(.*\))?!?:/;
/** An `@` handle that is not inside a code span and not a scoped package name such as `@mapcairn/map`. */
const HANDLE = /(^|[^\w`])@[\w-]+(?![\w-]*\/)/;
const RAW_PULL_REQUEST = /\(#\d+\)/;
/**
 * Emoji and pictographs. `\p{Extended_Pictographic}` is not used because it
 * also matches the plain symbols for copyright, registered and trade mark,
 * which prose may hold.
 */
const EMOJI =
  /\p{Emoji_Presentation}|[\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{1F000}-\u{1FAFF}]|\u{FE0F}|\u{20E3}/u;
const ATTRIBUTION =
  /generated (?:with|by)\b|co-authored-by\s*:|(?:written|created|authored|assisted|drafted) (?:with|by) (?:an? )?(?:ai\b|claude|chatgpt|copilot|codex|gemini|llm)/i;
const PACKAGE_HEADING = /^`?(?:@mapcairn\/)?(?:core|map|react|theme)`?$/;
const BULLET = /^(?:[-*]|\d+\.)\s+/;
const ENTRY_START = /^(?:[-*]\s|\d+\.\s|\*\*)/;

/**
 * @typedef {object} Finding
 * @property {number} line The 1-based line in the file.
 * @property {string} message
 */

/**
 * The line without its inline code spans, which may hold anything.
 *
 * @param {string} text
 * @returns {string}
 */
function withoutCodeSpans(text) {
  return text.replace(/(`+)[^`]*?\1/g, "");
}

/**
 * The plain words of a bullet or a subject, for comparing one with the other:
 * no bullet marker, emphasis, link, pull request tail or case.
 *
 * @param {string} text
 * @returns {string}
 */
function plainWords(text) {
  return text
    .replace(BULLET, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\(#\d+\)|\(\[?#\d+\]?\)/g, "")
    .replace(/[*_`]/g, "")
    .replace(/[\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {import("./changelog.mjs").Section | undefined} section
 * @param {number} line
 * @param {Set<string>} seen Versions already met, updated here.
 * @returns {Finding[]}
 */
function versionHeadingFindings(section, line, seen) {
  if (section === undefined || section.version === null) {
    return [
      {
        line,
        message: "A `##` heading must read `## <version> (<YYYY-MM-DD>)`.",
      },
    ];
  }
  /** @type {Finding[]} */
  const findings = [];
  const date = new Date(`${section.date}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== section.date
  ) {
    findings.push({ line, message: `${section.date} is not a real date.` });
  }
  if (seen.has(section.version)) {
    findings.push({
      line,
      message: `Version ${section.version} has more than one section.`,
    });
  }
  seen.add(section.version);
  if (section.lines.every((entry) => entry.text.trim() === "")) {
    findings.push({
      line,
      message: `Version ${section.version} has no notes under its heading.`,
    });
  }
  return findings;
}

/**
 * Headings the style guide does not allow.
 *
 * @param {string} text
 * @returns {Finding[]}
 */
function headingFindings(text) {
  /** @type {Finding[]} */
  const findings = [];
  const { sections } = parseChangelog(text);
  const seen = new Set();
  let inVersion = false;
  let titles = 0;
  for (const line of scanLines(text)) {
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line.text);
    if (line.fenced || heading === null) {
      continue;
    }
    const [, marks, title] = heading;
    if (marks.length === 1) {
      titles += 1;
      if (inVersion || titles > 1) {
        findings.push({
          line: line.number,
          message: "Only one `#` title, above the first version, is allowed.",
        });
      }
    } else if (marks.length === 2) {
      inVersion = true;
      const section = sections.find(
        (candidate) => candidate.headingLine === line.number,
      );
      findings.push(...versionHeadingFindings(section, line.number, seen));
    } else if (marks.length === 3) {
      if (!inVersion || !SECTION_HEADINGS.includes(title)) {
        findings.push({
          line: line.number,
          message: `A \`###\` heading must be one of: ${SECTION_HEADINGS.join(", ")}.`,
        });
      }
    } else if (marks.length === 4) {
      if (!inVersion || !PACKAGE_HEADING.test(title)) {
        findings.push({
          line: line.number,
          message:
            "A `####` heading must name a package: core, map, react or theme.",
        });
      }
    } else {
      findings.push({
        line: line.number,
        message: "Headings go no deeper than `####`.",
      });
    }
  }
  return findings;
}

/**
 * Prose rules, applied to every line outside a fenced code block, and the
 * rules about emoji and attribution, applied everywhere.
 *
 * @param {string} text
 * @returns {Finding[]}
 */
function textFindings(text) {
  /** @type {Finding[]} */
  const findings = [];
  for (const line of scanLines(text)) {
    const prose = withoutCodeSpans(line.text);
    const problems = [];
    if (!line.fenced) {
      if (COMMIT_PREFIX.test(line.text)) {
        problems.push(
          "A line that starts like a commit subject (`feat:`, `fix:` and so on) reads as a commit log. Say what someone can now do.",
        );
      }
      if (HANDLE.test(prose)) {
        problems.push(
          "An `@handle` outside a code span notifies the person. Write the handle without the `@`, in a code span or plainly.",
        );
      }
      if (RAW_PULL_REQUEST.test(prose)) {
        problems.push(
          "A raw `(#123)` tail comes from a commit subject. Link the pull request instead.",
        );
      }
    }
    if (EMOJI.test(line.text)) {
      problems.push("Emoji are not used in the notes.");
    }
    if (ATTRIBUTION.test(line.text)) {
      problems.push("An attribution line does not belong in the notes.");
    }
    findings.push(
      ...problems.map((message) => ({ line: line.number, message })),
    );
  }
  return findings;
}

/**
 * Whether a line, with emphasis and a bullet marker removed, starts with the
 * word: a "Before" or "After" label.
 *
 * @param {string} text
 * @param {string} word
 * @returns {boolean}
 */
function isLabel(text, word) {
  const plain = text.replace(BULLET, "").replace(/[*_]/g, "").trim();
  return new RegExp(`^${word}\\b`, "i").test(plain);
}

/**
 * Whether an entry holds a "Before" label, a code block, an "After" label and
 * a code block, in that order.
 *
 * @param {import("./changelog.mjs").Line[]} entry
 * @returns {boolean}
 */
function showsBeforeAndAfter(entry) {
  let stage = 0;
  let previousFenced = false;
  for (const line of entry) {
    const opensBlock = line.fenced && !previousFenced;
    previousFenced = line.fenced;
    if (!line.fenced && stage === 0 && isLabel(line.text, "before")) {
      stage = 1;
    } else if (!line.fenced && stage === 2 && isLabel(line.text, "after")) {
      stage = 3;
    } else if (opensBlock && stage === 1) {
      stage = 2;
    } else if (opensBlock && stage === 3) {
      return true;
    }
  }
  return false;
}

/**
 * The lines under each "What to change when you upgrade" heading, with the
 * heading first.
 *
 * @param {string} text
 * @returns {import("./changelog.mjs").Line[][]}
 */
function upgradeGroups(text) {
  /** @type {import("./changelog.mjs").Line[][]} */
  const groups = [];
  let inside = false;
  for (const line of scanLines(text)) {
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line.text);
    if (!line.fenced && heading !== null) {
      inside = heading[1] === "###" && heading[2] === UPGRADE_HEADING;
      if (inside) {
        groups.push([line]);
      }
    } else if (inside) {
      groups.at(-1)?.push(line);
    }
  }
  return groups;
}

/**
 * Each entry under "What to change when you upgrade" needs a "Before" and an
 * "After" code block. An entry starts at a bullet or a bold lead at the left
 * margin and runs to the next one.
 *
 * @param {string} text
 * @returns {Finding[]}
 */
function upgradeFindings(text) {
  /** @type {Finding[]} */
  const findings = [];
  for (const [heading, ...body] of upgradeGroups(text)) {
    /** @type {import("./changelog.mjs").Line[][]} */
    const entries = [];
    for (const line of body) {
      if (!line.fenced && ENTRY_START.test(line.text)) {
        entries.push([line]);
      } else {
        entries.at(-1)?.push(line);
      }
    }
    if (entries.length === 0 && body.some((line) => line.text.trim() !== "")) {
      findings.push({
        line: heading.number,
        message:
          "Start each change with a bullet or a bold lead, so each can show its before and after.",
      });
    }
    for (const entry of entries) {
      if (!showsBeforeAndAfter(entry)) {
        findings.push({
          line: entry[0].number,
          message:
            "A change to make on upgrade needs a Before and an After code block.",
        });
      }
    }
  }
  return findings;
}

/**
 * Bullets that repeat the subject of a commit, with or without its type and
 * pull request number.
 *
 * @param {string} text
 * @param {(version: string) => string[] | null} subjectsFor
 * @returns {Finding[]}
 */
function repeatedSubjectFindings(text, subjectsFor) {
  /** @type {Finding[]} */
  const findings = [];
  for (const section of parseChangelog(text).sections) {
    const subjects =
      section.version === null ? null : subjectsFor(section.version);
    if (subjects === null) {
      continue;
    }
    const known = new Set(
      subjects.flatMap((subject) => [
        plainWords(subject),
        plainWords(parseCommit(subject, "").description),
      ]),
    );
    known.delete("");
    for (const line of section.lines) {
      if (
        !line.fenced &&
        BULLET.test(line.text) &&
        known.has(plainWords(line.text))
      ) {
        findings.push({
          line: line.number,
          message:
            "This bullet repeats a commit subject word for word. Write what it means for someone using the SDK.",
        });
      }
    }
  }
  return findings;
}

/**
 * Checks a changelog.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {(version: string) => string[] | null} [options.subjectsFor] The commit subjects between the tag before a version and that version; leave out to skip the history rule.
 * @param {import("../names-check.mjs").ForbiddenName[]} [options.forbidden] The forbidden names; the project list by default.
 * @returns {Finding[]} Sorted by line.
 */
export function checkChangelog(
  text,
  { subjectsFor, forbidden = FORBIDDEN } = {},
) {
  const findings = [
    ...headingFindings(text),
    ...textFindings(text),
    ...upgradeFindings(text),
    ...findForbidden(text, forbidden).map((line) => ({
      line,
      message: "A forbidden name (see the names check).",
    })),
    ...(subjectsFor === undefined
      ? []
      : repeatedSubjectFindings(text, subjectsFor)),
  ];
  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Whether the clone holds only part of the history.
 *
 * @param {string} root
 * @returns {boolean | null} Null when git cannot say.
 */
export function isShallowClone(root) {
  const result = git(["rev-parse", "--is-shallow-repository"], root);
  return result.ok ? result.stdout.trim() === "true" : null;
}

/**
 * The commit subjects between the tag before a version and the version's own
 * tag, or the head when it has none yet.
 *
 * @param {string} root
 * @returns {(version: string) => string[] | null}
 */
export function subjectsSincePreviousTag(root) {
  const tags = releaseTags(
    git(["tag", "--list", "v*"], root).stdout.split(/\r?\n/).filter(Boolean),
  );
  return (version) => {
    const parsed = parseVersion(version);
    if (parsed === null) {
      return null;
    }
    const before = previousTag(tags, parsed);
    const end = tags.some((entry) => entry.tag === `v${version}`)
      ? `v${version}`
      : "HEAD";
    const result = git(
      [
        "log",
        "--first-parent",
        "--format=%s",
        before === null ? end : `${before.tag}..${end}`,
      ],
      root,
    );
    return result.ok ? result.stdout.split(/\r?\n/).filter(Boolean) : null;
  };
}

/**
 * Runs the check on a changelog file and prints the result.
 *
 * @param {string} file
 * @param {string} root The repository folder, for the history rule.
 * @returns {number} The exit code: 0 clean, 1 findings, 2 cannot run.
 */
export function runCheck(file, root) {
  if (!existsSync(file)) {
    console.error(`release notes check: ${file} does not exist.`);
    return 2;
  }
  const text = readFileSync(file, "utf8");
  const hasVersions = parseChangelog(text).sections.length > 0;
  const useHistory = hasVersions && isShallowClone(root) === false;
  if (hasVersions && !useHistory) {
    console.log(
      "release notes check: the rule about repeated commit subjects is skipped, because the history is not complete here (a shallow clone, or no git).",
    );
  }
  const findings = checkChangelog(text, {
    subjectsFor: useHistory ? subjectsSincePreviousTag(root) : undefined,
  });
  for (const finding of findings) {
    console.error(
      `${path.relative(root, file)}:${finding.line}: ${finding.message}`,
    );
  }
  return findings.length === 0 ? 0 : 1;
}

if (isEntryPoint(import.meta.url)) {
  const file = process.argv[2] ?? path.join(ROOT, "CHANGELOG.md");
  process.exit(runCheck(path.resolve(file), ROOT));
}
