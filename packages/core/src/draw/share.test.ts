// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  decodeShapes,
  encodeShapes,
  MAX_SHARE_LENGTH,
  MAX_SHARE_SHAPES,
  SHARE_PATTERN,
  unsharableShapes,
} from "./share";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

function done(
  partial: Pick<DrawShape, "kind" | "vertices"> &
    Partial<Pick<DrawShape, "radiusMetres">>,
  id = "shape-1",
): DrawShape {
  return { id, label: "Shape", done: true, ...partial };
}

const PARIS_POLYGON = done({
  kind: "polygon",
  vertices: [p(2.3522, 48.8566), p(2.3622, 48.8566), p(2.3572, 48.8666)],
});
const NAIROBI_CIRCLE = done({
  kind: "circle",
  vertices: [p(36.8219, -1.2921)],
  radiusMetres: 750,
});
const LINE = done({
  kind: "line",
  vertices: [p(-0.1276, 51.5072), p(-0.1176, 51.5172), p(-0.1076, 51.5072)],
});
const POINT = done({ kind: "point", vertices: [p(-74.006, 40.7128)] });

describe("encodeShapes and decodeShapes", () => {
  it("round-trips every kind to about a metre", () => {
    const text = encodeShapes([PARIS_POLYGON, NAIROBI_CIRCLE, LINE, POINT]);
    expect(text).not.toBeNull();
    const decoded = decodeShapes(text ?? "");
    expect(decoded?.map((shape) => shape.kind)).toEqual([
      "polygon",
      "circle",
      "line",
      "point",
    ]);
    const polygon = decoded?.[0];
    expect(polygon?.vertices).toHaveLength(3);
    polygon?.vertices.forEach((vertex, index) => {
      expect(vertex.lat).toBeCloseTo(
        PARIS_POLYGON.vertices[index]?.lat ?? 0,
        5,
      );
      expect(vertex.lng).toBeCloseTo(
        PARIS_POLYGON.vertices[index]?.lng ?? 0,
        5,
      );
    });
    expect(decoded?.[1]?.radiusMetres).toBe(750);
    expect(decoded?.[1]?.vertices[0]?.lat).toBeCloseTo(-1.2921, 5);
    expect(decoded?.[3]?.vertices[0]?.lng).toBeCloseTo(-74.006, 5);
  });

  it("uses only characters that are safe in a link", () => {
    const text = encodeShapes([PARIS_POLYGON, NAIROBI_CIRCLE, LINE, POINT]);
    expect(text).toMatch(SHARE_PATTERN);
    expect(text).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("is compact: a small polygon takes under 40 characters", () => {
    expect((encodeShapes([PARIS_POLYGON]) ?? "").length).toBeLessThan(40);
  });

  it("handles the extremes of the map", () => {
    const corner = done({
      kind: "line",
      vertices: [p(-180, -90), p(180, 90), p(0, 0)],
    });
    const decoded = decodeShapes(encodeShapes([corner]) ?? "");
    expect(decoded?.[0]?.vertices[0]).toEqual(p(-180, -90));
    expect(decoded?.[0]?.vertices[1]).toEqual(p(180, 90));
  });

  it("leaves out a draft and a shape that is not valid", () => {
    const draft = { ...PARIS_POLYGON, done: false };
    const broken = done({ kind: "polygon", vertices: [p(0, 0), p(1, 1)] });
    expect(encodeShapes([draft, broken, POINT])).toBe(encodeShapes([POINT]));
  });

  it("returns an empty string for nothing to share", () => {
    expect(encodeShapes([])).toBe("");
    expect(encodeShapes([{ ...POINT, done: false }])).toBe("");
  });

  it("refuses to share more than fits in a link, rather than cutting it short", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      done({ kind: "point", vertices: [p(index, index / 2)] }, `s${index}`),
    );
    expect(encodeShapes(many)).toBeNull();

    const long = done({
      kind: "line",
      vertices: Array.from({ length: 400 }, (_, index) =>
        p(index * 0.137, Math.sin(index) * 40),
      ),
    });
    expect(encodeShapes([long])).toBeNull();
  });

  it("allows as many shapes as the limit", () => {
    const some = Array.from({ length: MAX_SHARE_SHAPES }, (_, index) =>
      done({ kind: "point", vertices: [p(index * 0.001, 1)] }, `s${index}`),
    );
    expect((encodeShapes(some) ?? "").length).toBeLessThanOrEqual(
      MAX_SHARE_LENGTH,
    );
  });
});

