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
  /** The letter for north. */
  readonly north: string;
  /** The letter for south. */
  readonly south: string;
  /** The letter for east. */
  readonly east: string;
  /** The letter for west. */
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

/**
 * The whole words a language writes in a coordinate: the four directions and
 * the degree, minute and second. Each value may list several words separated
 * by white space, for example "graad grade", so a singular and a plural both read.
 */
export interface CoordinateWords {
  /** The word for north. */
  readonly north: string;
  /** The word for south. */
  readonly south: string;
  /** The word for east. */
  readonly east: string;
  /** The word for west. */
  readonly west: string;
  /** The word for a degree. */
  readonly degree: string;
  /** The word for a minute of arc. */
  readonly minute: string;
  /** The word for a second of arc. */
  readonly second: string;
}

/**
 * The coordinate words of `catalogue`'s language, from its `format.word*`
 * keys, for `parseCoordinates` to read in addition to its English ones.
 */
export function coordinateWordsFor(
  catalogue: MessageCatalogue,
): CoordinateWords {
  return {
    north: catalogue.t("format.wordNorth", {}),
    south: catalogue.t("format.wordSouth", {}),
    east: catalogue.t("format.wordEast", {}),
    west: catalogue.t("format.wordWest", {}),
    degree: catalogue.t("format.wordDegree", {}),
    minute: catalogue.t("format.wordMinute", {}),
    second: catalogue.t("format.wordSecond", {}),
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
 * The locale tag to give `Intl` for numbers and dates: the catalogue's
 * language, with its `numberingSystem` as a `-u-nu-` extension when it has
 * one; a malformed system is ignored. Calendars are not touched, so a
 * language keeps its own (Thai years are Buddhist, Persian years are Solar
 * Hijri). Plural selection, lists and the `lang` attribute use the plain
 * language.
 */
export function formatLocale(
  catalogue: Pick<MessageCatalogue, "language" | "numberingSystem">,
): string {
  const { language, numberingSystem } = catalogue;
  if (numberingSystem === undefined) {
    return language;
  }
  try {
    return new Intl.Locale(language, { numberingSystem }).toString();
  } catch {
    return language;
  }
}

/**
 * Formats a number for display with the grouping, decimals and digits of
 * `locale`. The locale is named explicitly so output never depends on the
 * visitor's settings; callers pass `formatLocale(catalogue)`.
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Formats a zoom level with at most one decimal, for example "12" or "12.5". */
export function formatZoom(zoom: number, locale: string): string {
  return formatNumber(zoom, locale, { maximumFractionDigits: 1 });
}

/**
 * Words for the UTC day of `date` in `locale` (`formatLocale(catalogue)`),
 * for example "11 November 2026".
 */
export function formatDay(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
