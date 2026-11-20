// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { wrapLongitude } from "../globe/longitude";
import type { LatLng } from "../ports/geometry";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { boundsOfPaths } from "./boundsOfPaths";

function path(...pairs: [lng: number, lat: number][]): LatLng[] {
  return pairs.map(([lng, lat]) => ({ lng, lat }));
}

describe("boundsOfPaths", () => {
  it("returns undefined when there are no paths or no usable points", () => {
    expect(boundsOfPaths([])).toBeUndefined();
    expect(boundsOfPaths([[]])).toBeUndefined();
    expect(
      boundsOfPaths([
        [
          { lat: Number.NaN, lng: 1 },
          { lat: 1, lng: Number.POSITIVE_INFINITY },
        ],
      ]),
    ).toBeUndefined();
  });

  it("boxes a single point as itself", () => {
    expect(boundsOfPaths([path([10, 20])])).toEqual({
      south: 20,
      west: 10,
      north: 20,
      east: 10,
    });
  });

  it("clamps latitudes to valid coordinates", () => {
    expect(boundsOfPaths([path([0, -95], [10, 95])])).toMatchObject({
      south: -90,
      north: 90,
    });
  });

  it("fits a path that stays on one side of the antimeridian to plain minima and maxima", () => {
    expect(boundsOfPaths([path([-10, 5], [30, -5], [20, 40])])).toEqual({
      south: -5,
      west: -10,
      north: 40,
      east: 30,
    });
  });

  it("keeps the short box for a Fiji-sized feature across the antimeridian", () => {
    const ring = path(
      [177, -19],
      [180, -16],
      [-179, -17],
      [-179, -19],
      [177, -19],
    );
    expect(boundsOfPaths([ring])).toEqual({
      south: -19,
      west: 177,
      north: -16,
      east: 181,
    });
  });

  it("fits a sparse polygon wider than half the globe to its true extent", () => {
    // Three vertices 120 degrees apart: every edge is 120 degrees and, taken
    // the short way, together they cover the whole circle. A box from the
    // vertices alone would stop at one of the 120 degree gaps.
    const triangle = path([0, 10], [120, 10], [-120, 10], [0, 10]);
    expect(boundsOfPaths([triangle])).toEqual({
      south: 10,
      west: -180,
      north: 10,
      east: 180,
    });
  });

  it("fits a sparse wide line to the arcs it covers, not to the widest gap between vertices", () => {
    // 0 to 100 to 200 (-160): two 100 degree edges cover 0 to 200.
    expect(boundsOfPaths([path([0, 0], [100, 0], [-160, 5])])).toEqual({
      south: 0,
      west: 0,
      north: 5,
      east: 200,
    });
  });

  it("takes an edge of exactly half the globe eastward, as it is drawn and measured", () => {
    const covered = { south: 0, north: 0 };
    expect(boundsOfPaths([path([0, 0], [180, 0])])).toEqual({
      ...covered,
      west: 0,
      east: 180,
    });
    expect(boundsOfPaths([path([180, 0], [0, 0])])).toEqual({
      ...covered,
      west: 180 - 360,
      east: 0 + 0,
    });
  });

  it("covers the whole circle for a wide ring with non-integer longitudes", () => {
    expect(
      boundsOfPaths([path([0.1, 0], [120.1, 0], [-119.9, 0], [0.1, 0])]),
    ).toEqual({
      south: 0,
      west: -180,
      north: 0,
      east: 180,
    });
  });

  it("covers a polygon around a pole with the whole circle of longitude", () => {
    const ring = path(
      [-180, 80],
      [-90, 80],
      [0, 80],
      [90, 80],
      [180, 80],
      [180, 90],
      [-180, 90],
      [-180, 80],
    );
    expect(boundsOfPaths([ring])).toEqual({
      south: 80,
      west: -180,
      north: 90,
      east: 180,
    });
  });

  it("holds a line that crosses the antimeridian twice", () => {
    // 170 east to -170 (across), back to 175 (across again).
    const line = path([170, 0], [-170, 10], [175, 20]);
    expect(boundsOfPaths([line])).toEqual({
      south: 0,
      west: 170,
      north: 20,
      east: 190,
    });
  });

  it("joins separate paths without drawing an edge between them", () => {
    const west = path([-100, 0], [-90, 0]);
    const east = path([90, 0], [100, 0]);
    // Alone the two are 190 degrees apart the long way and 170 the short way
    // across the antimeridian; only the two paths themselves are covered.
    expect(boundsOfPaths([west, east])).toEqual({
      south: 0,
      west: 90,
      north: 0,
      east: 270,
    });
  });

  it("ignores points that are not finite", () => {
    expect(
      boundsOfPaths([
        [...path([0, 0]), { lat: Number.NaN, lng: 50 }, ...path([10, 10])],
      ]),
    ).toEqual({ south: 0, west: 0, north: 10, east: 10 });
  });
});

