import { describe, expect, it } from "vitest";
import {
  CIRCLE_EXPORT_STEPS,
  MAX_CIRCLE_RADIUS_METRES,
  measureShape,
  shapeLabel,
  shapeRing,
  validateShape,
} from "./shape";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

function shape(partial: Partial<DrawShape> & Pick<DrawShape, "kind">) {
  return {
    id: "s1",
    label: "Shape 1",
    done: true,
    vertices: [],
    ...partial,
  } satisfies DrawShape;
}

describe("validateShape", () => {
  it("accepts a point", () => {
    expect(
      validateShape(shape({ kind: "point", vertices: [p(2.35, 48.85)] })),
    ).toBeNull();
  });

  it("needs two vertices for a line and rejects a line of one repeated place", () => {
    expect(validateShape(shape({ kind: "line", vertices: [p(1, 1)] }))).toBe(
      "too-few-vertices",
    );
    expect(
      validateShape(shape({ kind: "line", vertices: [p(1, 1), p(1, 1)] })),
    ).toBe("degenerate");
    expect(
      validateShape(shape({ kind: "line", vertices: [p(1, 1), p(2, 2)] })),
    ).toBeNull();
  });

  it("lets a line cross itself", () => {
    expect(
      validateShape(
        shape({
          kind: "line",
          vertices: [p(0, 0), p(2, 2), p(2, 0), p(0, 2)],
        }),
      ),
    ).toBeNull();
  });

  it("needs three vertices for a polygon", () => {
    expect(
      validateShape(shape({ kind: "polygon", vertices: [p(0, 0), p(1, 1)] })),
    ).toBe("too-few-vertices");
  });

  it("rejects a polygon whose edges cross, and one with no area", () => {
    expect(
      validateShape(
        shape({
          kind: "polygon",
          vertices: [p(0, 0), p(2, 2), p(2, 0), p(0, 2)],
        }),
      ),
    ).toBe("self-intersecting");
    expect(
      validateShape(
        shape({ kind: "polygon", vertices: [p(0, 0), p(1, 1), p(2, 2)] }),
      ),
    ).toBe("degenerate");
  });

  it("accepts a triangle", () => {
    expect(
      validateShape(
        shape({ kind: "polygon", vertices: [p(0, 0), p(1, 0), p(0, 1)] }),
      ),
    ).toBeNull();
  });

  it("needs a circle to have a positive radius within the limit", () => {
    const base = { kind: "circle", vertices: [p(2.35, 48.85)] } as const;
    expect(validateShape(shape(base))).toBe("radius-missing");
    expect(validateShape(shape({ ...base, radiusMetres: 0 }))).toBe(
      "degenerate",
    );
    expect(validateShape(shape({ ...base, radiusMetres: 250 }))).toBeNull();
    expect(
      validateShape(
        shape({ ...base, radiusMetres: MAX_CIRCLE_RADIUS_METRES + 1 }),
      ),
    ).toBe("radius-too-large");
  });

  it("rejects non-finite coordinates", () => {
    expect(
      validateShape(shape({ kind: "point", vertices: [p(Number.NaN, 1)] })),
    ).toBe("degenerate");
  });
});

describe("shapeRing", () => {
  it("is the vertices of a polygon", () => {
    const vertices = [p(0, 0), p(1, 0), p(0, 1)];
    expect(shapeRing(shape({ kind: "polygon", vertices }))).toEqual(vertices);
  });

  it("is a ring around a circle, or empty before it has a radius", () => {
    const centre = p(36.82, -1.29);
    expect(shapeRing(shape({ kind: "circle", vertices: [centre] }))).toEqual(
      [],
    );
    expect(
      shapeRing(
        shape({ kind: "circle", vertices: [centre], radiusMetres: 300 }),
      ),
    ).toHaveLength(CIRCLE_EXPORT_STEPS);
  });

  it("is empty for a point or a line", () => {
    expect(
      shapeRing(shape({ kind: "line", vertices: [p(0, 0), p(1, 1)] })),
    ).toEqual([]);
  });
});

describe("measureShape", () => {
  it("measures nothing for a point", () => {
    expect(measureShape(shape({ kind: "point", vertices: [p(1, 1)] }))).toEqual(
      {
        areaMetres: null,
        lengthMetres: null,
      },
    );
  });

  it("measures a line's length, and nothing until it has two vertices", () => {
    expect(
      measureShape(shape({ kind: "line", vertices: [p(2.35, 48.85)] }))
        .lengthMetres,
    ).toBeNull();
    const length = measureShape(
      shape({ kind: "line", vertices: [p(0, 0), p(0, 1)] }),
    ).lengthMetres;
    expect(length).toBeCloseTo(111_195, -2);
  });

  it("measures a polygon's area and perimeter", () => {
    const measure = measureShape(
      shape({
        kind: "polygon",
        vertices: [p(0, 0), p(0.01, 0), p(0.01, 0.01), p(0, 0.01)],
      }),
    );
    expect(measure.areaMetres).toBeGreaterThan(1_200_000);
    expect(measure.areaMetres).toBeLessThan(1_300_000);
    expect(measure.lengthMetres).toBeCloseTo(4 * 1112, -1);
  });

  it("gives a polygon draft of two vertices a length and no area", () => {
    const measure = measureShape(
      shape({
        kind: "polygon",
        done: false,
        vertices: [p(0, 0), p(0, 0.01)],
      }),
    );
    expect(measure.areaMetres).toBeNull();
    expect(measure.lengthMetres).toBeGreaterThan(1000);
  });

  it("measures a circle with the spherical cap area and circumference", () => {
    const measure = measureShape(
      shape({ kind: "circle", vertices: [p(2.35, 48.85)], radiusMetres: 1000 }),
    );
    expect(measure.areaMetres).toBeCloseTo(Math.PI * 1000 ** 2, -3);
    expect(measure.lengthMetres).toBeCloseTo(2 * Math.PI * 1000, 0);
  });

  it("measures a circle with no radius as nothing", () => {
    expect(
      measureShape(shape({ kind: "circle", vertices: [p(0, 0)] })),
    ).toEqual({ areaMetres: null, lengthMetres: null });
  });
});

describe("shapeLabel", () => {
  it("names a shape by its kind and number", () => {
    expect(shapeLabel("polygon", 2)).toBe("Polygon 2");
    expect(shapeLabel("point", 1)).toBe("Point 1");
    expect(shapeLabel("line", 3)).toBe("Line 3");
    expect(shapeLabel("circle", 4)).toBe("Circle 4");
  });
});

describe("a polygon across the antimeridian", () => {
  const across: DrawShape = {
    id: "a",
    kind: "polygon",
    label: "Polygon 1",
    done: true,
    vertices: [p(170, 0), p(-170, 0), p(-170, 10), p(170, 10)],
  };

  it("is accepted", () => {
    expect(validateShape(across)).toBeNull();
  });

  it("measures the short way round, like the same box elsewhere", () => {
    const elsewhere = measureShape({
      ...across,
      vertices: [p(10, 0), p(30, 0), p(30, 10), p(10, 10)],
    });
    const measured = measureShape(across);
    expect(measured.areaMetres).toBeCloseTo(elsewhere.areaMetres ?? 0, -3);
    expect(measured.lengthMetres).toBeCloseTo(elsewhere.lengthMetres ?? 0, 3);
  });
});
