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
});
