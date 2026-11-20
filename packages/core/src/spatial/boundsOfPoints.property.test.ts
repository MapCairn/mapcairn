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
const MIN_POINTS = 2;
const MAX_POINTS = 8;
const FULL_TURN = 360;

/** How close two longitudes are, counting the turn of the globe. */
function longitudeGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % FULL_TURN;
  return Math.min(gap, FULL_TURN - gap);
}

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

  it("keeps the width, the distances and the fit when the set is shifted across the antimeridian", () => {
    fc.assert(
      fc.property(offsets, centres, (spread, centre) => {
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
        expect(
          longitudeGap(
            shiftedView.center.lng,
            referenceView.center.lng + centre,
          ),
        ).toBeLessThan(1e-9);
      }),
      PROPERTY_PARAMETERS,
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
