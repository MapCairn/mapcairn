// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { RequestParameters } from "maplibre-gl";

/** Matches one `{placeholder}` of a tile URL template, such as `{z}` or `{bbox-epsg-3857}`. */
const PLACEHOLDER = /\{[^}]*\}/g;

/** Escapes the characters of a URL that a regular expression would read as a pattern. */
function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A pattern that matches every URL the engine makes from `template`. */
function patternOf(template: string): RegExp {
  const parts = template.split(PLACEHOLDER).map(escapePattern);
  return new RegExp(`^${parts.join(".*")}$`);
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
  private readonly patterns = new Map<string, RegExp>();

  /** A data layer source is drawn from `template`; its tiles are requested without a referrer. */
  register(source: string, template: string): void {
    this.patterns.set(source, patternOf(template));
  }

  /** A data layer source was erased, or is about to be drawn again. */
  release(source: string): void {
    this.patterns.delete(source);
  }

  /**
   * MapLibre's `transformRequest`: adds `referrerPolicy: "no-referrer"` to a
   * request for a data layer's tile and returns every other request unchanged.
   */
  transform = (url: string): RequestParameters => {
    for (const pattern of this.patterns.values()) {
      if (pattern.test(url)) {
        return { url, referrerPolicy: "no-referrer" };
      }
    }
    return { url };
  };
}