const TOLERANCE = 1e-9;

/** True when `lng` lies in the run going east from `west` to `east`, give or take rounding. */
function insideRun(lng: number, west: number, east: number): boolean {
  const offset = (((lng - west) % 360) + 360) % 360;
  const rounding = Math.min(offset, 360 - offset) <= TOLERANCE;
  return rounding || offset <= east - west + TOLERANCE;
}

const coordinates = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true }),
});
const paths = fc.array(fc.array(coordinates, { minLength: 1, maxLength: 6 }), {
  minLength: 1,
  maxLength: 3,
});

describe("boundsOfPaths, for any set of paths", () => {
  it("holds every vertex and every edge taken the short way", () => {
    fc.assert(
      fc.property(paths, (set) => {
        const bounds = boundsOfPaths(set);
        if (!bounds) {
          throw new Error("A finite set has bounds.");
        }
        expect(bounds.west).toBeGreaterThanOrEqual(-180);
        expect(bounds.west).toBeLessThan(180);
        expect(bounds.east).toBeGreaterThanOrEqual(bounds.west);
        expect(bounds.east - bounds.west).toBeLessThanOrEqual(360);
        for (const line of set) {
          line.forEach((point, index) => {
            expect(insideRun(point.lng, bounds.west, bounds.east)).toBe(true);
            expect(point.lat).toBeGreaterThanOrEqual(bounds.south);
            expect(point.lat).toBeLessThanOrEqual(bounds.north);
            const next = line[index + 1];
            if (!next) {
              return;
            }
            const turn = wrapLongitude(next.lng - point.lng);
            const step = turn === -180 ? 180 : turn;
            for (let part = 1; part < 10; part += 1) {
              const lng = point.lng + (step * part) / 10;
              expect(insideRun(lng, bounds.west, bounds.east)).toBe(true);
            }
          });
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

const wholeDegrees = fc.array(
  fc.array(fc.integer({ min: -180, max: 180 }), { minLength: 1, maxLength: 6 }),
  { minLength: 1, maxLength: 3 },
);

/**
 * The width a set of whole-degree paths must have, counted a different way:
 * mark every whole degree a vertex or an edge reaches and every one-degree
 * cell an edge covers (an edge of exactly half the globe goes eastward). The
 * width is the circle less the longest run between two marked degrees that no
 * edge covers.
 */
function expectedWidth(set: readonly (readonly number[])[]): number {
  const degree = (lng: number) => (((lng + 180) % 360) + 360) % 360;
  const reached = new Array<boolean>(360).fill(false);
  const cellCovered = new Array<boolean>(360).fill(false);
  for (const line of set) {
    line.forEach((from, index) => {
      reached[degree(from)] = true;
      const to = line[index + 1];
      if (to === undefined) {
        return;
      }
      const turn = ((((to - from + 180) % 360) + 360) % 360) - 180;
      const step = turn === -180 ? 180 : turn;
      const start = step >= 0 ? from : to;
      for (let offset = 0; offset < Math.abs(step); offset += 1) {
        cellCovered[degree(start + offset)] = true;
        reached[degree(start + offset + 1)] = true;
      }
    });
  }
  const marked = reached.flatMap((hit, at) => (hit ? [at] : []));
  let widest = 0;
  marked.forEach((at, index) => {
    const next = marked[(index + 1) % marked.length] as number;
    const distance = (next - at + 360) % 360 || 360;
    const gap = distance === 1 && cellCovered[at] ? 0 : distance;
    widest = Math.max(widest, gap);
  });
  return 360 - widest;
}

describe("boundsOfPaths, for whole-degree paths", () => {
  it("is no wider than the edges and vertices need", () => {
    fc.assert(
      fc.property(wholeDegrees, (set) => {
        const bounds = boundsOfPaths(
          set.map((line) => line.map((lng) => ({ lat: 0, lng }))),
        );
        if (!bounds) {
          throw new Error("A finite set has bounds.");
        }
        expect(bounds.east - bounds.west).toBe(expectedWidth(set));
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
