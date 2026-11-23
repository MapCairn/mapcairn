// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The most bytes of Markdown one part of a repository document may hold,
 * counting the table header a continuation part repeats. A part is never cut
 * inside a code block or a table row, so one made of a single such block may
 * be larger. About ten thousand tokens: a page a phone reads without a long
 * scroll and a model reads whole.
 */
export const PART_CEILING = 40_000;

const FENCE = /^\s*(?:```|~~~)/;
const TITLE = /^# (.+?)\s*$/;
const SECTION = /^## (.+?)\s*$/;
const HEADING = /^(#{1,6}) /;
const HEADING_TEXT = /^(#{2,6}) (.+?)\s*$/;
const TABLE_LINE = /^\s*\|/;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_MARKS = /[`*]/g;
const NOT_IN_AN_ID = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

const textEncoder = new TextEncoder();

/** The size of a text in bytes, as a file or a download counts it. */
function byteLength(text: string): number {
  return textEncoder.encode(text).length;
}

/** A heading's text as a reader sees it: links, code and emphasis marks removed. */
export function plainHeading(markdown: string): string {
  return markdown
    .replace(MARKDOWN_LINK, "$1")
    .replace(MARKDOWN_MARKS, "")
    .trim();
}

/**
 * The id the framework gives a heading: its plain text in lower case, with
 * everything but letters, numbers, `_`, `-` and spaces removed and each space
 * made a hyphen.
 * @param text - The heading's text as written in Markdown.
 */
export function slugifyHeading(text: string): string {
  return plainHeading(text)
    .toLowerCase()
    .replace(NOT_IN_AN_ID, "")
    .replaceAll(" ", "-");
}

/** One heading of a part: its level, plain text and id. */
export interface PartHeading {
  readonly level: number;
  readonly text: string;
  readonly id: string;
}

/**
 * The headings of a text from level two down, not counting a heading inside a
 * code block.
 * @param markdown - Part of a document's Markdown.
 */
export function headingsOf(markdown: string): PartHeading[] {
  const headings: PartHeading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    const match = inFence ? null : HEADING_TEXT.exec(line);
    if (match) {
      headings.push({
        level: (match[1] ?? "").length,
        text: plainHeading(match[2] ?? ""),
        id: slugifyHeading(match[2] ?? ""),
      });
    }
  }
  return headings;
}

/** One part of a repository document: a section, or a run of a section that was too long. */
export interface DocPart {
  /** The part's file name without its extension, unique in its document. */
  readonly stem: string;
  /** The title the part's page shows, with its place when its section was split. */
  readonly title: string;
  /** The title of the section the part belongs to. */
  readonly sectionTitle: string;
  /** This part's place among the section's parts, from 1. */
  readonly part: number;
  /** How many parts the section has. */
  readonly parts: number;
  /** The source text of the part, verbatim, from its own heading line when it has one. */
  readonly markdown: string;
  /** The header a part that starts inside a table repeats, or an empty string. */
  readonly tableHeader: string;
  /** The size in bytes of the table header and the text. */
  readonly bytes: number;
}

/** A document cut into parts, with nothing lost and nothing repeated but table headers. */
export interface SplitDocument {
  /** The text of the document's first-level heading. */
  readonly title: string;
  /** The text between the title and the first section, verbatim. */
  readonly preamble: string;
  readonly parts: readonly DocPart[];
}

/** A block that is kept whole, or one row of a table, from which parts are packed. */
interface Unit {
  readonly lines: string[];
  /** Whether a part may not end here: a heading or a table's header. */
  keepWithNext: boolean;
  /** The header of the table a row belongs to, or an empty string. */
  readonly tableHeader: string;
}

function newUnit(
  lines: string[],
  tableHeader = "",
  keepWithNext = false,
): Unit {
  return { lines, keepWithNext, tableHeader };
}

/** The lines of a text, each with its line ending, so that joining them gives the text back. */
function linesOf(text: string): string[] {
  return text.split(/(?<=\n)/);
}

/**
 * Cuts the lines of a section into blocks that stay whole: a heading, a code
 * block, a paragraph or list, a table's header and each of its rows. A blank
 * line ends the block it follows.
 */
function unitsOf(lines: readonly string[]): Unit[] {
  const units: Unit[] = [];
  let prose: Unit | null = null;
  let fenced: Unit | null = null;
  let tableLines = 0;
  let tableHeader = "";
  const last = (): Unit => units[units.length - 1] ?? newUnit([]);
  for (const line of lines) {
    if (fenced) {
      fenced.lines.push(line);
      fenced = FENCE.test(line) ? null : fenced;
      continue;
    }
    if (FENCE.test(line)) {
      fenced = newUnit([line]);
      units.push(fenced);
      prose = null;
      tableLines = 0;
      continue;
    }
    if (line.trim() === "") {
      last().lines.push(line);
      prose = null;
      tableLines = 0;
      continue;
    }
    if (TABLE_LINE.test(line)) {
      tableLines += 1;
      prose = null;
      if (tableLines === 1) {
        units.push(newUnit([line], "", true));
        tableHeader = line;
      } else if (tableLines === 2) {
        last().lines.push(line);
        tableHeader += line;
      } else {
        units.push(newUnit([line], tableHeader));
      }
      continue;
    }
    tableLines = 0;
    if (HEADING.test(line)) {
      units.push(newUnit([line], "", true));
      prose = null;
    } else if (prose) {
      prose.lines.push(line);
    } else {
      prose = newUnit([line]);
      units.push(prose);
    }
  }
  return units;
}

