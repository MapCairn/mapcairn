// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { RequestParameters } from "maplibre-gl";

/** One or more adjacent `{placeholder}`s of a tile URL template, such as `{z}` or `{bbox-epsg-3857}`. */
const PLACEHOLDERS = /(?:\{[^}]*\})+/;

/** What a placeholder's value never holds: the characters that split a URL into path segments and query parameters. */
const SEPARATORS = /[/?&#]/;

/**
 * A tile URL template as the text between its placeholders. A URL matches when
 * it holds these in order, with only separator-free text in each gap.
 */
function literalsOf(template: string): string[] {
  return template.split(PLACEHOLDERS);
}

/**
 * Whether `url` is what the engine makes from a template with these literals.
 * It looks for each literal where it first occurs, which leaves the most room
 * for the rest, so it never backtracks and its work grows with the length of
 * the URL times the number of literals, however many placeholders repeat.
 */
function matches(literals: readonly string[], url: string): boolean {
  const [first = "", ...rest] = literals;
  if (rest.length === 0) {
    return url === first;
  }
  const last = rest.pop() as string;
  const end = url.length - last.length;
  if (!url.startsWith(first) || end < first.length || !url.endsWith(last)) {
    return false;
  }
  let position = first.length;
  for (const literal of rest) {
    const found = url.indexOf(literal, position);
    if (found < 0 || found + literal.length > end) {
      return false;
    }
    if (SEPARATORS.test(url.slice(position, found))) {
      return false;
    }
    position = found + literal.length;
  }
  return !SEPARATORS.test(url.slice(position, end));
}

/**
 * Keeps the tile requests of the data layers apart from the basemap's, so the
 * engine can send the layers' requests with no referrer. A layer provider does
 * not need to know which site a visitor is on, while a basemap provider's terms
 * may ask for it. The engine makes the tile requests itself, so this is its
 * request transform: it matches a request's URL against the template of each
 * data layer source that is drawn, and knows nothing of any provider.
 */
export class DataLayerTileRequests {
  private readonly templates = new Map<string, readonly string[]>();

  /** A data layer source is drawn from `template`; its tiles are requested without a referrer. */
  register(source: string, template: string): void {
    this.templates.set(source, literalsOf(template));
  }

  /** A data layer source was erased, or is about to be drawn again. */
  release(source: string): void {
    this.templates.delete(source);
  }

  /**
   * MapLibre's `transformRequest`: adds `referrerPolicy: "no-referrer"` to a
   * request for a data layer's tile and returns every other request unchanged.
   */
  transform = (url: string): RequestParameters => {
    for (const literals of this.templates.values()) {
      if (matches(literals, url)) {
        return { url, referrerPolicy: "no-referrer" };
      }
    }
    return { url };
  };
}
