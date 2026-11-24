// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

const FENCE = /^\s*(?:```|~~~)/;
const BLOCK_START = /^(?:#|[-*|] |\d+\. )/;
const FIRST_SENTENCE = /^([\s\S]*?[.!?])(?=\s+[A-Z]|$)/;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_MARKS = /[`*_]/g;

/** The first paragraph of prose in a body: not a heading, a list, a code block or a table. */
function firstParagraph(body: string): string {
  let inFence = false;
  const paragraph: string[] = [];
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else if (!inFence && (line.trim() === "" || BLOCK_START.test(line))) {
      if (paragraph.length > 0) {
        break;
      }
    } else if (!inFence) {
      paragraph.push(line.trim());
    }
  }
  return paragraph.join(" ");
}

/** The longest lead a line of an overview holds: more than this wraps to several lines on a phone. */
export const LEAD_MAX_LENGTH = 120;

const HEADING_LINE = /^#{1,6} /;
const CODE_SPAN_START = /^`/;
const NOT_PROSE = /^(?:\s|```|~~~|>|<)/;

/** The paragraph that is the first block after the body's heading, or an empty string when that block is anything else. */
function openingParagraph(body: string): string {
  const lines = withoutLeadingBlanks(body.split("\n"));
  const afterHeading = HEADING_LINE.test(lines[0] ?? "")
    ? withoutLeadingBlanks(lines.slice(1))
    : lines;
  const [opening = ""] = afterHeading;
  if (opening === "" || BLOCK_START.test(opening) || NOT_PROSE.test(opening)) {
    return "";
  }
  return firstParagraph(afterHeading.join("\n"));
}

function withoutLeadingBlanks(lines: readonly string[]): readonly string[] {
  const first = lines.findIndex((line) => line.trim() !== "");
  return first < 0 ? [] : lines.slice(first);
}

/**
 * A short plain description of a part of a document: the first sentence of the
 * prose that follows its heading, as plain text. It is empty when that first
 * block is a list, a table, a code block or a quote, so a raw table or a line
 * of code can never stand in for a description, and when the sentence starts
 * with code, only introduces what follows (ends in a colon) or is longer than
 * {@link LEAD_MAX_LENGTH}.
 * @param body - Markdown, starting at the part's heading when it has one.
 */
export function leadOf(body: string): string {
  const paragraph = openingParagraph(body);
  if (CODE_SPAN_START.test(paragraph)) {
    return "";
  }
  const sentence = firstSentenceOf(paragraph);
  const usable = sentence.length <= LEAD_MAX_LENGTH && !sentence.endsWith(":");
  return usable ? sentence : "";
}

/**
 * The first sentence of the first paragraph of prose in a Markdown body, as
 * plain text: links are replaced by their text and code and emphasis marks
 * removed. A paragraph with no full stop gives the whole paragraph, and a body
 * with no paragraph gives an empty string.
 * @param body - Markdown.
 */
export function firstSentenceOf(body: string): string {
  const plain = firstParagraph(body)
    .replace(MARKDOWN_LINK, "$1")
    .replace(MARKDOWN_MARKS, "");
  return FIRST_SENTENCE.exec(plain)?.[1] ?? plain;
}