interface Chunk {
  readonly text: string;
  readonly tableHeader: string;
}

/**
 * Packs the blocks of one section into runs of about the same size, each under
 * the ceiling where its blocks allow. A run that starts inside a table repeats
 * the table's header, and no run ends on a heading or a table's header.
 */
function chunksOf(units: readonly Unit[], ceiling: number): Chunk[] {
  const sizeOf = (unit: Unit): number => byteLength(unit.lines.join(""));
  const total = units.reduce((sum, unit) => sum + sizeOf(unit), 0);
  const target = total / Math.max(1, Math.ceil(total / ceiling));
  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let header = "";
  let size = 0;
  const close = (): void => {
    chunks.push({
      text: current.flatMap((unit) => unit.lines).join(""),
      tableHeader: header,
    });
    current = [];
    header = "";
    size = 0;
  };
  for (const unit of units) {
    const unitSize = sizeOf(unit);
    const previous = current[current.length - 1];
    if (
      previous &&
      !previous.keepWithNext &&
      (size >= target || size + unitSize > ceiling)
    ) {
      close();
    }
    if (current.length === 0 && unit.tableHeader !== "") {
      header = unit.tableHeader;
      size += byteLength(header);
    }
    current.push(unit);
    size += unitSize;
  }
  if (current.length > 0) {
    close();
  }
  return chunks;
}

/** The lines of a document from its title on: where its title and each section start, outside code blocks. */
function outline(lines: readonly string[]): {
  title: number;
  sections: number[];
} {
  let inFence = false;
  let title = -1;
  const sections: number[] = [];
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else if (inFence) {
      return;
    } else if (title < 0 && TITLE.test(line)) {
      title = index;
    } else if (title >= 0 && SECTION.test(line)) {
      sections.push(index);
    }
  });
  return { title, sections };
}

/**
 * Cuts a repository document into parts by heading. The rule: one part for
 * each second-level section, and the text between the title and the first
 * section (the preamble) kept apart. A section over `ceiling` is cut further,
 * between its blocks (a heading, a code block, a paragraph or list, a table
 * row), into runs of about equal size that are numbered; a run that starts
 * inside a table repeats the table's header. The same text always gives the
 * same parts, the parts hold the text verbatim, and the preamble and the
 * parts, joined, are the document after its title line.
 * @param text - The document's Markdown.
 * @param ceiling - The most bytes a part holds, {@link PART_CEILING} by default.
 * @throws When the document has no first-level heading.
 */
export function splitDocument(
  text: string,
  ceiling: number = PART_CEILING,
): SplitDocument {
  const lines = linesOf(text);
  const { title, sections } = outline(lines);
  const titleLine = lines[title] ?? "";
  if (title < 0) {
    throw new Error("The document has no title (a first-level heading).");
  }
  const used = new Set<string>();
  const stemFor = (wanted: string): string => {
    let stem = wanted;
    for (let number = 2; used.has(stem); number += 1) {
      stem = `${wanted}-${number}`;
    }
    used.add(stem);
    return stem;
  };
  const parts = sections.flatMap((start, index) => {
    const sectionLines = lines.slice(
      start,
      sections[index + 1] ?? lines.length,
    );
    const heading = SECTION.exec(sectionLines[0] ?? "")?.[1] ?? "";
    const sectionTitle = plainHeading(heading);
    const slug = slugifyHeading(heading);
    const chunks = chunksOf(unitsOf(sectionLines), ceiling);
    return chunks.map((chunk, run): DocPart => {
      const split = chunks.length > 1;
      return {
        stem: stemFor(split ? `${slug}-part-${run + 1}` : slug),
        title: split
          ? `${sectionTitle} (part ${run + 1} of ${chunks.length})`
          : sectionTitle,
        sectionTitle,
        part: run + 1,
        parts: chunks.length,
        markdown: chunk.text,
        tableHeader: chunk.tableHeader,
        bytes: byteLength(chunk.tableHeader + chunk.text),
      };
    });
  });
  return {
    title: plainHeading(TITLE.exec(titleLine)?.[1] ?? ""),
    preamble: lines.slice(title + 1, sections[0] ?? lines.length).join(""),
    parts,
  };
}
