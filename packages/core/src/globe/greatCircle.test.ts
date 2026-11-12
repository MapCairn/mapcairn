// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import {
  centralAngle,
  densifyAlongGreatCircles,
  GLOBE_CHORD_TOLERANCE_PX,
  globeRadiusPixels,
  greatCircleInterpolate,
  greatCircleMidpoint,
  greatCirclePoints,
  greatCircleStepRadians,
  MAX_GREAT_CIRCLE_STEPS,
} from "./greatCircle";

const DEGREES = Math.PI / 180;
const LONDON = { lat: 51.5, lng: -0.1 };
const NEW_YORK = { lat: 40.7, lng: -74 };

describe("globeRadiusPixels", () => {
  it("is the world's width over 2π at the equator, in the 256 px convention", () => {
    expect(globeRadiusPixels(0, 0)).toBeCloseTo(256 / (2 * Math.PI), 9);
    expect(globeRadiusPixels(6, 0)).toBeCloseTo(2607.5946, 3);
  });

  it("grows by 1 / cos(latitude) so the centre matches the flat map, like MapLibre", () => {
    expect(globeRadiusPixels(4, 60)).toBeCloseTo(1303.7973, 3);
    expect(globeRadiusPixels(4, -60)).toBeCloseTo(1303.7973, 3);
  });

  it("stops growing at Mercator's last latitude", () => {
    expect(globeRadiusPixels(2, 89)).toBe(
      globeRadiusPixels(2, MAX_MERCATOR_LATITUDE),
    );
  });
});

describe("greatCircleStepRadians", () => {
  it("keeps the chord within half a pixel of the arc", () => {
    for (const zoom of [0, 4, 9, 12]) {
      const radius = globeRadiusPixels(zoom, 0);
      const step = greatCircleStepRadians(radius);
      expect(radius * (1 - Math.cos(step / 2))).toBeLessThanOrEqual(
        GLOBE_CHORD_TOLERANCE_PX,
      );
    }
  });

  it("is about 18 degrees for the whole world and a quarter of a degree at city zoom", () => {
    expect(
      greatCircleStepRadians(globeRadiusPixels(0, 0)) / DEGREES,
    ).toBeCloseTo(17.952, 3);
    expect(
      greatCircleStepRadians(globeRadiusPixels(6, 0)) / DEGREES,
    ).toBeCloseTo(2.244, 3);
    expect(
      greatCircleStepRadians(globeRadiusPixels(12, 0)) / DEGREES,
    ).toBeCloseTo(0.2805, 4);
  });

  it("never needs more than the step cap for half a turn while the globe is drawn", () => {
    const step = greatCircleStepRadians(globeRadiusPixels(13, 0));
    expect(Math.ceil(Math.PI / step)).toBe(908);
    expect(Math.ceil(Math.PI / step)).toBeLessThan(MAX_GREAT_CIRCLE_STEPS);
  });
});

