import type { LatLng } from "../ports/geometry";

/**
 * How many decimal places a position keeps before it leaves the device for an
 * address lookup. Four places is about 11 m, enough to name a street or a
 * building but not a doorstep.
 */
export const LOOKUP_DECIMAL_PLACES = 4;

const FACTOR = 10 ** LOOKUP_DECIMAL_PLACES;

function round(value: number): number {
  const rounded = Math.round(value * FACTOR) / FACTOR;
  // A value that rounds to zero must not carry a negative sign into a URL.
  return rounded === 0 ? 0 : rounded;
}

/**
 * Rounds a position to {@link LOOKUP_DECIMAL_PLACES} decimal places, so a
 * third-party service is sent roughly 11 m of precision, not the exact point
 * the user chose. Returns a new object.
 */
export function roundForLookup(position: LatLng): LatLng {
  return { lat: round(position.lat), lng: round(position.lng) };
}
