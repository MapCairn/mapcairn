// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { shortestLongitudeSpan } from "../globe/longitude";
import { clamp } from "../numbers/clamp";
import type { Bounds, LatLng } from "../ports/geometry";

/**
 * The smallest latitude and longitude box holding every point, with its
 * latitudes clamped to valid coordinates. Used to fit the map to a feature.
 * @returns `undefined` when no point has finite coordinates.
 * @remarks The box takes the short way round the globe. Points on both sides
 *   of the antimeridian give a `west` inside [-180, 180) and an `east` past
 *   180 (179 and -179 give 179 to 181), the form `shapeInputBounds` and
 *   {@link shortestLongitudeSpan} already use, so `west` is never greater than
 *   `east` and a caller that reads width as `east - west` stays correct. A box
 *   that does not cross the line keeps both edges inside [-180, 180]. Take the
 *   middle with `wrapLongitude((west + east) / 2)`. The engine's `fitBounds`
 *   accepts the unwrapped `east`. A set of points wider than half the globe
 *   with a wide gap in it may be boxed on the other side of the gap, because
 *   points say nothing about what lies between them. For a polygon or a line,
 *   use {@link boundsOfPaths}, which also holds every edge.
 */
export function boundsOfPoints(points: readonly LatLng[]): Bounds | undefined {
  const usable = points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
  const span = shortestLongitudeSpan(usable.map((point) => point.lng));
  if (!span) {
    return undefined;
  }
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const { lat } of usable) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return {
    south: clamp(south, -90, 90),
    west: span.west,
    north: clamp(north, -90, 90),
    east: span.east,
  };
}
