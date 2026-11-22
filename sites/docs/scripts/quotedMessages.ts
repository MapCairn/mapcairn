// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A heading that is one code span: the convention for a quoted message. */
const HEADING_MESSAGE = /^#{2,6} `([^`]+)`\s*$/;
/** A line that starts "Also" and names more messages, each a code span. */
const ALSO_LINE = /^Also (.*)$/;
const CODE_SPAN = /`([^`]+)`/g;
/** The parts of a message that depend on the app: `...` and `<name>`. */
const VARIABLE_PART = /\.\.\.|<[^>\s]+>/;
/** A fragment shorter than this does not identify a message. */
const MIN_FRAGMENT_LENGTH = 8;

/**
 * The messages a page quotes. The convention: a heading that is a single code
 * span is a message, and so is each code span on a line that begins "Also".
 * Any other code span is ordinary prose.
 * @param markdown - The page's Markdown.
 */
export function quotedMessages(markdown: string): string[] {
  const messages: string[] = [];
  for (const line of markdown.split("\n")) {
    const heading = HEADING_MESSAGE.exec(line);
    if (heading?.[1]) {
      messages.push(heading[1]);
      continue;
    }
    const also = ALSO_LINE.exec(line);
    if (also?.[1]) {
      for (const span of also[1].matchAll(CODE_SPAN)) {
        if (span[1]) {
          messages.push(span[1]);
        }
      }
    }
  }
  return messages;
}

/**
 * The fixed parts of a quoted message: the text between its `...` and
 * `<name>` placeholders, leaving out any part too short to identify it.
 * @param message - A message from {@link quotedMessages}.
 */
export function messageFragments(message: string): string[] {
  return message
    .split(new RegExp(VARIABLE_PART, "g"))
    .filter((part) => part.length >= MIN_FRAGMENT_LENGTH);
}

/**
 * The messages with a fixed part that is not in the source text.
 * @param messages - Quoted messages.
 * @param source - The text of the source files they should come from.
 */
export function missingMessages(
  messages: readonly string[],
  source: string,
): string[] {
  return messages.filter((message) =>
    messageFragments(message).some((fragment) => !source.includes(fragment)),
  );
}
