// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, Geometry, Polygon, Position } from "geojson";

/** The mean radius of the Earth in metres, for the distance check in tests. */
const EARTH_RADIUS = 6_371_008.8;

/** Great-circle distance in metres between two `[lng, lat]` positions. */
export function haversine(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const dLat = ((b[1] as number) - (a[1] as number)) * rad;
  const dLng = ((b[0] as number) - (a[0] as number)) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] as number) * rad) *
      Math.cos((b[1] as number) * rad) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/** A closed axis-aligned rectangle as a polygon, corners in degrees. */
export function rectangle(
  west: number,
  south: number,
  east: number,
  north: number,
): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

/** Wraps a geometry as a feature with a property, to prove properties are ignored. */
export function asFeature(geometry: Geometry): Feature {
  return { type: "Feature", properties: { name: "sample" }, geometry };
}

/** The centre of Paris, as `[lng, lat]`. */
export const PARIS: Position = [2.3522, 48.8566];

/** The centre of Nairobi, as `[lng, lat]`. */
export const NAIROBI: Position = [36.8219, -1.2921];
