// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LatLng } from "../ports/geometry";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { formatMgrs } from "./mgrs";
import { parseCoordinates } from "./parseCoordinates";
import { formatUtm } from "./utm";

/*
 * The round trip must also hold for a longitude that rounds across the
 * antimeridian, and for the way a one-metre reference is angularly very
 * wide near the poles, so longitudes are compared the short way round and
 * the round trip is judged in metres, not degrees.
 */

/** The distance between two longitudes, in degrees, the short way round. */
function degreesApart(first: number, second: number): number {
  return Math.abs(((((first - second) % 360) + 540) % 360) - 180);
}

/** How far apart two positions are, in metres, on the larger of the two axes. */
function metresApart(first: LatLng, second: LatLng): number {
  const north = Math.abs(first.lat - second.lat) * 111_320;
  const east =
    degreesApart(first.lng, second.lng) *
    111_320 *
    Math.cos((second.lat * Math.PI) / 180);
  return Math.max(north, east);
}

const LAT = fc.integer({ min: -800_000_000, max: 840_000_000 });
const LNG = fc.integer({ min: -1_800_000_000, max: 1_799_999_999 });

const FRAGMENTS = [
  "31",
  "U",
  "CT",
  "12345",
  "67890",
  " ",
  "N",
  "X",
  "V",
  "AB",
  "0",
  "500000",
  "0000000",
];

describe("UTM and MGRS properties", () => {
  it("reads back any position written as a UTM reference", () => {
    fc.assert(
      fc.property(LAT, LNG, (lat, lng) => {
        const position = { lat: lat / 1e7, lng: lng / 1e7 };
        const text = formatUtm(position);
        expect(text).not.toBeNull();
        const parsed = parseCoordinates(text as string);
        expect(parsed).not.toBeNull();
        expect(metresApart(parsed as LatLng, position)).toBeLessThan(2);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads back any position written as an MGRS reference", () => {
    fc.assert(
      fc.property(LAT, LNG, (lat, lng) => {
        const position = { lat: lat / 1e7, lng: lng / 1e7 };
        const text = formatMgrs(position);
        expect(text).not.toBeNull();
        const parsed = parseCoordinates(text as string);
        expect(parsed).not.toBeNull();
        expect(metresApart(parsed as LatLng, position)).toBeLessThan(2);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses to format exactly the latitudes outside the UTM grid", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -900_000_000, max: 900_000_000 }),
        LNG,
        (lat, lng) => {
          const position = { lat: lat / 1e7, lng: lng / 1e7 };
          const outside = position.lat > 84 || position.lat < -80;
          expect(formatUtm(position) === null).toBe(outside);
          expect(formatMgrs(position) === null).toBe(outside);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("never writes zones 32, 34 and 36 in band X", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 720_000_000, max: 840_000_000 }),
        LNG,
        (lat, lng) => {
          const text = formatMgrs({ lat: lat / 1e7, lng: lng / 1e7 }) as string;
          const zone = Number(text.slice(0, 2));
          expect([32, 34, 36]).not.toContain(zone);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("never throws on hostile fragments, and answers in range", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          hostileText,
          textFromFragments(FRAGMENTS),
          fc
            .constantFrom(...FRAGMENTS)
            .chain((fragment) => repeatedFragment(fragment)),
          fc.string({ maxLength: 120 }),
        ),
        (text) => {
          const position = parseCoordinates(text);
          if (position !== null) {
            expect(Math.abs(position.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(position.lng)).toBeLessThanOrEqual(180);
          }
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});
