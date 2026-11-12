// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";

/**
 * What the geometry helpers accept: a GeoJSON geometry, or a feature that
 * holds one. Every helper checks its input at run time with
 * `validateGeometry`, so a value that only claims this type is still refused
 * with a `GeometryError`.
 */
export type GeometryInput = Geometry | Feature<Geometry | null>;

/** A geometry that covers an area. */
export type PolygonalGeometry = Polygon | MultiPolygon;

/** A bounding box as `[west, south, east, north]`, in degrees. */
export type BoundingBox = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];
