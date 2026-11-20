// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeMapAdapter, FakeMapHost } from "../fakes/FakeMapAdapter";
import { FAKE_RASTER_BASEMAP } from "../fakes/fixtures";
import { wrapLongitude } from "../globe/longitude";
import type { LatLng } from "../ports/geometry";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { boundsOfPoints } from "./boundsOfPoints";
import { measureLineDistance } from "./measurement";

/** The widest a generated set reaches either side of its centre, so a set is under half the world wide and its short way is unambiguous. */
const MAX_OFFSET_DEGREES = 60;
const MAX_LATITUDE_DEGREES = 60;
/** How far two longitudes may differ and still be the same place, as `GAP_EPSILON` in `boundsOfPaths`. */
const LONGITUDE_TOLERANCE_DEGREES = 1e-9;
const MIN_POINTS = 2;
const MAX_POINTS = 8;

const offsets = fc.array(
  fc.record({
    lat: fc.double({
      min: -MAX_LATITUDE_DEGREES,
      max: MAX_LATITUDE_DEGREES,
      noNaN: true,
    }),
    lng: fc.double({
      min: -MAX_OFFSET_DEGREES,
      max: MAX_OFFSET_DEGREES,
      noNaN: true,
    }),
  }),
  { minLength: MIN_POINTS, maxLength: MAX_POINTS },
);

/** A centre longitude anywhere, with a bias to land on and near the antimeridian. */
const centres = fc.oneof(
  fc.double({ min: -180, max: 180, noNaN: true }),
  fc.double({ min: 150, max: 180, noNaN: true }),
  fc.double({ min: -180, max: -150, noNaN: true }),
);

function placeAt(centre: number, spread: readonly LatLng[]): LatLng[] {
  return spread.map(({ lat, lng }) => ({
    lat,
    lng: wrapLongitude(centre + lng),
  }));
}

describe("boundsOfPoints, wherever a set of points sits on the globe", () => {
  const adapter = new FakeMapAdapter();

  beforeAll(async () => {
    await adapter.mount(new FakeMapHost(800, 600), {
      basemap: FAKE_RASTER_BASEMAP,
      view: { center: { lat: 0, lng: 0 }, zoom: 2, bearing: 0 },
    });
  });

  /** The same checks the property makes, so a counterexample can be kept as a fixed case. */
  function expectShiftKeepsTheFit(
    spread: readonly LatLng[],
    centre: number,
  ): void {
    const reference = placeAt(0, spread);
    const shifted = placeAt(centre, spread);
    const referenceBounds = boundsOfPoints(reference);
    const shiftedBounds = boundsOfPoints(shifted);
    if (!referenceBounds || !shiftedBounds) {
      throw new Error("A finite set has bounds.");
    }
    const width = (bounds: { west: number; east: number }) =>
      bounds.east - bounds.west;
    expect(width(shiftedBounds)).toBeCloseTo(width(referenceBounds), 9);

    const line = (points: LatLng[]) =>
      measureLineDistance(points.map(({ lng, lat }) => [lng, lat]));
    expect(line(shifted)).toBeCloseTo(line(reference) as number, 6);

    adapter.fitBounds(referenceBounds, { animate: false });
    const referenceView = adapter.getView();
    adapter.fitBounds(shiftedBounds, { animate: false });
    const shiftedView = adapter.getView();
    expect(shiftedView.zoom).toBeCloseTo(referenceView.zoom, 9);
    expect(shiftedView.center.lng).toBeGreaterThanOrEqual(-180);
    expect(shiftedView.center.lng).toBeLessThan(180);
    // Compare round the circle: 180 less a rounding error and -180 are one place.
    expect(
      Math.abs(
        wrapLongitude(
          shiftedView.center.lng - (referenceView.center.lng + centre),
        ),
      ),
    ).toBeLessThan(LONGITUDE_TOLERANCE_DEGREES);
  }

  it("keeps the width, the distances and the fit when the set is shifted across the antimeridian", () => {
    fc.assert(
      fc.property(offsets, centres, (spread, centre) => {
        expectShiftKeepsTheFit(spread, centre);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("keeps the fit when the middle of the box lands within rounding of the antimeridian", () => {
    // A set 120 wide, centred 150 east: its middle is 180 on one side and
    // 180 less a rounding error on the other, which wrap to opposite ends.
    expectShiftKeepsTheFit(
      [
        { lat: -59.99999999999993, lng: -3e-323 },
        { lat: 6.4e-323, lng: 59.9999999999999 },
        { lat: 0, lng: -9.80335238116569e-20 },
      ],
      150.00000000000003,
    );
  });

  it("holds every point inside the box it returns", () => {
    fc.assert(
      fc.property(offsets, centres, (spread, centre) => {
        const points = placeAt(centre, spread);
        const bounds = boundsOfPoints(points);
        if (!bounds) {
          throw new Error("A finite set has bounds.");
        }
        for (const { lng } of points) {
          const east = wrapLongitude(lng - bounds.west);
          expect(east).toBeLessThanOrEqual(bounds.east - bounds.west + 1e-9);
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
