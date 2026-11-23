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
