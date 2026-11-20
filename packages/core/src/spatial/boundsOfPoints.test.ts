// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { boundsOfPoints } from "./boundsOfPoints";

describe("boundsOfPoints", () => {
  it("returns the smallest box holding every point", () => {
    expect(
      boundsOfPoints([
        { lat: -33.9, lng: 18.5 },
        { lat: -34.1, lng: 18.3 },
        { lat: -34.0, lng: 18.6 },
        { lat: -33.8, lng: 18.4 },
      ]),
    ).toEqual({ south: -34.1, west: 18.3, north: -33.8, east: 18.6 });
  });

  it("returns undefined for no points", () => {
    expect(boundsOfPoints([])).toBeUndefined();
  });

  it("clamps the box to valid latitudes", () => {
    expect(
      boundsOfPoints([
        { lat: -95, lng: 10 },
        { lat: 91, lng: 20 },
      ]),
    ).toEqual({ south: -90, west: 10, north: 90, east: 20 });
  });

  it("takes the short way across the antimeridian, so east passes 180", () => {
    expect(
      boundsOfPoints([
        { lat: -17.5, lng: 179.5 },
        { lat: -16.5, lng: -179.5 },
        { lat: -18, lng: 179 },
      ]),
    ).toEqual({ south: -18, west: 179, north: -16.5, east: 180.5 });
  });

  it("brings a longitude outside [-180, 180) back before it takes the box", () => {
    expect(
      boundsOfPoints([
        { lat: 0, lng: 190 },
        { lat: 1, lng: -170 },
      ]),
    ).toEqual({ south: 0, west: -170, north: 1, east: -170 });
  });

  it("keeps a box that touches 180 inside [-180, 180]", () => {
    expect(
      boundsOfPoints([
        { lat: 0, lng: 179 },
        { lat: 1, lng: 180 },
      ]),
    ).toEqual({ south: 0, west: 179, north: 1, east: 180 });
  });

  it("ignores points that are not finite numbers", () => {
    expect(
      boundsOfPoints([
        { lat: Number.NaN, lng: 1 },
        { lat: 1, lng: 2 },
        { lat: 3, lng: Number.POSITIVE_INFINITY },
      ]),
    ).toEqual({ south: 1, west: 2, north: 1, east: 2 });
    expect(boundsOfPoints([{ lat: Number.NaN, lng: 1 }])).toBeUndefined();
  });

  it("gives the same width for every tie between equal widest gaps", () => {
    const points = [0, 90, 180, 270].map((lng) => ({ lat: 0, lng }));
    const widths = [0, 45, 90, 135].map((turn) => {
      const bounds = boundsOfPoints(
        points.map(({ lat, lng }) => ({ lat, lng: lng + turn })),
      );
      return (bounds?.east ?? 0) - (bounds?.west ?? 0);
    });
    expect(widths).toEqual([270, 270, 270, 270]);
  });

  it("boxes two points exactly half the globe apart as half the globe", () => {
    const bounds = boundsOfPoints([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 180 },
    ]);
    expect((bounds?.east ?? 0) - (bounds?.west ?? 0)).toBe(180);
    const shifted = boundsOfPoints([
      { lat: 0, lng: 90 },
      { lat: 0, lng: -90 },
    ]);
    expect((shifted?.east ?? 0) - (shifted?.west ?? 0)).toBe(180);
  });

  it("keeps a narrow box across the antimeridian at non-integer longitudes", () => {
    const bounds = boundsOfPoints([
      { lat: 0, lng: 179.9 },
      { lat: 0, lng: -179.9 },
    ]);
    expect(bounds?.west).toBe(179.9);
    expect((bounds?.east ?? 0) - (bounds?.west ?? 0)).toBeCloseTo(0.2, 9);
  });

  it("gives the same box for longitudes a whole turn apart, and for a repeated point", () => {
    const spot = { lat: 5, lng: 179.7 };
    const expected = { south: 5, west: 179.7, north: 5, east: 179.7 };
    for (const turns of [-2, -1, 0, 1, 2]) {
      const bounds = boundsOfPoints([
        { lat: spot.lat, lng: spot.lng + 360 * turns },
        spot,
      ]);
      expect(bounds?.south).toBe(expected.south);
      expect(bounds?.west).toBeCloseTo(expected.west, 9);
      expect(bounds?.east).toBeCloseTo(expected.east, 9);
    }
  });
});
