// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A version heading: `## 0.1.0 (2026-12-01)`. */
const VERSION_HEADING =
  /^## (\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?) \((\d{4}-\d{2}-\d{2})\)\s*$/;
/** A line that opens or closes a fenced code block. */
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
/** An ATX heading, with up to three spaces of indent as CommonMark allows. */
const ATX_HEADING = /^( {0,3})(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
/** The `===` or `---` line under a setext heading. */
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
/** A line that cannot be the text of a setext heading. */
const NOT_PARAGRAPH =
  /^(?: {4}|\t| {0,3}(?:[-*+]\s|\d+[.)]\s|>|([-*_])(?:[ \t]*\1){2,}[ \t]*$))/;

/**
 * @typedef {object} Heading
 * @property {number} level 1 to 6.
 * @property {string} title The heading text, without its marks.
 * @property {"atx" | "indented" | "setext"} form How it is written. Only
 *   `atx` (`##` at the left margin) is allowed in the notes.
 */

/**
 * @typedef {object} Line
 * @property {string} text
 * @property {number} number The 1-based line number in the file.
 * @property {boolean} fenced Whether the line is a fence or inside a fenced code block.
 * @property {Heading | null} heading The heading the line is, if it is one outside a code block. A setext heading is the text line, not its underline.
 * @property {string} prose The line with its inline code spans taken out, for rules about what the text says. Where a backtick cannot be paired within its line, every span in the paragraph is left in, so a tag after a lone backtick is still seen. Empty inside a code block.
 * @property {number | null} fenceIndent The spaces before the fence, on the line that opens a fenced code block, otherwise null.
 * @property {boolean} unclosed Whether the line opens a fenced code block that is never closed.
 */

/**
 * The index of the next run of exactly `length` backticks from `from`, or -1.
 *
 * @param {string} text
 * @param {number} from
 * @param {number} length
 * @returns {number}
 */
function findBacktickRun(text, from, length) {
  let index = from;
  while (index < text.length) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let end = index;
    while (text[end] === "`") {
      end += 1;
    }
    if (end - index === length) {
      return index;
    }
    index = end;
  }
  return -1;
}

/**
 * Takes the inline code spans out of one line, as CommonMark pairs them: a
 * backslash escapes the character after it, and a run of backticks is closed
 * by the next run of the same length.
 *
 * @param {string} text
 * @returns {{ prose: string, paired: boolean }} `paired` is false when a run of backticks has no partner on the line.
 */
function withoutCodeSpans(text) {
  let prose = "";
  let paired = true;
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\") {
      prose += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (text[index] !== "`") {
      prose += text[index];
      index += 1;
      continue;
    }
    let end = index;
    while (text[end] === "`") {
      end += 1;
    }
    const close = findBacktickRun(text, end, end - index);
    if (close === -1) {
      paired = false;
      prose += text.slice(index, end);
      index = end;
    } else {
      prose += " ";
      index = close + (end - index);
    }
  }
  return { prose, paired };
}

/**
 * Sets `prose` on every line outside a code block. A paragraph is trusted to
 * have its spans taken out only when every line of it pairs its own backticks:
 * an unpaired one could close a span that begins on another line.
 *
 * @param {Line[]} lines
 */
function setProse(lines) {
  let block = [];
  const finish = () => {
    const stripped = block.map((line) => withoutCodeSpans(line.text));
    const trusted = stripped.every((entry) => entry.paired);
    block.forEach((line, index) => {
      line.prose = trusted ? stripped[index].prose : line.text;
    });
    block = [];
  };
  for (const line of lines) {
    if (line.fenced || line.text.trim() === "") {
      finish();
    } else {
      block.push(line);
    }
  }
  finish();
}

/**
 * Finds the headings: ATX headings with up to three spaces of indent, and
 * setext headings, a line of text underlined with `=` or `-`.
 *
 * @param {Line[]} lines
 */
function setHeadings(lines) {
  const underlines = new Set();
  lines.forEach((line, index) => {
    if (line.fenced) {
      return;
    }
    const atx = ATX_HEADING.exec(line.text);
    if (atx !== null) {
      line.heading = {
        level: atx[2].length,
        title: (atx[3] ?? "").replace(/(?:^|[ \t]+)#+$/, "").trim(),
        form: atx[1] === "" ? "atx" : "indented",
      };
      return;
    }
    const above = lines[index - 1];
    const underline = SETEXT_UNDERLINE.exec(line.text);
    if (
      underline === null ||
      above === undefined ||
      above.fenced ||
      above.heading !== null ||
      underlines.has(above) ||
      above.text.trim() === "" ||
      NOT_PARAGRAPH.test(above.text)
    ) {
      return;
    }
    underlines.add(line);
    above.heading = {
      level: underline[1][0] === "=" ? 1 : 2,
      title: above.text.trim(),
      form: "setext",
    };
  });
}

/**
 * Splits a text into lines at `\n` or `\r\n`, the only line endings the notes
 * check accepts: a lone `\r` ends a line for a renderer, so the check refuses it
 * (see `controlCharacterFindings` in `notesCheck.mjs`) and every reader of the
 * changelog splits the same way.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * Splits a text into lines and marks the ones inside a fenced code block, so
 * a heading-like or handle-like line in a code sample is not read as prose.
 * A backtick fence whose info string holds a backtick is not a fence.
 *
 * @param {string} text
 * @returns {Line[]}
 */
export function scanLines(text) {
  /** @type {Line[]} */
  const lines = [];
  /** @type {{ character: string, length: number, line: Line } | null} */
  let open = null;
  splitLines(text).forEach((raw, index) => {
    const fence = FENCE.exec(raw);
    /** @type {Line} */
    const line = {
      text: raw,
      number: index + 1,
      fenced: true,
      heading: null,
      prose: "",
      fenceIndent: null,
      unclosed: false,
    };
    lines.push(line);
    if (open === null) {
      if (fence !== null && !(fence[2][0] === "`" && fence[3].includes("`"))) {
        open = { character: fence[2][0], length: fence[2].length, line };
        line.fenceIndent = fence[1].length;
        line.unclosed = true;
      } else {
        line.fenced = false;
        line.prose = raw;
      }
      return;
    }
    if (
      fence !== null &&
      fence[2][0] === open.character &&
      fence[2].length >= open.length &&
      raw.trim() === fence[2]
    ) {
      open.line.unclosed = false;
      open = null;
    }
  });
  setHeadings(lines);
  setProse(lines);
  return lines;
}

/**
 * @typedef {object} Section
 * @property {string} heading The heading line as written.
 * @property {number} headingLine
 * @property {string | null} version Null when the heading is not a valid version heading, which includes one that is indented or underlined.
 * @property {string | null} date
 * @property {Line[]} lines The lines under the heading.
 */

/**
 * The title and introduction above the first version, and the version sections.
 * A level-2 heading starts a section however it is written, so an indented or
 * underlined one cannot hide its notes inside the section above.
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
    if (!line.fenced && line.heading?.level === 2) {
      const match =
        line.heading.form === "atx" ? VERSION_HEADING.exec(line.text) : null;
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
  const lines = splitLines(changelog);
  const before = lines.slice(0, first.headingLine - 1).join("\n");
  const after = lines.slice(first.headingLine - 1).join("\n");
  return `${before.replace(/\s*$/, "")}\n\n${section}\n${after}`;
}
