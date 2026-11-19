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
import { parseCoordinates } from "./parseCoordinates";

const ID_DECIMAL_PLACES = 5;

function coordinateId(position: LatLng): string {
  const lat = formatFixed(position.lat, ID_DECIMAL_PLACES);
  const lng = formatFixed(position.lng, ID_DECIMAL_PLACES);
  return `coordinates:${lat},${lng}`;
}

/**
 * Turns search text into the one result for the place it names, when the text
 * is a coordinate pair (see {@link parseCoordinates}), and `null` otherwise.
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
