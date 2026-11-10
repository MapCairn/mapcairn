import type { LatLng, MapAdapter, PixelPoint } from "@mapcairn/core";

/**
 * The on-screen radius, in pixels, of a distance on the ground.
 * @param minimum - The smallest radius returned, so a tiny circle stays visible.
 * @returns `minimum` when the resolution is not a positive number or the
 *   distance is negative or not finite.
 */
export function screenRadiusForMetres(
  metres: number,
  metresPerPixel: number,
  minimum = 0,
): number {
  if (!(metresPerPixel > 0) || !(metres >= 0) || !Number.isFinite(metres)) {
    return minimum;
  }
  return Math.max(minimum, metres / metresPerPixel);
}

/** Projects geographic points to pixels on the map host, in order. */
export function projectPoints(
  map: Pick<MapAdapter, "project">,
  points: readonly LatLng[],
): PixelPoint[] {
  return points.map((point) => map.project(point));
}

/** Rounds a pixel coordinate to two decimals, to keep SVG attributes short. */
export function roundPixel(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Formats pixels for an SVG `points` attribute. */
export function toSvgPoints(points: readonly PixelPoint[]): string {
  return points
    .map((point) => `${roundPixel(point.x)},${roundPixel(point.y)}`)
    .join(" ");
}
