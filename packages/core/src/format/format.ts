import type { LatLng } from "../ports/geometry";

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

function formatDegrees(
  value: number,
  positive: string,
  negative: string,
): string {
  const rounded = Number(formatFixed(value, DECIMAL_PLACES));
  const hemisphere = rounded < 0 ? negative : positive;
  return `${formatFixed(Math.abs(rounded), DECIMAL_PLACES)}° ${hemisphere}`;
}

/** Formats a latitude with a hemisphere letter, for example "26.20410° S". */
export function formatLatitude(latitude: number): string {
  return formatDegrees(latitude, "N", "S");
}

/** Formats a longitude with a hemisphere letter, for example "28.04730° E". */
export function formatLongitude(longitude: number): string {
  return formatDegrees(longitude, "E", "W");
}

/**
 * Formats a number for display with `en-GB` grouping and decimals. The locale
 * is named explicitly so output never depends on the visitor's settings.
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat("en-GB", options).format(value);
}

/** Formats a zoom level with at most one decimal, for example "12" or "12.5". */
export function formatZoom(zoom: number): string {
  return formatNumber(zoom, { maximumFractionDigits: 1 });
}
