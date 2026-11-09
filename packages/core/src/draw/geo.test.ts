import { describe, expect, it } from "vitest";
import {
  circleArea,
  circleCircumference,
  circleRing,
  destinationPoint,
  distanceMetres,
  EARTH_RADIUS_METRES,
  polygonSelfIntersects,
  ringSignedArea,
  verticesCollinear,
} from "./geo";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const NAIROBI = { lat: -1.2921, lng: 36.8219 };

describe("distanceMetres", () => {
  it("is zero between a point and itself", () => {
    expect(distanceMetres(PARIS, PARIS)).toBe(0);
  });

  it("measures one degree of latitude as about 111 km", () => {
    const metres = distanceMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(metres).toBeCloseTo((Math.PI * EARTH_RADIUS_METRES) / 180, 3);
  });

  it("is symmetric and plausible between two cities", () => {
    const there = distanceMetres(PARIS, NAIROBI);
    expect(there).toBeCloseTo(distanceMetres(NAIROBI, PARIS), 6);
    expect(there / 1000).toBeGreaterThan(6400);
    expect(there / 1000).toBeLessThan(6600);
  });
});

describe("destinationPoint", () => {
  it("goes north by a known distance", () => {
    const moved = destinationPoint(PARIS, 0, 10_000);
    expect(moved.lng).toBeCloseTo(PARIS.lng, 6);
    expect(distanceMetres(PARIS, moved)).toBeCloseTo(10_000, 3);
    expect(moved.lat).toBeGreaterThan(PARIS.lat);
  });

  it("round-trips with distanceMetres at any bearing", () => {
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const moved = destinationPoint(NAIROBI, bearing, 25_000);
      expect(distanceMetres(NAIROBI, moved)).toBeCloseTo(25_000, 2);
    }
  });

  it("wraps the longitude across the antimeridian", () => {
    const moved = destinationPoint({ lat: 0, lng: 179.9 }, 90, 50_000);
    expect(moved.lng).toBeGreaterThanOrEqual(-180);
    expect(moved.lng).toBeLessThan(0);
  });
});

describe("circleRing", () => {
  it("has the requested number of distinct points and is not closed", () => {
    const ring = circleRing(PARIS, 500, 24);
    expect(ring).toHaveLength(24);
    expect(ring[0]).not.toEqual(ring[23]);
  });

  it("keeps every point at the radius from the centre", () => {
    for (const point of circleRing(NAIROBI, 1200, 36)) {
      expect(distanceMetres(NAIROBI, point)).toBeCloseTo(1200, 2);
    }
  });

  it("starts due east and runs anticlockwise", () => {
    const ring = circleRing(PARIS, 1000, 8);
    expect(ring[0]?.lat).toBeCloseTo(PARIS.lat, 4);
    expect(ring[0]?.lng).toBeGreaterThan(PARIS.lng);
    expect(ring[2]?.lat).toBeGreaterThan(PARIS.lat);
    expect(ringSignedArea(ring)).toBeGreaterThan(0);
  });
});

describe("circle measures", () => {
  it("gives a small circle the flat area and circumference", () => {
    expect(circleArea(100) / (Math.PI * 100 * 100)).toBeCloseTo(1, 5);
    expect(circleCircumference(100) / (2 * Math.PI * 100)).toBeCloseTo(1, 6);
  });

  it("uses the spherical cap for a large circle", () => {
    const radius = 2_000_000;
    const flat = Math.PI * radius * radius;
    expect(circleArea(radius)).toBeLessThan(flat);
    expect(circleArea(radius)).toBeGreaterThan(flat * 0.95);
  });
});

describe("ringSignedArea", () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];

  it("is positive for an anticlockwise ring and negative for a clockwise one", () => {
    expect(ringSignedArea(square)).toBeGreaterThan(0);
    expect(ringSignedArea([...square].reverse())).toBeLessThan(0);
  });

  it("is zero for fewer than three points", () => {
    expect(ringSignedArea(square.slice(0, 2))).toBe(0);
  });
});

describe("verticesCollinear", () => {
  const p = (lng: number, lat: number) => ({ lat, lng });

  it("is true for points on one line, repeated points and fewer than three", () => {
    expect(verticesCollinear([p(0, 0), p(1, 1), p(2, 2)])).toBe(true);
    expect(verticesCollinear([p(1, 1), p(1, 1), p(1, 1)])).toBe(true);
    expect(verticesCollinear([p(0, 0), p(1, 1)])).toBe(true);
    expect(verticesCollinear([])).toBe(true);
  });

  it("is false once a point leaves the line", () => {
    expect(verticesCollinear([p(0, 0), p(1, 1), p(2, 3)])).toBe(false);
    expect(verticesCollinear([p(0, 0), p(0, 0), p(1, 0), p(1, 1)])).toBe(false);
  });
});

describe("polygonSelfIntersects", () => {
  const p = (lng: number, lat: number) => ({ lat, lng });

  it("accepts a triangle and a square", () => {
    expect(polygonSelfIntersects([p(0, 0), p(1, 0), p(0, 1)])).toBe(false);
    expect(polygonSelfIntersects([p(0, 0), p(2, 0), p(2, 2), p(0, 2)])).toBe(
      false,
    );
  });

  it("accepts a concave polygon", () => {
    expect(
      polygonSelfIntersects([p(0, 0), p(4, 0), p(4, 4), p(2, 1), p(0, 4)]),
    ).toBe(false);
  });

  it("rejects a bow tie", () => {
    expect(polygonSelfIntersects([p(0, 0), p(2, 2), p(2, 0), p(0, 2)])).toBe(
      true,
    );
  });

  it("rejects the closing edge crossing an earlier edge", () => {
    expect(
      polygonSelfIntersects([p(0, 0), p(4, 0), p(4, 2), p(1, 2), p(1, -1)]),
    ).toBe(true);
  });

  it("rejects an endpoint that touches another edge", () => {
    expect(
      polygonSelfIntersects([p(0, 0), p(4, 0), p(4, 4), p(2, 0), p(0, 4)]),
    ).toBe(true);
  });

  it("rejects a repeated vertex that makes the ring touch itself", () => {
    expect(
      polygonSelfIntersects([p(0, 0), p(2, 0), p(1, 1), p(2, 0), p(2, 2)]),
    ).toBe(true);
  });

  it("rejects collinear edges that overlap", () => {
    expect(polygonSelfIntersects([p(0, 0), p(4, 0), p(2, 0), p(2, 3)])).toBe(
      true,
    );
  });

  it("rejects a closing edge that doubles back over the first edge", () => {
    expect(polygonSelfIntersects([p(0, 0), p(4, 0), p(4, 3), p(2, 0)])).toBe(
      true,
    );
  });

  it("accepts collinear edges that only continue each other", () => {
    expect(polygonSelfIntersects([p(0, 0), p(2, 0), p(4, 0), p(2, 3)])).toBe(
      false,
    );
  });

  it("has nothing to cross with fewer than three vertices", () => {
    expect(polygonSelfIntersects([p(0, 0), p(1, 1)])).toBe(false);
  });
});
