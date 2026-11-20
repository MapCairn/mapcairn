// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * What the release notes may contain, as rules over the prose of one line (its
 * code spans already taken out; see `scanLines`). The notes are published text
 * on GitHub Releases and npm package pages, so they hold only what the project
 * wrote: no raw HTML, no images and no link to another site. Each rule fails
 * closed, without parsing HTML or Markdown: a character that could start
 * markup is refused rather than interpreted.
 */

/** A link target that is a heading anchor in the same document. */
const ANCHOR = /^#[\w.%-]*$/;
/**
 * A relative path: no scheme (so no colon), no `//` or backslash that a
 * browser reads as another host, and no character that decodes into one.
 */
const RELATIVE_PATH = /^(?![\\/]{2})[^\s:&\\<>"'`]+$/;
/** A page in this repository on GitHub. */
const REPOSITORY_URL =
  /^https:\/\/github\.com\/MapCairn\/mapcairn(?:[/?#][^\s&\\<>"'`]*)?$/i;
/** The target of an inline link: the text after `](` up to a space or `)`. */
const INLINE_TARGET = /\]\(\s*([^\s)]*)/g;
/** A link reference definition: `[label]: target`. */
const DEFINITION = /^ {0,3}\[[^\]]*\]:\s*(\S*)/;
/** Punctuation that ends a sentence after an address, not part of it. */
const TRAILING_PUNCTUATION = /[)\].,;:!?'"*_~]+$/;
/** An address a renderer turns into a link without brackets. */
const BARE_ADDRESS = /(?:https?:\/\/|ftp:\/\/|www\.)\S*/gi;

/**
 * Whether the text holds a `<` that could open a tag, a closing tag, a comment
 * or a processing instruction: one followed by a letter, `/`, `!` or `?`.
 *
 * @param {string} text
 * @returns {boolean}
 */
function opensMarkup(text) {
  let index = text.indexOf("<");
  while (index !== -1) {
    if (/[A-Za-z/!?]/.test(text[index + 1] ?? "")) {
      return true;
    }
    index = text.indexOf("<", index + 1);
  }
  return false;
}

/**
 * Whether a link target stays inside the notes' own world: an anchor, a
 * relative path or a page of this repository.
 *
 * @param {string} target
 * @returns {boolean}
 */
function isAllowedTarget(target) {
  return (
    ANCHOR.test(target) ||
    RELATIVE_PATH.test(target) ||
    REPOSITORY_URL.test(target)
  );
}

/**
 * Every link target written in brackets on a line: inline links and reference
 * definitions.
 *
 * @param {string} prose
 * @returns {string[]}
 */
function linkTargets(prose) {
  const targets = [...prose.matchAll(INLINE_TARGET)].map((match) => match[1]);
  const definition = DEFINITION.exec(prose);
  if (definition !== null) {
    targets.push(definition[1]);
  }
  return targets;
}

/**
 * The addresses written out in the text, which a renderer turns into links
 * itself, without their trailing punctuation. Only a page of this repository
 * may stand there: a bare `www.example.test` is a link, not a relative path.
 *
 * @param {string} prose
 * @returns {string[]}
 */
function bareAddresses(prose) {
  return (prose.match(BARE_ADDRESS) ?? []).map((address) =>
    address.replace(TRAILING_PUNCTUATION, ""),
  );
}

/**
 * The problems with one line of prose, each a sentence for the person who
 * wrote the notes.
 *
 * @param {string} prose The line without its inline code spans.
 * @returns {string[]}
 */
export function contentProblems(prose) {
  const problems = [];
  if (opensMarkup(prose)) {
    problems.push(
      "Raw HTML is not allowed in the notes. A `<` that does not start a tag stays; put a tag, a type such as `Array<string>` or an address in a code span.",
    );
  }
  if (prose.includes("![")) {
    problems.push(
      "Images are not allowed in the notes. Describe what it shows in words.",
    );
  }
  if (
    !linkTargets(prose).every(isAllowedTarget) ||
    !bareAddresses(prose).every((address) => REPOSITORY_URL.test(address))
  ) {
    problems.push(
      "A link may go only to a relative path, an anchor or this repository on GitHub. Write another address in a code span, or leave it out.",
    );
  }
  return problems;
}
