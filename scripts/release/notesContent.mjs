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

/**
 * A relative path or an anchor (`#heading`): no scheme (so no colon), no
 * leading `//` or backslash that a browser reads as another host, no control or white
 * space character, and no character that decodes into one of these.
 */
const RELATIVE_PATH = /^(?!\/\/)[^\p{Cc}\p{Cf}\s:&\\<>"'`]+$/u;
/** The path of this repository on GitHub, compared in lower case. */
const REPOSITORY_PATH = "/mapcairn/mapcairn";
/** A path segment that is a dot segment, or looks like one to a server. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}(?:;.*|%3b.*)?$/i;
/** An encoded slash or backslash, which a server may read as a separator. */
const ENCODED_SEPARATOR = /%2f|%5c/i;
/** The target of an inline link: the text after `](` up to a space, a bracket or `)`. A `[` ends it, so a link opened inside another link's target (`[a]([b](//evil.test)`) is read as an empty target and refused. */
const INLINE_TARGET = /\]\(\s*([^\s)[\]]*)/g;
/** What follows `]:`, the start of a link reference definition wherever it stands. */
const DEFINITION_TARGET = /\]:[ \t]*(\S*)/g;
/** An email address, which a renderer turns into a `mailto:` link. */
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
/** Punctuation that ends a sentence after an address, not part of it. */
const TRAILING_PUNCTUATION = new Set(")].,;:!?'\"*_~");
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
 * Whether an address is a page of this repository on GitHub. It is parsed as a
 * browser parses it, so dot segments are resolved, and then compared by path:
 * an address that reaches the repository only through a dot segment, an
 * encoded separator, a login or a port is refused.
 *
 * @param {string} address
 * @returns {boolean}
 */
function isRepositoryUrl(address) {
  if (/[\p{Cc}\p{Cf}\s\\]/u.test(address)) {
    return false;
  }
  let url;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  const path = url.pathname.toLowerCase();
  const rawSegments = address
    .replace(/^[a-z]+:\/\/[^/?#]*/i, "")
    .split(/[?#]/)[0]
    .split("/");
  return (
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    !ENCODED_SEPARATOR.test(address) &&
    !rawSegments.some((segment) => DOT_SEGMENT.test(segment)) &&
    (path === REPOSITORY_PATH || path.startsWith(`${REPOSITORY_PATH}/`))
  );
}

/**
 * Whether a link target stays inside the notes' own world: an anchor, a
 * relative path or a page of this repository.
 *
 * @param {string} target
 * @returns {boolean}
 */
function isAllowedTarget(target) {
  return RELATIVE_PATH.test(target) || isRepositoryUrl(target);
}

/**
 * Every link target written in brackets on a line: inline links and reference
 * definitions, which are found by the `]:` that ends their label, wherever the
 * line stands (after a quote or list marker too).
 *
 * @param {string} prose
 * @returns {string[]}
 */
function linkTargets(prose) {
  const targets = [...prose.matchAll(INLINE_TARGET)].map((match) => match[1]);
  targets.push(
    ...[...prose.matchAll(DEFINITION_TARGET)].map((match) => match[1]),
  );
  return targets;
}

/**
 * The address without the sentence punctuation after it, cut at the last
 * character that is not punctuation (a loop, not a pattern anchored at the
 * end, which would take quadratic time on a long run of punctuation).
 *
 * @param {string} address
 * @returns {string}
 */
function withoutTrailingPunctuation(address) {
  let end = address.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(address[end - 1])) {
    end -= 1;
  }
  return address.slice(0, end);
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
    withoutTrailingPunctuation(address),
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
    !bareAddresses(prose).every(isRepositoryUrl)
  ) {
    problems.push(
      "A link may go only to a relative path, an anchor or this repository on GitHub. Write another address in a code span, or leave it out.",
    );
  }
  if (EMAIL.test(prose)) {
    problems.push(
      "An email address becomes a `mailto:` link in the notes. Write it in a code span, or leave it out.",
    );
  }
  return problems;
}
