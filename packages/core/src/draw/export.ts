// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { formatWkt } from "../geometry/wkt";
import type { LatLng } from "../ports/geometry";
import { ringSignedArea } from "./geo";
import { measureShape, shapeRing, validateShape } from "./shape";
import type { DrawIssue, DrawShape } from "./types";

const COORDINATE_DECIMALS = 6;

/**
 * The most decimals a coordinate is written with, about 11 micrometres, for a
 * shape that six decimals would fold in on itself.
 */
const MAX_COORDINATE_DECIMALS = 10;
const MEASURE_DECIMALS = 2;

/**
 * A circle with at least this radius is written at six decimals without
 * checking its ring. Rounding to six decimals moves a position by under 8 cm,
 * and a ring of 72 positions more than 8 m apart (a radius over 90 m) has
 * room for that; the rings of circles of 1 to 3 m were seen to fold in on
 * themselves. A property test in `import.property.test.ts` holds this limit.
 */
const ROUNDING_SAFE_RADIUS_METRES = 100;

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

function roundedVertex(vertex: LatLng, decimals: number): LatLng {
  return {
    lat: round(vertex.lat, decimals),
    lng: round(vertex.lng, decimals),
  };
}

/** The positions that are written for a shape: its vertices, or the ring of a circle. */
function writtenVertices(shape: DrawShape): readonly LatLng[] {
  return shape.kind === "circle" ? shapeRing(shape) : shape.vertices;
}

/** What the draw rules find wrong with `vertices` as written for the shape, a circle as the polygon of its outline. */
function writtenIssue(
  shape: DrawShape,
  vertices: readonly LatLng[],
): DrawIssue | null {
  const kind = shape.kind === "circle" ? "polygon" : shape.kind;
  return validateShape({ ...shape, kind, vertices });
}

function roundedAt(vertices: readonly LatLng[], decimals: number): LatLng[] {
  return vertices.map((vertex) => roundedVertex(vertex, decimals));
}

/**
 * The positions of a shape rounded to six decimals, or to more where six
 * would spoil it: the fewest decimals, up to {@link MAX_COORDINATE_DECIMALS},
 * at which the rounded shape is valid. Where none does, as for a circle a few
 * micrometres across, the positions are written as they are, unrounded, so a
 * valid shape is never left out. A circle whose outline is not valid in the
 * plane to begin with, because it reaches over a pole or the antimeridian,
 * has nothing for rounding to spoil and is written at six.
 */
function roundedVertices(shape: DrawShape): readonly LatLng[] {
  const exact = writtenVertices(shape);
  const atSix = roundedAt(exact, COORDINATE_DECIMALS);
  if (
    (shape.radiusMetres ?? 0) >= ROUNDING_SAFE_RADIUS_METRES ||
    writtenIssue(shape, atSix) === null
  ) {
    return atSix;
  }
  if (writtenIssue(shape, exact) !== null) {
    return atSix;
  }
  for (
    let decimals = COORDINATE_DECIMALS + 1;
    decimals <= MAX_COORDINATE_DECIMALS;
    decimals += 1
  ) {
    const rounded = roundedAt(exact, decimals);
    if (writtenIssue(shape, rounded) === null) {
      return rounded;
    }
  }
  return exact;
}

function toPosition(vertex: LatLng): Position {
  return [vertex.lng, vertex.lat];
}

/** A closed ring that runs anticlockwise, as the GeoJSON specification asks of an outer ring. */
function closedRing(ring: readonly LatLng[]): Position[] {
  const ordered = ringSignedArea(ring) < 0 ? [...ring].reverse() : [...ring];
  const positions = ordered.map(toPosition);
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
 * to six decimals (about 10 cm), or to the fewest more, up to ten, at which a
 * small shape that six decimals would fold in on itself is valid again, as a
 * circle with a radius of a metre or two is. A shape that not even ten
 * decimals keep valid is written unrounded.
 */
export function shapeGeometry(shape: DrawShape): Geometry | null {
  if (validateShape(shape) !== null) {
    return null;
  }
  const vertices = roundedVertices(shape);
  switch (shape.kind) {
    case "point":
      return { type: "Point", coordinates: toPosition(vertices[0] as LatLng) };
    case "line":
      return { type: "LineString", coordinates: vertices.map(toPosition) };
    case "polygon":
    case "circle":
      return { type: "Polygon", coordinates: [closedRing(vertices)] };
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

/**
 * The shapes as Well-Known Text, one geometry to a line and longitude first,
 * in the order of the list, with the positions {@link shapeGeometry} gives
 * (six decimals, or more for a small shape). A circle is written as the
 * polygon of its outline, so it reads back as a polygon. Only
 * {@link exportableShapes} are included, so the text is empty when there are
 * none.
 */
export function shapesToWkt(shapes: readonly DrawShape[]): string {
  const lines: string[] = [];
  for (const shape of exportableShapes(shapes)) {
    const geometry = shapeGeometry(shape);
    if (geometry) {
      lines.push(formatWkt(geometry));
    }
  }
  return lines.join("\n");
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
