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

/**
 * The narrowest run of longitude, going east from `west` to `east`, that
 * holds every one of `lngs`: the circle of longitude less its widest empty
 * gap. Across the antimeridian `east` goes past 180 (179 and -179 give 179
 * to 181), so a fit takes the short way rather than the width of the world.
 * @returns `undefined` when there are no longitudes.
 */
export function shortestLongitudeSpan(
  lngs: readonly number[],
): { readonly west: number; readonly east: number } | undefined {
  const sorted = lngs.map(wrapLongitude).sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  // The gap that wraps from the last longitude round to the first.
  let gap = first + 360 - last;
  let span = { west: first, east: last };
  for (let index = 1; index < sorted.length; index += 1) {
    const west = sorted[index] as number;
    const east = sorted[index - 1] as number;
    if (west - east > gap) {
      gap = west - east;
      span = { west, east: east + 360 };
    }
  }
  return span;
}
