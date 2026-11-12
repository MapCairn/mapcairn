// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { LatLng } from "../ports/geometry";
import { ringSignedArea } from "./geo";
import { measureShape, shapeRing, validateShape } from "./shape";
import type { DrawShape } from "./types";

const COORDINATE_DECIMALS = 6;
const MEASURE_DECIMALS = 2;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function position(vertex: LatLng): Position {
  return [
    round(vertex.lng, COORDINATE_DECIMALS),
    round(vertex.lat, COORDINATE_DECIMALS),
  ];
}

/** A closed ring that runs anticlockwise, as the GeoJSON specification asks of an outer ring. */
function closedRing(ring: readonly LatLng[]): Position[] {
  const ordered = ringSignedArea(ring) < 0 ? [...ring].reverse() : [...ring];
  const positions = ordered.map(position);
  return positions.length > 0
    ? [...positions, positions[0] as Position]
    : positions;
}

/**
 * The shapes that can be exported: finished, and valid. A shape still being
 * drawn, or one a later edit left with crossing edges, is left out.
 */
export function exportableShapes(
  shapes: readonly DrawShape[],
): readonly DrawShape[] {
  return shapes.filter((shape) => shape.done && validateShape(shape) === null);
}

/**
 * The GeoJSON geometry of a shape, or null when it is not valid. A circle is
 * a polygon of 72 positions; coordinates are `[longitude, latitude]` rounded
 * to six decimals (about 10 cm).
 */
export function shapeGeometry(shape: DrawShape): Geometry | null {
  if (validateShape(shape) !== null) {
    return null;
  }
  switch (shape.kind) {
    case "point":
      return {
        type: "Point",
        coordinates: position(shape.vertices[0] as LatLng),
      };
    case "line":
      return { type: "LineString", coordinates: shape.vertices.map(position) };
    case "polygon":
    case "circle":
      return { type: "Polygon", coordinates: [closedRing(shapeRing(shape))] };
  }
}

function properties(shape: DrawShape): Record<string, unknown> {
  const { areaMetres, lengthMetres } = measureShape(shape);
  const result: Record<string, unknown> = {
    name: shape.label,
    type: shape.kind,
  };
  if (areaMetres !== null) {
    result.area_m2 = round(areaMetres, MEASURE_DECIMALS);
  }
  if (lengthMetres !== null) {
    result.length_m = round(lengthMetres, MEASURE_DECIMALS);
  }
  if (shape.kind === "circle") {
    result.radius_m = round(shape.radiusMetres ?? 0, MEASURE_DECIMALS);
    result.centre = position(shape.vertices[0] as LatLng);
  }
  return result;
}

/**
 * The shapes as a GeoJSON `FeatureCollection`, one feature each, with the
 * shape's id, its name, its type and its area and length where they apply.
 * A circle also carries `radius_m` and its `centre`. Only
 * {@link exportableShapes} are included.
 */
export function shapesToGeoJson(
  shapes: readonly DrawShape[],
): FeatureCollection {
  const features: Feature[] = [];
  for (const shape of exportableShapes(shapes)) {
    const geometry = shapeGeometry(shape);
    if (geometry) {
      features.push({
        type: "Feature",
        id: shape.id,
        geometry,
        properties: properties(shape),
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** The header row of the CSV the draw tool writes, and reads back. */
export const SHAPES_CSV_HEADER =
  "id,type,area_m2,length_m,geometry,radius_m,centre_lng,centre_lat";

function quote(text: string): string {
  return `"${text.replaceAll('"', '""')}"`;
}

/** A circle's radius and centre, or three empty cells for any other shape. */
function circleCells(shape: DrawShape): string[] {
  if (shape.kind !== "circle") {
    return ["", "", ""];
  }
  const [lng, lat] = position(shape.vertices[0] as LatLng);
  return [
    String(round(shape.radiusMetres ?? 0, MEASURE_DECIMALS)),
    String(lng),
    String(lat),
  ];
}

/**
 * The shapes as CSV text: `id`, `type`, `area_m2`, `length_m`, the GeoJSON
 * geometry as quoted text, and for a circle its `radius_m`, `centre_lng`
 * and `centre_lat`, so a circle can be read back as a circle. Rows end with
 * CRLF between them, the measures are rounded to two decimals and are empty
 * where they do not apply. Only {@link exportableShapes} are included.
 */
export function shapesToCsv(shapes: readonly DrawShape[]): string {
  const rows = [SHAPES_CSV_HEADER];
  for (const shape of exportableShapes(shapes)) {
    const geometry = shapeGeometry(shape);
    if (!geometry) {
      continue;
    }
    const { areaMetres, lengthMetres } = measureShape(shape);
    rows.push(
      [
        shape.id,
        shape.kind,
        areaMetres === null ? "" : String(round(areaMetres, MEASURE_DECIMALS)),
        lengthMetres === null
          ? ""
          : String(round(lengthMetres, MEASURE_DECIMALS)),
        quote(JSON.stringify(geometry)),
        ...circleCells(shape),
      ].join(","),
    );
  }
  return rows.join("\r\n");
}
