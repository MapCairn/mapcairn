// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { area } from "@turf/area";
import { lineString, polygon } from "@turf/helpers";
import { length } from "@turf/length";
import type { Position } from "geojson";
import { nearestLongitude } from "../globe/longitude";

/**
 * Measures the total length (kilometres) of a line drawn through `positions`,
 * in order.
 * @param positions - Vertices as `[lon, lat]`, e.g. points a user has clicked
 *   while measuring on a map.
 * @returns The summed distance across every segment, or `null` if there are
 *   fewer than two positions to form a segment from.
 */
export function measureLineDistance(
  positions: readonly Position[],
): number | null {
  if (positions.length < 2) {
    return null;
  }

  return length(lineString(positions as Position[]), {
    units: "kilometers",
  });
}

/**
 * Measures the area (square metres) enclosed by `positions`.
 * @param positions - Ring vertices as `[lon, lat]`, e.g. points a user has
 *   clicked while measuring on a map. The ring is closed automatically if
 *   `positions` doesn't already repeat its first point as its last.
 * @returns The enclosed area, or `null` if there are fewer than three
 *   positions to form a polygon from.
 */
export function measurePolygonArea(
  positions: readonly Position[],
): number | null {
  if (positions.length < 3) {
    return null;
  }

  // Each edge is taken the short way, so a ring across the antimeridian
  // (170 to -170) is not measured as one that goes round the world.
  let previous = (positions[0] as Position)[0] as number;
  const unwrapped = positions.map(([lng, ...rest]): Position => {
    previous = nearestLongitude(lng as number, previous);
    return [previous, ...rest];
  });
  const first = unwrapped[0] as Position;
  const last = unwrapped[unwrapped.length - 1] as Position;
  const ring =
    first[0] === last[0] && first[1] === last[1]
      ? unwrapped
      : [...unwrapped, first];

  return area(polygon([ring]));
}
