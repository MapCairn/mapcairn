// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { imageMarksFor } from "./image";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });
const base = { id: "s", label: "Shape", done: true } as const;

describe("imageMarksFor", () => {
  it("draws a point as a dot", () => {
    expect(
      imageMarksFor([{ ...base, kind: "point", vertices: [p(2.35, 48.85)] }]),
    ).toEqual([{ kind: "dot", position: p(2.35, 48.85) }]);
  });

  it("draws a line as an open path and a polygon as a closed, filled one", () => {
    const line: DrawShape = {
      ...base,
      kind: "line",
      vertices: [p(0, 0), p(1, 1)],
    };
    const polygon: DrawShape = {
      ...base,
      kind: "polygon",
      vertices: [p(0, 0), p(1, 0), p(0, 1)],
    };
    expect(imageMarksFor([line, polygon])).toEqual([
      {
        kind: "path",
        positions: line.vertices,
        closed: false,
        fill: false,
        dashed: false,
      },
      {
        kind: "path",
        positions: polygon.vertices,
        closed: true,
        fill: true,
        dashed: false,
      },
    ]);
  });

  it("draws a circle as its ring", () => {
    const [mark] = imageMarksFor([
      { ...base, kind: "circle", vertices: [p(36.8, -1.3)], radiusMetres: 500 },
    ]);
    expect(mark?.kind === "path" && mark.positions.length).toBe(72);
    expect(mark).toMatchObject({ closed: true, fill: true });
  });

  it("dashes a shape that is still being drawn", () => {
    const [mark] = imageMarksFor([
      { ...base, done: false, kind: "line", vertices: [p(0, 0), p(1, 1)] },
    ]);
    expect(mark).toMatchObject({ dashed: true });
  });

  it("leaves out a shape with nothing to draw yet", () => {
    expect(
      imageMarksFor([
        { ...base, kind: "line", vertices: [p(0, 0)] },
        { ...base, kind: "circle", vertices: [p(0, 0)] },
        { ...base, kind: "polygon", vertices: [] },
      ]),
    ).toEqual([]);
  });

  it("draws a polygon of two positions as a line", () => {
    const [mark] = imageMarksFor([
      { ...base, done: false, kind: "polygon", vertices: [p(0, 0), p(1, 0)] },
    ]);
    expect(mark).toMatchObject({ closed: false, fill: false });
  });
});
