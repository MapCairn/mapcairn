// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { clamp } from "../numbers/clamp";
import type { Bounds, LatLng } from "../ports/geometry";

/**
 * The smallest latitude and longitude box holding every point, clamped to
 * valid coordinates. Used to turn the corners of a rotated map view into a
 * search bias box.
 * @returns `undefined` when no point has finite coordinates.
 * @remarks Takes plain minima and maxima, so a view that crosses the
 *   antimeridian gives a box that spans the whole width between its edges.
 *   That is a wider bias than needed, never a wrong one.
 */
export function boundsOfPoints(points: readonly LatLng[]): Bounds | undefined {
  const usable = points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
  if (usable.length === 0) {
    return undefined;
  }
  const lats = usable.map((point) => point.lat);
  const lngs = usable.map((point) => point.lng);
  return {
    south: clamp(Math.min(...lats), -90, 90),
    west: clamp(Math.min(...lngs), -180, 180),
    north: clamp(Math.max(...lats), -90, 90),
    east: clamp(Math.max(...lngs), -180, 180),
  };
}
