// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import { boundsAroundPoint } from "./boundsAroundPoint";
import { measureLineDistance } from "./measurement";

function distanceMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return (
    (measureLineDistance([
      [a.lng, a.lat],
      [b.lng, b.lat],
    ]) ?? 0) * 1000
  );
}

describe("boundsAroundPoint", () => {
  it("is a box reaching the radius north, south, east and west of the centre", () => {
    const centre = { lat: -33.92, lng: 18.42 };
    const box = boundsAroundPoint(centre, 1000);
    const north = { lat: box.north, lng: centre.lng };
    const south = { lat: box.south, lng: centre.lng };
    const east = { lat: centre.lat, lng: box.east };
    const west = { lat: centre.lat, lng: box.west };
    for (const edge of [north, south, east, west]) {
      expect(distanceMetres(centre, edge)).toBeCloseTo(1000, -1);
    }
    expect(box.north + box.south).toBeCloseTo(2 * centre.lat, 9);
    expect(box.east + box.west).toBeCloseTo(2 * centre.lng, 9);
  });

  it("is wider in degrees of longitude away from the equator", () => {
    const equator = boundsAroundPoint({ lat: 0, lng: 0 }, 5000);
    const north = boundsAroundPoint({ lat: 60, lng: 0 }, 5000);
    expect(north.east - north.west).toBeCloseTo(
      2 * (equator.east - equator.west),
      3,
    );
  });

  it("collapses to the point for no radius, or a radius that is not a number", () => {
    const centre = { lat: 10, lng: 20 };
    const point = { south: 10, west: 20, north: 10, east: 20 };
    expect(boundsAroundPoint(centre, 0)).toEqual(point);
    expect(boundsAroundPoint(centre, -5)).toEqual(point);
    expect(boundsAroundPoint(centre, Number.NaN)).toEqual(point);
  });

  it("stays inside the Web Mercator world near the poles and the antimeridian", () => {
    const box = boundsAroundPoint({ lat: 89.9, lng: 179.99 }, 50_000);
    expect(box.north).toBe(MAX_MERCATOR_LATITUDE);
    expect(box.south).toBeLessThan(MAX_MERCATOR_LATITUDE);
    expect(box.east).toBe(180);
    expect(box.west).toBeGreaterThanOrEqual(-180);
    expect(Number.isFinite(box.west)).toBe(true);
  });
});
