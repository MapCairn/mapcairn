// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "../ports/geometry";
import {
  measureLineDistance,
  measurePolygonArea,
} from "../spatial/measurement";
import {
  circleArea,
  circleCircumference,
  circleRing,
  polygonSelfIntersects,
  verticesCollinear,
} from "./geo";
import type { DrawIssue, DrawKind, DrawShape, ShapeMeasure } from "./types";

/** How many positions the ring of a circle has when it is drawn or exported. */
export const CIRCLE_EXPORT_STEPS = 72;

/** The largest radius a circle may have, in metres (10,000 km). */
export const MAX_CIRCLE_RADIUS_METRES = 10_000_000;

const KIND_NAMES: Readonly<Record<DrawKind, string>> = {
  point: "Point",
  line: "Line",
  polygon: "Polygon",
  circle: "Circle",
};

/** A name for a shape of `kind`, such as "Polygon 2". `serial` counts shapes of that kind from 1. */
export function shapeLabel(kind: DrawKind, serial: number): string {
  return `${KIND_NAMES[kind]} ${serial}`;
}

/** The word for a kind, such as "Polygon", for announcements and labels. */
export function kindName(kind: DrawKind): string {
  return KIND_NAMES[kind];
}

function finite(vertices: readonly LatLng[]): boolean {
  return vertices.every(
    (vertex) => Number.isFinite(vertex.lat) && Number.isFinite(vertex.lng),
  );
}

function positions(vertices: readonly LatLng[]): [number, number][] {
  // The maths takes [longitude, latitude], the reverse of LatLng.
  return vertices.map((vertex) => [vertex.lng, vertex.lat]);
}

function validateLine(vertices: readonly LatLng[]): DrawIssue | null {
  if (vertices.length < 2) {
    return "too-few-vertices";
  }
  const [first] = vertices;
  return vertices.every(
    (vertex) => vertex.lat === first?.lat && vertex.lng === first?.lng,
  )
    ? "degenerate"
    : null;
}

function validatePolygon(vertices: readonly LatLng[]): DrawIssue | null {
  if (vertices.length < 3) {
    return "too-few-vertices";
  }
  if (verticesCollinear(vertices)) {
    return "degenerate";
  }
  return polygonSelfIntersects(vertices) ? "self-intersecting" : null;
}

function validateCircle(shape: DrawShape): DrawIssue | null {
  const radius = shape.radiusMetres;
  if (radius === undefined) {
    return "radius-missing";
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    return "degenerate";
  }
  return radius > MAX_CIRCLE_RADIUS_METRES ? "radius-too-large" : null;
}

/**
 * Whether a shape could be finished as it stands, and if not, why.
 * @returns `null` when the shape is valid. A line needs two different
 *   positions, a polygon three that are not on one line and whose edges do
 *   not cross or touch, and a circle a radius above zero and within
 *   {@link MAX_CIRCLE_RADIUS_METRES}. Lines may cross themselves.
 */
export function validateShape(shape: DrawShape): DrawIssue | null {
  if (!finite(shape.vertices) || shape.vertices.length === 0) {
    return "degenerate";
  }
  switch (shape.kind) {
    case "point":
      return null;
    case "line":
      return validateLine(shape.vertices);
    case "polygon":
      return validatePolygon(shape.vertices);
    case "circle":
      return validateCircle(shape);
  }
}

/**
 * The outline of an area shape as an open ring: a polygon's vertices, or the
 * points around a circle. Empty for a point, a line and a circle with no
 * radius yet.
 */
export function shapeRing(shape: DrawShape): LatLng[] {
  if (shape.kind === "polygon") {
    return [...shape.vertices];
  }
  const centre = shape.vertices[0];
  if (shape.kind === "circle" && centre && shape.radiusMetres !== undefined) {
    return circleRing(centre, shape.radiusMetres, CIRCLE_EXPORT_STEPS);
  }
  return [];
}

function lineLength(vertices: readonly LatLng[]): number | null {
  const kilometres = measureLineDistance(positions(vertices));
  return kilometres === null ? null : kilometres * 1000;
}

function polygonMeasure(shape: DrawShape): ShapeMeasure {
  const { vertices } = shape;
  const area = measurePolygonArea(positions(vertices));
  const closed =
    vertices.length >= 3 && vertices[0] ? [...vertices, vertices[0]] : vertices;
  return { areaMetres: area, lengthMetres: lineLength(closed) };
}

function circleMeasure(shape: DrawShape): ShapeMeasure {
  const radius = shape.radiusMetres;
  if (radius === undefined || !(radius > 0)) {
    return { areaMetres: null, lengthMetres: null };
  }
  return {
    areaMetres: circleArea(radius),
    lengthMetres: circleCircumference(radius),
  };
}

/**
 * The measures of a shape along the geodesic (WGS 84, never flat pixels),
 * using the same maths as the Measure tool. A polygon draft with fewer than
 * three vertices has a length but no area. A circle's area is that of the
 * spherical cap and its length the circumference, not those of the polygon it
 * is exported as.
 */
export function measureShape(shape: DrawShape): ShapeMeasure {
  switch (shape.kind) {
    case "point":
      return { areaMetres: null, lengthMetres: null };
    case "line":
      return { areaMetres: null, lengthMetres: lineLength(shape.vertices) };
    case "polygon":
      return polygonMeasure(shape);
    case "circle":
      return circleMeasure(shape);
  }
}