describe("centralAngle", () => {
  it("measures the angle between two positions", () => {
    expect(centralAngle({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(
      Math.PI / 2,
      12,
    );
    expect(centralAngle(LONDON, NEW_YORK)).toBeCloseTo(0.874714, 6);
    expect(centralAngle(LONDON, LONDON)).toBe(0);
  });
});

describe("greatCirclePoints", () => {
  it("runs along the equator in equal steps", () => {
    const points = greatCirclePoints(
      { lat: 0, lng: 0 },
      { lat: 0, lng: 90 },
      10 * DEGREES,
    );
    expect(points).toHaveLength(10);
    points.forEach((point, index) => {
      expect(point.lat).toBeCloseTo(0, 9);
      expect(point.lng).toBeCloseTo(index * 10, 9);
    });
  });

  it("bows towards the pole, as a great circle does on a flat map", () => {
    const points = greatCirclePoints(LONDON, NEW_YORK, 0.1);
    expect(points[0]).toBe(LONDON);
    expect(points.at(-1)).toBe(NEW_YORK);
    expect(points).toHaveLength(10);
    const highest = Math.max(...points.map((point) => point.lat));
    expect(highest).toBeGreaterThan(52.3);
  });

  it("crosses the antimeridian the short way", () => {
    const points = greatCirclePoints(
      { lat: 10, lng: 170 },
      { lat: 10, lng: -170 },
      0.05,
    );
    expect(points).toHaveLength(8);
    for (const point of points.slice(1, -1)) {
      expect(Math.abs(point.lng)).toBeGreaterThan(170);
      expect(point.lat).toBeGreaterThan(10);
    }
    expect(points[3]?.lat).toBeCloseTo(10.14799, 5);
  });

  it("keeps a segment shorter than one step as it is", () => {
    const from = { lat: 1, lng: 1 };
    const to = { lat: 1.01, lng: 1.01 };
    expect(greatCirclePoints(from, to, 0.1)).toEqual([from, to]);
  });

  it("keeps a repeated or exactly opposite pair as it is", () => {
    const from = { lat: 10, lng: 20 };
    expect(greatCirclePoints(from, from, 0.01)).toEqual([from, from]);
    const opposite = { lat: -10, lng: -160 };
    expect(greatCirclePoints(from, opposite, 0.01)).toEqual([from, opposite]);
  });

  it("cuts a long segment into no more than the cap", () => {
    const points = greatCirclePoints(LONDON, NEW_YORK, 1e-9);
    expect(points).toHaveLength(MAX_GREAT_CIRCLE_STEPS + 1);
  });
});

describe("greatCircleInterpolate", () => {
  it("moves a fraction of the way along the great circle", () => {
    const quarter = greatCircleInterpolate(
      { lat: 0, lng: 0 },
      { lat: 0, lng: 80 },
      0.25,
    );
    expect(quarter.lat).toBeCloseTo(0, 12);
    expect(quarter.lng).toBeCloseTo(20, 9);
    const middle = greatCircleInterpolate(LONDON, NEW_YORK, 0.5);
    expect(middle.lat).toBeCloseTo(52.36255, 5);
  });

  it("stays put between a position and itself or its opposite", () => {
    const from = { lat: 10, lng: 20 };
    expect(greatCircleInterpolate(from, from, 0.5)).toBe(from);
    expect(greatCircleInterpolate(from, { lat: -10, lng: -160 }, 0.5)).toBe(
      from,
    );
  });
});

describe("greatCircleMidpoint", () => {
  it("lies on the great circle, north of both ends between London and New York", () => {
    const middle = greatCircleMidpoint(LONDON, NEW_YORK);
    expect(middle.lat).toBeCloseTo(52.36255, 5);
    expect(middle.lng).toBeCloseTo(-41.27571, 5);
  });

  it("crosses the antimeridian the short way", () => {
    const middle = greatCircleMidpoint(
      { lat: 10, lng: 170 },
      { lat: 10, lng: -170 },
    );
    expect(Math.abs(middle.lng)).toBeCloseTo(180, 9);
    expect(middle.lat).toBeGreaterThan(10);
  });

  it("falls back to the first of two opposite positions", () => {
    const from = { lat: 10, lng: 20 };
    expect(greatCircleMidpoint(from, { lat: -10, lng: -160 })).toBe(from);
  });
});

describe("densifyAlongGreatCircles", () => {
  const A = { lat: 0, lng: 0 };
  const B = { lat: 0, lng: 30 };
  const C = { lat: 30, lng: 30 };

  it("cuts each segment and records where every vertex went", () => {
    const { positions, vertices } = densifyAlongGreatCircles(
      [A, B, C],
      false,
      10 * DEGREES,
    );
    expect(vertices).toEqual([0, 3, 6]);
    expect(positions).toHaveLength(7);
    expect(positions[3]).toBe(B);
    expect(positions.at(-1)).toBe(C);
  });

  it("cuts the closing segment of a ring without repeating the first vertex", () => {
    const { positions, vertices } = densifyAlongGreatCircles(
      [A, B, C],
      true,
      10 * DEGREES,
    );
    expect(vertices).toEqual([0, 3, 6]);
    expect(positions.length).toBeGreaterThan(7);
    expect(positions.at(-1)).not.toBe(A);
    expect(positions.at(-1)?.lat).toBeLessThan(30);
  });

  it("does not close a path of two positions", () => {
    const { positions } = densifyAlongGreatCircles([A, B], true, 10 * DEGREES);
    expect(positions).toHaveLength(4);
  });

  it("returns nothing for nothing", () => {
    expect(densifyAlongGreatCircles([], true, 0.1)).toEqual({
      positions: [],
      vertices: [],
    });
  });
});
