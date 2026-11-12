// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Position } from "geojson";
import { describe, expect, it } from "vitest";
import { measureLineDistance, measurePolygonArea } from "./measurement";

describe("measureLineDistance", () => {
  it("returns null for fewer than two positions", () => {
    expect(measureLineDistance([])).toBeNull();
    expect(measureLineDistance([[28.0, -26.0]])).toBeNull();
  });

  it("returns the distance in kilometres along a two-point line", () => {
    const positions: Position[] = [
      [28.0, -26.0],
      [28.0, -25.99],
    ];

    expect(measureLineDistance(positions)).toBeCloseTo(1.11, 1);
  });

  it("sums distance across every segment of a multi-point line", () => {
    const positions: Position[] = [
      [28.0, -26.0],
      [28.0, -25.99],
      [28.01, -25.99],
    ];

    const twoSegment = measureLineDistance(positions);
    const oneSegment = measureLineDistance(positions.slice(0, 2));

    expect(twoSegment).toBeGreaterThan(oneSegment);
  });
});

describe("measurePolygonArea", () => {
  it("measures an area across the antimeridian the short way, as it measures one anywhere else", () => {
    const across = measurePolygonArea([
      [170, 0],
      [-170, 0],
      [-170, 10],
      [170, 10],
    ]);
    const elsewhere = measurePolygonArea([
      [10, 0],
      [30, 0],
      [30, 10],
      [10, 10],
    ]);
    // Twenty degrees by ten at the equator: about 2.46 million square kilometres.
    expect(elsewhere).toBeCloseTo(2.460_333_6e12, -7);
    expect(across).toBeCloseTo(elsewhere ?? 0, -3);
  });

  it("returns null for fewer than three positions", () => {
    expect(measurePolygonArea([])).toBeNull();
    expect(
      measurePolygonArea([
        [28.0, -26.0],
        [28.01, -26.0],
      ]),
    ).toBeNull();
  });

  it("returns the area in square metres of a closed ring, without requiring the caller to close it", () => {
    const positions: Position[] = [
      [28.0, -26.0],
      [28.01, -26.0],
      [28.01, -25.99],
      [28.0, -25.99],
    ];

    const area = measurePolygonArea(positions);

    expect(area).toBeGreaterThan(0);
    expect(area).toBeCloseTo(1_111_347, -3);
  });

  it("gives the same area whether or not the caller already closed the ring", () => {
    const open: Position[] = [
      [28.0, -26.0],
      [28.01, -26.0],
      [28.01, -25.99],
      [28.0, -25.99],
    ];
    const closed: Position[] = [...open, open[0] as Position];

    expect(measurePolygonArea(open)).toBeCloseTo(measurePolygonArea(closed), 6);
  });
});
