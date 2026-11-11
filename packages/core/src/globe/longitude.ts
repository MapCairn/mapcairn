import type { LatLng } from "../ports/geometry";

/** Brings a longitude into [-180, 180), the range stored, exported and shared. */
export function wrapLongitude(lng: number): number {
  if (lng >= -180 && lng < 180) {
    return lng;
  }
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * The copy of `lng` (it plus or minus whole turns) nearest `reference`.
 * @remarks A flat map draws copies of the world side by side, and the
 *   engine's `project` places a longitude on the copy it names: 190 is one
 *   world east of -170. Choosing the copy nearest the view centre keeps a
 *   mark near the antimeridian on screen.
 */
export function nearestLongitude(lng: number, reference: number): number {
  return lng + 360 * Math.round((reference - lng) / 360);
}

/**
 * The positions of a path with each longitude moved to the copy nearest the
 * one before it, and the first to the copy nearest `referenceLng`, so every
 * step goes the short way (170 to -170 becomes 170 to 190). Only for drawing:
 * stored, exported and shared positions keep their own longitudes.
 */
export function unwrapLongitudes(
  positions: readonly LatLng[],
  referenceLng: number,
): LatLng[] {
  const unwrapped: LatLng[] = [];
  let previous = referenceLng;
  for (const position of positions) {
    const lng = nearestLongitude(position.lng, previous);
    unwrapped.push({ lat: position.lat, lng });
    previous = lng;
  }
  return unwrapped;
}
