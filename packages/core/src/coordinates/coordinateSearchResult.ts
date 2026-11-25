// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  coordinateWordsFor,
  formatFixed,
  formatLatitude,
  formatLongitude,
  hemispheresFor,
} from "../format";
import type { LatLng } from "../ports/geometry";
import type { MessageCatalogue } from "../ports/messages";
import type { SearchResult } from "../ports/search";
import { normaliseCoordinateText } from "./normaliseCoordinateText";
import {
  isCoordinateWordsAndFigures,
  parseCoordinates,
} from "./parseCoordinates";

const ID_DECIMAL_PLACES = 5;

function coordinateId(position: LatLng): string {
  const lat = formatFixed(position.lat, ID_DECIMAL_PLACES);
  const lng = formatFixed(position.lng, ID_DECIMAL_PLACES);
  return `coordinates:${lat},${lng}`;
}

/**
 * Turns search text into the one result for the place it names, when the text
 * is coordinates (see {@link parseCoordinates}), and `null` otherwise.
 * The result needs no search service, so a caller can answer it without a
 * request.
 *
 * The label names the place in words, such as "Coordinates 26.20410° S,
 * 28.04730° E", using the app's coordinate formatters and the hemisphere
 * letters and wording of `messages`, and it reads the letters and words of
 * that language in the text too. It reads back through
 * {@link parseCoordinates} as the same place to about a metre (the label keeps
 * five decimals), so the box can show it after the person picks it.
 */
export function coordinateSearchResult(
  text: string,
  messages: MessageCatalogue,
): SearchResult | null {
  const hemispheres = hemispheresFor(messages);
  const position = parseCoordinates(
    text,
    hemispheres,
    coordinateWordsFor(messages),
  );
  if (position === null) {
    return null;
  }
  return {
    id: coordinateId(position),
    label: messages.t("search.coordinatesLabel", {
      latitude: formatLatitude(position.lat, hemispheres),
      longitude: formatLongitude(position.lng, hemispheres),
    }),
    centre: position,
  };
}

/**
 * A grid reference as far as it can have been typed: the zone with its band
 * letter written together and up to two more letters (the 100 km square) and
 * then digits and spaces, or the zone, one letter (a band or hemisphere
 * letter, which a UTM reference may set apart) and digits and spaces. A
 * prefix of "11SPA7234911844" or "31U 500000 5500000" matches; "Cape Town",
 * "5 Pub" and "1 Dec 2015" do not, so place names of that shape are still
 * suggested.
 */
const GRID_REFERENCE_UNDER_WAY =
  /^(?:\d{1,2}[A-Z]\s*(?:[A-Z]{1,2})?|\d{1,2}\s*[A-Z])[\d\s]*$/i;

/**
 * Whether text is, or may be the start of, a coordinate: text that reads as a
 * position ({@link coordinateSearchResult}), is a pair made of figures and
 * coordinate words only, finished or not ("26.2041 south, 28.04"), or is a
 * UTM or MGRS reference that has not been finished. A caller that sends text to a place search service
 * as it is typed skips this text, so a coordinate is never sent to one, even
 * a reference whose letters ("SPA") look like a word.
 */
export function isCoordinateText(
  text: string,
  messages: MessageCatalogue,
): boolean {
  const normalised = normaliseCoordinateText(text.trim());
  return (
    GRID_REFERENCE_UNDER_WAY.test(normalised) ||
    coordinateSearchResult(text, messages) !== null ||
    isCoordinateWordsAndFigures(
      text,
      hemispheresFor(messages),
      coordinateWordsFor(messages),
    )
  );
}
