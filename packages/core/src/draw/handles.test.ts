import { describe, expect, it } from "vitest";
import { distanceMetres } from "./geo";
import { editHandlesFor, parseHandleId } from "./handles";
import type { DrawSelection, DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

const TRIANGLE: DrawShape = {
  id: "shape-1",
  kind: "polygon",
  label: "Polygon 1",
  vertices: [p(0, 0), p(2, 0), p(0, 2)],
  done: true,
};
const LINE: DrawShape = {
  id: "shape-2",
  kind: "line",
  label: "Line 1",
  vertices: [p(0, 0), p(2, 0)],
  done: true,
};
const CIRCLE: DrawShape = {
  id: "shape-3",
  kind: "circle",
  label: "Circle 1",
  vertices: [p(10, 10)],
  radiusMetres: 1000,
  done: true,
};
const POINT: DrawShape = {
  id: "shape-4",
  kind: "point",
  label: "Point 1",
  vertices: [p(5, 5)],
  done: true,
};

function select(shape: DrawShape): DrawSelection {
  return { shapeId: shape.id, vertex: null };
}

describe("editHandlesFor", () => {
  it("has no handles without a selection or for an unknown shape", () => {
    expect(editHandlesFor([TRIANGLE], null)).toEqual([]);
    expect(
      editHandlesFor([TRIANGLE], { shapeId: "nope", vertex: null }),
    ).toEqual([]);
  });

  it("gives a polygon a vertex at each corner and a midpoint on each edge, the closing one too", () => {
    const handles = editHandlesFor([TRIANGLE], select(TRIANGLE));
    expect(handles.filter((h) => h.kind === "vertex")).toHaveLength(3);
    const midpoints = handles.filter((h) => h.kind === "midpoint");
    expect(midpoints.map((h) => h.id)).toEqual([
      "shape-1:m:1",
      "shape-1:m:2",
      "shape-1:m:3",
    ]);
    expect(midpoints[0]?.position).toEqual(p(1, 0));
    expect(midpoints[2]?.position).toEqual(p(0, 1));
  });

  it("gives a line vertices and midpoints between them, but no closing edge", () => {
    const handles = editHandlesFor([LINE], select(LINE));
    expect(handles.map((h) => h.id)).toEqual([
      "shape-2:v:0",
      "shape-2:v:1",
      "shape-2:m:1",
    ]);
  });

  it("puts the midpoint of an edge across the antimeridian on that edge, not on the far side of the world", () => {
    const across: DrawShape = {
      ...LINE,
      vertices: [p(170, 10), p(-170, 12)],
    };
    const [middle] = editHandlesFor([across], select(across)).filter(
      (h) => h.kind === "midpoint",
    );
    expect(Math.abs(middle?.position.lng ?? 0)).toBe(180);
    expect(middle?.position.lat).toBe(11);
  });

  it("puts a midpoint on the great circle on a globe, as the edge is drawn there", () => {
    const long: DrawShape = {
      ...LINE,
      vertices: [p(-0.1, 51.5), p(-74, 40.7)],
    };
    const flat = editHandlesFor([long], select(long)).at(-1);
    expect(flat?.position.lat).toBeCloseTo(46.1, 9);
    expect(flat?.position.lng).toBeCloseTo(-37.05, 9);
    const globe = editHandlesFor([long], select(long), "globe").at(-1);
    expect(globe?.kind).toBe("midpoint");
    expect(globe?.position.lat).toBeCloseTo(52.36255, 5);
    expect(globe?.position.lng).toBeCloseTo(-41.27571, 5);
  });

  it("leaves midpoints out while a shape is still being drawn", () => {
    const draft = { ...TRIANGLE, done: false };
    const handles = editHandlesFor([draft], select(draft));
    expect(handles.every((h) => h.kind === "vertex")).toBe(true);
    expect(handles).toHaveLength(3);
  });

  it("gives a circle a centre and a radius handle due east of it", () => {
    const handles = editHandlesFor([CIRCLE], select(CIRCLE));
    expect(handles.map((h) => h.kind)).toEqual(["vertex", "radius"]);
    expect(handles[1]?.id).toBe("shape-3:r");
    expect(
      distanceMetres(p(10, 10), handles[1]?.position ?? p(0, 0)),
    ).toBeCloseTo(1000, 1);
  });

  it("gives a circle with no radius only its centre", () => {
    const draft = { ...CIRCLE, radiusMetres: undefined, done: false };
    expect(editHandlesFor([draft], select(draft))).toHaveLength(1);
  });

  it("gives a point one handle", () => {
    expect(editHandlesFor([POINT], select(POINT))).toEqual([
      { id: "shape-4:v:0", kind: "vertex", position: p(5, 5) },
    ]);
  });

  it("only has handles for the selected shape", () => {
    const handles = editHandlesFor([TRIANGLE, LINE], select(LINE));
    expect(handles.every((h) => h.id.startsWith("shape-2"))).toBe(true);
  });
});

describe("parseHandleId", () => {
  it("reads a vertex, a midpoint and a radius handle", () => {
    expect(parseHandleId("shape-12:v:3")).toEqual({
      shapeId: "shape-12",
      kind: "vertex",
      index: 3,
    });
    expect(parseHandleId("shape-1:m:1")).toEqual({
      shapeId: "shape-1",
      kind: "midpoint",
      index: 1,
    });
    expect(parseHandleId("shape-3:r")).toEqual({
      shapeId: "shape-3",
      kind: "radius",
      index: 0,
    });
  });

  it("returns null for anything else", () => {
    expect(parseHandleId("")).toBeNull();
    expect(parseHandleId("shape-1:x:1")).toBeNull();
    expect(parseHandleId("shape-1:v:one")).toBeNull();
    expect(parseHandleId("shape-1:v:-1")).toBeNull();
  });
});
