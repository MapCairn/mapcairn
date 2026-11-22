// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** One searchable section of a page: its introduction or one heading's body. */
export interface SearchRecord {
  /** Unique across the index; the section's address. */
  readonly id: string;
  /** Where the section is, with its anchor, from the site root. */
  readonly url: string;
  /** The title of the page the section is on. */
  readonly page: string;
  /** The section's heading, empty for a page's introduction. */
  readonly heading: string;
  /** The section's text with tags and entities removed. */
  readonly text: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

/** The zero-width space the framework puts inside each heading's link. */
const ZERO_WIDTH_SPACE = /\u200b/g;

/** A comment, a tag (closing slash and name captured), a run of text, or a stray `<`. */
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9-]*)[^>]*>|[^<]+|</gi;

/** Elements whose content is not page text. */
const SKIPPED_ELEMENTS = new Set(["script", "style", "nav", "button", "svg"]);

/** Elements that sit inside a word, so removing them must not split it. */
const INLINE_ELEMENTS = new Set([
  "span",
  "code",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "mark",
  "kbd",
  "sub",
  "sup",
]);

/**
 * The text of some markup, found by reading it as tokens rather than by
 * rewriting it: the content of skipped elements is dropped, an inline tag
 * leaves its words joined, any other tag becomes a space, and a stray `<` is
 * dropped, so no part of a tag can be left in the text.
 */
function stripTags(markup: string): string {
  let text = "";
  let skipping = "";
  let depth = 0;
  for (const [token, closing, name] of markup.matchAll(TOKEN)) {
    if (name === undefined) {
      if (skipping === "" && token !== "<" && !token.startsWith("<!--")) {
        text += token;
      }
      continue;
    }
    const tag = name.toLowerCase();
    if (skipping !== "") {
      if (tag === skipping) {
        depth += closing ? -1 : 1;
        skipping = depth === 0 ? "" : skipping;
      }
    } else if (!closing && SKIPPED_ELEMENTS.has(tag)) {
      skipping = tag;
      depth = 1;
    } else if (!INLINE_ELEMENTS.has(tag)) {
      text += " ";
    }
  }
  return text;
}

/** Plain text of a piece of markup: tags removed, entities decoded, spaces collapsed. */
export function plainText(markup: string): string {
  return stripTags(markup)
    .replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, (entity) => {
      return ENTITIES[entity.toLowerCase()] ?? decodeNumeric(entity);
    })
    .replace(ZERO_WIDTH_SPACE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A numeric character reference as its character, or the reference itself. */
function decodeNumeric(entity: string): string {
  const match = /^&#(x?)([0-9a-f]+);$/i.exec(entity);
  if (!match) {
    return entity;
  }
  const code = Number.parseInt(match[2] ?? "", match[1] ? 16 : 10);
  return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
}

/** The URL a built file is served at, under the base path. */
export function pagePathToUrl(file: string, baseUrl: string): string {
  if (file === "index.html") {
    return baseUrl;
  }
  if (file.endsWith("/index.html")) {
    return `${baseUrl}${file.slice(0, -"index.html".length)}`;
  }
  return `${baseUrl}${file}`;
}

const HEADING = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;

/**
 * The searchable sections of one built page: the text of its `<article>`
 * split at each heading from `h1` to `h3`. The title comes from the `h1`.
 * A page with no article (the sidebar, a redirect) has none.
 * @param html - One built page.
 * @param pageUrl - The page's URL, which a section's anchor is added to.
 */
export function extractRecords(html: string, pageUrl: string): SearchRecord[] {
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  if (article === undefined) {
    return [];
  }
  const headings = [...article.matchAll(HEADING)];
  const title = plainText(
    headings.find((match) => match[1] === "1")?.[3] ?? "",
  );
  const records: SearchRecord[] = [];
  const add = (heading: string, anchor: string, body: string): void => {
    const text = plainText(body);
    if (text === "" && heading === "") {
      return;
    }
    const url = anchor === "" ? pageUrl : `${pageUrl}#${anchor}`;
    const taken = records.filter((record) => record.url === url).length;
    const id = taken === 0 ? url : `${url}~${taken}`;
    records.push({ id, url, page: title, heading, text });
  };

  let cursor = 0;
  let current = { heading: "", anchor: "" };
  for (const match of headings) {
    const start = match.index ?? 0;
    add(current.heading, current.anchor, article.slice(cursor, start));
    cursor = start + match[0].length;
    current =
      match[1] === "1"
        ? { heading: "", anchor: "" }
        : {
            heading: plainText(match[3] ?? ""),
            anchor: /\sid="([^"]*)"/.exec(match[2] ?? "")?.[1] ?? "",
          };
  }
  add(current.heading, current.anchor, article.slice(cursor));
  return records;
}