describe("shapes a link cannot carry", () => {
  const circleOf = (radiusMetres: number) =>
    done(
      { kind: "circle", vertices: [p(36.8219, -1.2921)], radiusMetres },
      "c",
    );
  // Two positions under half a unit of 0.00001 degrees apart read back as one.
  const TINY_LINE = done({
    kind: "line",
    vertices: [p(10, 10), p(10.000002, 10.000002)],
  });
  const TINY_POLYGON = done({
    kind: "polygon",
    vertices: [p(10, 10), p(10.000003, 10), p(10, 10.000003)],
  });

  it("leaves a circle of under a metre out and says so", () => {
    for (const radius of [0.3, 0.5, 0.6, 0.99]) {
      expect(unsharableShapes([circleOf(radius)]), `radius ${radius}`).toEqual([
        circleOf(radius),
      ]);
      expect(encodeShapes([circleOf(radius)])).toBe("");
    }
    expect(unsharableShapes([circleOf(1), circleOf(2.4)])).toEqual([]);
  });

  it("leaves a line and a polygon that collapse when positions are whole units out", () => {
    expect(unsharableShapes([TINY_LINE, TINY_POLYGON, POINT])).toEqual([
      TINY_LINE,
      TINY_POLYGON,
    ]);
    expect(encodeShapes([TINY_LINE, TINY_POLYGON, POINT])).toBe(
      encodeShapes([POINT]),
    );
  });

  it("leaves out a shape with a position outside the world, which the link could not read back", () => {
    const outside = done({ kind: "point", vertices: [p(400, 95)] }, "o");
    expect(unsharableShapes([outside, POINT])).toEqual([outside]);
    expect(encodeShapes([outside, POINT])).toBe(encodeShapes([POINT]));
  });

  it("does not report a draft or a shape that was not valid to begin with", () => {
    const draft = { ...circleOf(0.3), done: false };
    const broken = done({ kind: "polygon", vertices: [p(0, 0), p(1, 1)] });
    expect(unsharableShapes([draft, broken, POINT])).toEqual([]);
  });

  it("keeps a link whole when a circle of 0.3 m is beside a normal shape", () => {
    const text = encodeShapes([circleOf(0.3), PARIS_POLYGON]);
    expect(decodeShapes(text ?? "")?.map((shape) => shape.kind)).toEqual([
      "polygon",
    ]);
  });

  it("counts the shapes it carries against the limit, not the ones it leaves out", () => {
    const carried = Array.from({ length: MAX_SHARE_SHAPES }, (_, index) =>
      done({ kind: "point", vertices: [p(index * 0.001, 1)] }, `s${index}`),
    );
    expect(encodeShapes([...carried, circleOf(0.3)])).toBe(
      encodeShapes(carried),
    );
  });
});

