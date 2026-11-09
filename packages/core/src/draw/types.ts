import type { LatLng } from "../ports/geometry";

/** What a shape is: a single position, a path, an area or a circle. */
export type DrawKind = "point" | "line" | "polygon" | "circle";

/** Every kind, in the order the interface offers them. */
export const DRAW_KINDS: readonly DrawKind[] = [
  "point",
  "line",
  "polygon",
  "circle",
];

/**
 * One drawn shape. A circle keeps its centre as its only vertex and its
 * radius in metres; every other kind is its vertices in order, and a polygon
 * closes itself from the last vertex back to the first.
 */
export interface DrawShape {
  /** Stable for the life of the shape, for example `shape-3`. */
  readonly id: string;
  readonly kind: DrawKind;
  /** A name for lists and announcements, for example "Polygon 2". */
  readonly label: string;
  readonly vertices: readonly LatLng[];
  /** A circle's radius in metres. Absent until the second tap of a circle. */
  readonly radiusMetres?: number;
  /** False while the shape is still being drawn. At most one shape is unfinished. */
  readonly done: boolean;
}

/** Why a shape, or an edit of one, is not allowed. */
export type DrawIssue =
  | "too-few-vertices"
  | "self-intersecting"
  | "degenerate"
  | "radius-missing"
  | "radius-too-large";

/** What the current selection points at: a shape, and optionally one of its vertices. */
export interface DrawSelection {
  readonly shapeId: string;
  /** The selected vertex, or null when the shape as a whole is selected. */
  readonly vertex: number | null;
}

/** The measures of a shape, in metres and square metres. Null where they do not apply. */
export interface ShapeMeasure {
  /** The enclosed area of a polygon or circle. */
  readonly areaMetres: number | null;
  /** A line's length, a polygon's perimeter or a circle's circumference. */
  readonly lengthMetres: number | null;
}
