// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import MiniSearch from "minisearch";
import type { SearchRecord } from "../../scripts/searchRecords";

/** How many results a search returns unless told otherwise. */
export const DEFAULT_RESULT_LIMIT = 8;

/** How much a match in a heading, and in a page title, counts beside one in body text. */
const HEADING_BOOST = 4;
const PAGE_BOOST = 3;

/** The longest excerpt shown under a result, in characters. */
const EXCERPT_WIDTH = 140;

/** How much of the excerpt comes before the first match, so the match has context. */
const EXCERPT_LEAD_SHARE = 0.25;

/** A camelCase boundary: a lower-case letter or digit then a capital, or the end of an acronym. */
const CAMEL_BOUNDARY =
  /(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u;

/** What a name or word is cut at: anything that is not a letter or a digit. */
const NON_WORD = /[^\p{L}\p{N}]+/u;

/**
 * Cuts text into lower-case search terms. A name such as `MapView` is kept
 * whole, so it ranks as an exact name, and also as `map` and `view`, so a
 * search for either word finds it. Punctuation, such as the `@` and `/` of
 * `@mapcairn/sdk`, only separates terms.
 * @param text - Text to cut, from a page or from the search box.
 */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  for (const chunk of text.split(NON_WORD)) {
    if (chunk === "") {
      continue;
    }
    terms.push(chunk.toLowerCase());
    const parts = chunk.split(CAMEL_BOUNDARY);
    if (parts.length > 1) {
      terms.push(...parts.map((part) => part.toLowerCase()));
    }
  }
  return terms;
}

/** One search result: a section of a page. */
export interface SearchResult extends SearchRecord {
  /** The terms of the query, for marking them in the excerpt. */
  readonly terms: readonly string[];
}

/** A search over the built site's sections. */
export type Search = (query: string, limit?: number) => SearchResult[];

/** The label that names a section: its heading, or the page title for an introduction. */
function label(record: SearchRecord): string {
  return record.heading === "" ? record.page : record.heading;
}

/**
 * Builds a search over the sections. Every term of the query must match,
 * the last one as a prefix so results follow the typing; when no section has
 * every term, sections with any of them are returned. A section whose heading
 * (or, for an introduction, whose page title) is exactly the query comes
 * before the rest, so searching for an export's name lands on its page.
 * @param records - Every section of the site, from the build's index.
 */
export function createSearch(records: readonly SearchRecord[]): Search {
  const index = new MiniSearch<SearchRecord>({
    fields: ["heading", "page", "text"],
    storeFields: ["url", "page", "heading", "text"],
    tokenize,
    searchOptions: {
      boost: { heading: HEADING_BOOST, page: PAGE_BOOST },
      prefix: (_term, position, terms) => position === terms.length - 1,
    },
  });
  index.addAll([...records]);

  return (query, limit = DEFAULT_RESULT_LIMIT) => {
    const wanted = query.trim().toLowerCase();
    if (wanted === "") {
      return [];
    }
    let hits = index.search(query, { combineWith: "AND" });
    if (hits.length === 0) {
      hits = index.search(query, { combineWith: "OR" });
    }
    const terms = tokenize(query);
    return hits
      .map((hit) => ({
        score: hit.score,
        exact: label(hit as unknown as SearchRecord).toLowerCase() === wanted,
        result: {
          id: hit.id as string,
          url: hit.url as string,
          page: hit.page as string,
          heading: hit.heading as string,
          text: hit.text as string,
          terms,
        } satisfies SearchResult,
      }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
      .slice(0, limit)
      .map(({ result }) => result);
  };
}

/** A run of an excerpt: text, and whether it is a word that matched. */
export interface ExcerptSegment {
  readonly text: string;
  readonly match: boolean;
}

function escapeForPattern(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A short excerpt of a section's text around its first match, as runs that
 * say which are matches, so the page can mark them without writing markup.
 * A match is extended to the end of its word, so a prefix marks the whole word.
 * @param text - The section's text.
 * @param terms - The query's terms, lower case.
 * @param width - The most characters of text to show.
 */
export function excerptSegments(
  text: string,
  terms: readonly string[],
  width = EXCERPT_WIDTH,
): ExcerptSegment[] {
  const usable = terms.filter((term) => term !== "");
  const pattern =
    usable.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{L}\\p{N}])(?:${usable.map(escapeForPattern).join("|")})[\\p{L}\\p{N}]*`,
          "giu",
        );
  const first = pattern ? text.search(pattern) : -1;
  let start =
    first <= 0
      ? 0
      : Math.max(0, first - Math.floor(width * EXCERPT_LEAD_SHARE));
  if (start > 0 && text[start - 1] !== " ") {
    const space = text.indexOf(" ", start);
    start = space === -1 ? start : space + 1;
  }
  const end = Math.min(text.length, start + width);
  const window = text.slice(start, end).trimEnd();
  const segments: ExcerptSegment[] = [];
  if (start > 0) {
    segments.push({ text: "…", match: false });
  }
  let cursor = 0;
  if (pattern) {
    for (const found of window.matchAll(pattern)) {
      const at = found.index ?? 0;
      if (at > cursor) {
        segments.push({ text: window.slice(cursor, at), match: false });
      }
      segments.push({ text: found[0], match: true });
      cursor = at + found[0].length;
    }
  }
  if (cursor < window.length) {
    segments.push({ text: window.slice(cursor), match: false });
  }
  if (end < text.length) {
    segments.push({ text: "…", match: false });
  }
  return segments;
}
