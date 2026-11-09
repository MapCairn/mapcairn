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

  it("clamps the box to valid latitudes and longitudes", () => {
    expect(
      boundsOfPoints([
        { lat: -95, lng: -200 },
        { lat: 91, lng: 190 },
      ]),
    ).toEqual({ south: -90, west: -180, north: 90, east: 180 });
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
});
