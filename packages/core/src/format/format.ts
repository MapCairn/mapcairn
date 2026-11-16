// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "../ports/geometry";
import type { MessageCatalogue } from "../ports/messages";

const DECIMAL_PLACES = 5;

/**
 * Formats a number with a fixed count of decimals, always with a dot
 * separator, and never as a negative zero.
 * @remarks Built on `toFixed`, which ignores the process locale, so coordinates
 *   read the same everywhere. A value that rounds to zero loses its sign.
 */
export function formatFixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? text.replace("-", "") : text;
}

/**
 * Formats a position as "lat, lng" with five decimals and a dot separator
 * regardless of locale, for example "-26.20410, 28.04730". This is the
 * string that is copied and shown.
 */
export function formatLatLng(position: LatLng): string {
  return `${formatFixed(position.lat, DECIMAL_PLACES)}, ${formatFixed(position.lng, DECIMAL_PLACES)}`;
}

/** The letters that name the four hemispheres, as a language writes them. */
export interface Hemispheres {
  readonly north: string;
  readonly south: string;
  readonly east: string;
  readonly west: string;
}

/**
 * The hemisphere letters of `catalogue`'s language, from its
 * `format.hemisphere*` keys, so no code here branches on a language.
 */
export function hemispheresFor(catalogue: MessageCatalogue): Hemispheres {
  return {
    north: catalogue.t("format.hemisphereNorth", {}),
    south: catalogue.t("format.hemisphereSouth", {}),
    east: catalogue.t("format.hemisphereEast", {}),
    west: catalogue.t("format.hemisphereWest", {}),
  };
}

function formatDegrees(
  value: number,
  positive: string,
  negative: string,
): string {
  const rounded = Number(formatFixed(value, DECIMAL_PLACES));
  const hemisphere = rounded < 0 ? negative : positive;
  return `${formatFixed(Math.abs(rounded), DECIMAL_PLACES)}° ${hemisphere}`;
}

/**
 * Formats a latitude with a hemisphere letter, for example "26.20410° S". The
 * digits keep a dot in every language so the text reads back through
 * `parseCoordinates`.
 */
export function formatLatitude(
  latitude: number,
  hemispheres: Hemispheres,
): string {
  return formatDegrees(latitude, hemispheres.north, hemispheres.south);
}

/** Formats a longitude with a hemisphere letter, for example "28.04730° E". */
export function formatLongitude(
  longitude: number,
  hemispheres: Hemispheres,
): string {
  return formatDegrees(longitude, hemispheres.east, hemispheres.west);
}

/**
 * Formats a number for display with the grouping and decimals of `language`.
 * The language is named explicitly so output never depends on the visitor's
 * settings; callers pass their message catalogue's `language`.
 */
export function formatNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(language, options).format(value);
}

/** Formats a zoom level with at most one decimal, for example "12" or "12.5". */
export function formatZoom(zoom: number, language: string): string {
  return formatNumber(zoom, language, { maximumFractionDigits: 1 });
}

/** Words for the UTC day of `date`, for example "11 November 2026". */
export function formatDay(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
