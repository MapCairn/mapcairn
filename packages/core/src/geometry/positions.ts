// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Geometry, Position } from "geojson";

/**
 * Builds a copy of a geometry with `convert` applied to every position. An
 * empty shape stays empty, and the input is never changed.
 */
export function mapPositions(
  geometry: Geometry,
  convert: (position: Position) => Position,
): Geometry {
  switch (geometry.type) {
    case "GeometryCollection":
      return {
        type: "GeometryCollection",
        geometries: geometry.geometries.map((member) =>
          mapPositions(member, convert),
        ),
      };
    case "Point":
      return {
        type: "Point",
        coordinates:
          geometry.coordinates.length === 0
            ? []
            : convert(geometry.coordinates),
      };
    case "MultiPoint":
    case "LineString":
      return {
        type: geometry.type,
        coordinates: geometry.coordinates.map((position) => convert(position)),
      };
    case "MultiLineString":
    case "Polygon":
      return {
        type: geometry.type,
        coordinates: geometry.coordinates.map((line) =>
          line.map((position) => convert(position)),
        ),
      };
    default:
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map((position) => convert(position))),
        ),
      };
  }
}
