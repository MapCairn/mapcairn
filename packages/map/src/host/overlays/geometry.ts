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

/** The part of the map port an overlay needs to place and hide its marks. */
export type OverlayMap = Pick<MapAdapter, "project" | "isVisible">;

/** Points projected to pixels, with whether each is on the visible side of a globe. */
export interface ProjectedPath {
  readonly pixels: readonly PixelPoint[];
  readonly visible: readonly boolean[];
  /** True when every point is visible (always, on a flat map). */
  readonly whole: boolean;
}

/** Projects points in order and records which are on the visible side. */
export function projectPath(
  map: OverlayMap,
  points: readonly LatLng[],
): ProjectedPath {
  const visible = points.map((point) => map.isVisible(point));
  return {
    pixels: projectPoints(map, points),
    visible,
    whole: visible.every(Boolean),
  };
}

/**
 * The runs of consecutive visible points that make at least a segment. On a
 * globe a segment is drawn straight on the screen between two visible points,
 * and never to a point beyond the horizon.
 */
export function visibleRuns(path: ProjectedPath): PixelPoint[][] {
  const runs: PixelPoint[][] = [];
  let run: PixelPoint[] = [];
  path.pixels.forEach((pixel, index) => {
    if (path.visible[index]) {
      run.push(pixel);
      return;
    }
    if (run.length >= 2) {
      runs.push(run);
    }
    run = [];
  });
  if (run.length >= 2) {
    runs.push(run);
  }
  return runs;
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
