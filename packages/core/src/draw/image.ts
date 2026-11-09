import type { LatLng } from "../ports/geometry";
import type { MapImageMark } from "../ports/map";
import { shapeRing } from "./shape";
import type { DrawShape } from "./types";

/**
 * The marks that draw shapes into an exported map image: a point is a dot, a
 * line an open path, a polygon or circle a closed, filled path, and a shape
 * still being drawn is dashed. A shape with nothing to draw yet (a line of
 * one position, a circle with no radius) is left out.
 */
export function imageMarksFor(shapes: readonly DrawShape[]): MapImageMark[] {
  const marks: MapImageMark[] = [];
  for (const shape of shapes) {
    const dashed = !shape.done;
    const first = shape.vertices[0];
    if (!first) {
      continue;
    }
    if (shape.kind === "point") {
      marks.push({ kind: "dot", position: first });
    } else if (shape.kind === "circle") {
      const ring: LatLng[] = shapeRing(shape);
      if (ring.length >= 3) {
        marks.push({
          kind: "path",
          positions: ring,
          closed: true,
          fill: true,
          dashed,
        });
      }
    } else if (shape.kind === "polygon" && shape.vertices.length >= 3) {
      marks.push({
        kind: "path",
        positions: shape.vertices,
        closed: true,
        fill: true,
        dashed,
      });
    } else if (shape.vertices.length >= 2) {
      marks.push({
        kind: "path",
        positions: shape.vertices,
        closed: false,
        fill: false,
        dashed,
      });
    }
  }
  return marks;
}
