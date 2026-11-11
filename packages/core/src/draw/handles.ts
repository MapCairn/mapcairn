import { greatCircleMidpoint } from "../globe/greatCircle";
import { nearestLongitude, wrapLongitude } from "../globe/longitude";
import type { LatLng } from "../ports/geometry";
import type {
  MapEditHandle,
  MapEditHandleKind,
  MapProjection,
} from "../ports/map";
import { destinationPoint } from "./geo";
import type { DrawSelection, DrawShape } from "./types";

/**
 * Halfway along an edge as it is drawn: on a globe the middle of its great
 * circle, on a flat map the average of its ends, taken the short way across
 * the antimeridian.
 */
function midpoint(a: LatLng, b: LatLng, projection: MapProjection): LatLng {
  if (projection === "globe") {
    return greatCircleMidpoint(a, b);
  }
  const lng = (a.lng + nearestLongitude(b.lng, a.lng)) / 2;
  return { lat: (a.lat + b.lat) / 2, lng: wrapLongitude(lng) };
}

function pathHandles(
  shape: DrawShape,
  projection: MapProjection,
): MapEditHandle[] {
  const handles: MapEditHandle[] = shape.vertices.map((position, index) => ({
    id: `${shape.id}:v:${index}`,
    kind: "vertex",
    position,
  }));
  if (!shape.done) {
    return handles;
  }
  const { vertices } = shape;
  const edges =
    shape.kind === "polygon" ? vertices.length : vertices.length - 1;
  for (let index = 1; index <= edges; index += 1) {
    const from = vertices[index - 1] as LatLng;
    const to = vertices[index % vertices.length] as LatLng;
    handles.push({
      id: `${shape.id}:m:${index}`,
      kind: "midpoint",
      position: midpoint(from, to, projection),
    });
  }
  return handles;
}

/**
 * The handles the person can drag on the selected shape: a vertex at each
 * position, a midpoint on each edge of a finished line or polygon (pressing
 * one adds a vertex there), and for a circle a radius handle due east of its
 * centre. Only the selected shape has handles, so a map full of shapes is
 * not full of targets.
 *
 * @remarks Ids are `<shape>:v:<index>`, `<shape>:m:<index>` (the vertex that
 *   would be inserted at that index) and `<shape>:r`; read them with
 *   {@link parseHandleId}. A midpoint sits on its edge as the overlay draws
 *   it for the map's `projection` (flat, the default, or globe).
 */
export function editHandlesFor(
  shapes: readonly DrawShape[],
  selection: DrawSelection | null,
  projection: MapProjection = "flat",
): MapEditHandle[] {
  const shape = shapes.find((candidate) => candidate.id === selection?.shapeId);
  if (!shape) {
    return [];
  }
  if (shape.kind === "line" || shape.kind === "polygon") {
    return pathHandles(shape, projection);
  }
  const centre = shape.vertices[0];
  if (!centre) {
    return [];
  }
  const handles: MapEditHandle[] = [
    { id: `${shape.id}:v:0`, kind: "vertex", position: centre },
  ];
  if (shape.kind === "circle" && shape.radiusMetres !== undefined) {
    handles.push({
      id: `${shape.id}:r`,
      kind: "radius",
      position: destinationPoint(centre, 90, shape.radiusMetres),
    });
  }
  return handles;
}

/** What a handle id names. */
export interface ParsedHandleId {
  readonly shapeId: string;
  readonly kind: MapEditHandleKind;
  /** The vertex index, the index a midpoint inserts at, or 0 for a radius handle. */
  readonly index: number;
}

/** Reads an id made by {@link editHandlesFor}, or returns null for anything else. */
export function parseHandleId(id: string): ParsedHandleId | null {
  const parts = id.split(":");
  const [shapeId, code, rawIndex] = parts;
  if (!shapeId) {
    return null;
  }
  if (parts.length === 2 && code === "r") {
    return { shapeId, kind: "radius", index: 0 };
  }
  if (parts.length !== 3 || (code !== "v" && code !== "m")) {
    return null;
  }
  if (!/^\d+$/.test(rawIndex ?? "")) {
    return null;
  }
  return {
    shapeId,
    kind: code === "v" ? "vertex" : "midpoint",
    index: Number(rawIndex),
  };
}
