// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A version heading: `## 0.1.0 (2026-12-01)`. */
const VERSION_HEADING =
  /^## (\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?) \((\d{4}-\d{2}-\d{2})\)\s*$/;
/** A line that opens or closes a fenced code block. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * @typedef {object} Line
 * @property {string} text
 * @property {number} number The 1-based line number in the file.
 * @property {boolean} fenced Whether the line is a fence or inside a fenced code block.
 */

/**
 * Splits a text into lines and marks the ones inside a fenced code block, so
 * a heading-like or handle-like line in a code sample is not read as prose.
 *
 * @param {string} text
 * @returns {Line[]}
 */
export function scanLines(text) {
  /** @type {Line[]} */
  const lines = [];
  /** @type {{ character: string, length: number } | null} */
  let open = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const fence = FENCE.exec(raw);
    if (open === null) {
      if (fence !== null) {
        open = { character: fence[1][0], length: fence[1].length };
      }
      lines.push({ text: raw, number: index + 1, fenced: open !== null });
      return;
    }
    lines.push({ text: raw, number: index + 1, fenced: true });
    if (
      fence !== null &&
      fence[1][0] === open.character &&
      fence[1].length >= open.length &&
      raw.trim() === fence[1]
    ) {
      open = null;
    }
  });
  return lines;
}

/**
 * @typedef {object} Section
 * @property {string} heading The heading line as written.
 * @property {number} headingLine
 * @property {string | null} version Null when the heading is not a valid version heading.
 * @property {string | null} date
 * @property {Line[]} lines The lines under the heading.
 */

/**
 * The title and introduction above the first version, and the version sections.
 *
 * @param {string} text
 * @returns {{ preamble: Line[], sections: Section[] }}
 */
export function parseChangelog(text) {
  /** @type {Line[]} */
  const preamble = [];
  /** @type {Section[]} */
  const sections = [];
  for (const line of scanLines(text)) {
    if (!line.fenced && /^## /.test(line.text)) {
      const match = VERSION_HEADING.exec(line.text);
      sections.push({
        heading: line.text,
        headingLine: line.number,
        version: match?.[1] ?? null,
        date: match?.[2] ?? null,
        lines: [],
      });
    } else {
      (sections.at(-1)?.lines ?? preamble).push(line);
    }
  }
  return { preamble, sections };
}

/**
 * The text of a section without its heading, trimmed.
 *
 * @param {Section} section
 * @returns {string}
 */
export function sectionText(section) {
  return section.lines
    .map((line) => line.text)
    .join("\n")
    .trim();
}

/**
 * The notes of one version: the section under its heading, without the
 * heading, which is the body of the GitHub Release.
 *
 * @param {string} changelog
 * @param {string} version With or without a leading `v`.
 * @returns {string | null} Null when the changelog has no section for it.
 */
export function extractNotes(changelog, version) {
  const wanted = version.replace(/^v/, "");
  const section = parseChangelog(changelog).sections.find(
    (candidate) => candidate.version === wanted,
  );
  return section === undefined ? null : sectionText(section);
}

/**
 * Puts the notes of a new version at the top of the changelog, under its
 * heading and above every earlier version.
 *
 * @param {string} changelog
 * @param {string} version
 * @param {string} date `YYYY-MM-DD`.
 * @param {string} notes The notes, without a version heading.
 * @returns {string}
 */
export function insertSection(changelog, version, date, notes) {
  const section = `## ${version} (${date})\n\n${notes.trim()}\n`;
  const { sections } = parseChangelog(changelog);
  const first = sections[0];
  if (first === undefined) {
    return `${changelog.replace(/\s*$/, "")}\n\n${section}`;
  }
  const lines = changelog.split(/\r?\n/);
  const before = lines.slice(0, first.headingLine - 1).join("\n");
  const after = lines.slice(first.headingLine - 1).join("\n");
  return `${before.replace(/\s*$/, "")}\n\n${section}\n${after}`;
}