describe("decodeShapes with hostile input", () => {
  it("rejects text that is empty, too long or has characters outside the alphabet", () => {
    expect(decodeShapes("")).toBeNull();
    expect(decodeShapes("A".repeat(MAX_SHARE_LENGTH + 1))).toBeNull();
    expect(decodeShapes("p<script>")).toBeNull();
    expect(decodeShapes("p AAAA")).toBeNull();
    expect(decodeShapes("p%20")).toBeNull();
  });

  it("rejects an unknown kind and a truncated number", () => {
    expect(decodeShapes("x")).toBeNull();
    expect(decodeShapes("z.A")).toBeNull();
    // A continuation bit with nothing after it.
    expect(decodeShapes("pg")).toBeNull();
  });

  it("rejects numbers that run on without end", () => {
    expect(decodeShapes(`p${"g".repeat(50)}`)).toBeNull();
  });

  it("rejects coordinates outside the world", () => {
    const outside = encodeRaw("p", [95 * 1e5, 0]);
    expect(decodeShapes(outside)).toBeNull();
    expect(decodeShapes(encodeRaw("p", [0, 181 * 1e5]))).toBeNull();
  });

  it("rejects a shape with too few numbers, an odd count or a bad radius", () => {
    expect(decodeShapes("p")).toBeNull();
    expect(decodeShapes(encodeRaw("l", [1, 2, 3]))).toBeNull();
    expect(decodeShapes(encodeRaw("c", [0, 0, 0]))).toBeNull();
    expect(decodeShapes(encodeRaw("c", [0, 0, 20_000_000_000]))).toBeNull();
    expect(decodeShapes(encodeRaw("c", [0, 0]))).toBeNull();
  });

  it("skips a shape that fails validation and keeps the rest", () => {
    const text = `${encodeRaw("g", [0, 0, 100000, 100000])}.${encodeRaw("p", [100000, 200000])}`;
    const decoded = decodeShapes(text);
    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]?.kind).toBe("point");
  });

  it("keeps the other shapes when one in the text cannot be read", () => {
    const point = encodeRaw("p", [100000, 200000]);
    const bad = [
      // A circle with a radius of 0, a negative one and one over the largest.
      encodeRaw("c", [0, 0, 0]),
      encodeRaw("c", [0, 0, -4]),
      encodeRaw("c", [0, 0, 10_000_001]),
      // A circle outside the world, an unknown kind and a number cut short.
      encodeRaw("c", [95 * 1e5, 0, 5]),
      "x",
      "pg",
    ];
    for (const part of bad) {
      expect(decodeShapes(`${part}.${point}.${part}`), part).toEqual([
        { kind: "point", vertices: [p(2, 1)] },
      ]);
    }
  });

  it("rejects more shapes than the limit", () => {
    const text = Array.from({ length: MAX_SHARE_SHAPES + 1 }, () =>
      encodeRaw("p", [100000, 100000]),
    ).join(".");
    expect(decodeShapes(text)).toBeNull();
  });

  it("returns null when nothing in the text is valid", () => {
    expect(decodeShapes(encodeRaw("g", [0, 0, 1, 1]))).toBeNull();
  });

  it("is fast on the longest input it accepts", () => {
    const started = performance.now();
    decodeShapes("A".repeat(MAX_SHARE_LENGTH));
    decodeShapes("p".repeat(MAX_SHARE_LENGTH));
    decodeShapes(".".repeat(MAX_SHARE_LENGTH));
    expect(performance.now() - started).toBeLessThan(200);
  });
});

/** Writes a kind and raw numbers the way the encoder does, to build hostile input. */
function encodeRaw(kind: string, numbers: readonly number[]): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = kind;
  for (const value of numbers) {
    let rest = value < 0 ? -2 * value - 1 : 2 * value;
    do {
      const low = rest % 32;
      rest = Math.floor(rest / 32);
      out += alphabet[rest > 0 ? low + 32 : low];
    } while (rest > 0);
  }
  return out;
}

describe("shapes across the antimeridian", () => {
  it("round-trips a line from 170 E to 170 W exactly, longitudes untouched", () => {
    const line: DrawShape = {
      id: "a",
      kind: "line",
      label: "Line 1",
      done: true,
      vertices: [p(170, 10), p(-170, 10)],
    };
    const text = encodeShapes([line]);
    expect(text).toBe("lgkh9BgkztgBA_nm7gC");
    expect(decodeShapes(text ?? "")).toEqual([
      { kind: "line", vertices: [p(170, 10), p(-170, 10)] },
    ]);
  });
});
