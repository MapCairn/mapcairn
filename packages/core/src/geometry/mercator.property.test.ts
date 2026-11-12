// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import {
  WEB_MERCATOR_HALF_WORLD,
  webMercatorToWgs84,
  wgs84ToWebMercator,
} from "./mercator";

/** Projecting there and back loses digits near the poles; a millionth of a degree is a few centimetres. */
const DEGREES_TOLERANCE = 1e-6;

/** The same loss on the metre side, where a millimetre is far below what a map shows. */
const METRES_TOLERANCE = 1e-3;

const MAX_LONGITUDE = 180;

const position = fc.record({
  lat: fc.double({
    min: -MAX_MERCATOR_LATITUDE,
    max: MAX_MERCATOR_LATITUDE,
    noNaN: true,
  }),
  lng: fc.double({ min: -MAX_LONGITUDE, max: MAX_LONGITUDE, noNaN: true }),
});

const point = fc.record({
  x: fc.double({
    min: -WEB_MERCATOR_HALF_WORLD,
    max: WEB_MERCATOR_HALF_WORLD,
    noNaN: true,
  }),
  y: fc.double({
    min: -WEB_MERCATOR_HALF_WORLD,
    max: WEB_MERCATOR_HALF_WORLD,
    noNaN: true,
  }),
});

describe("wgs84ToWebMercator and webMercatorToWgs84", () => {
  it("return to the same position after a round trip through metres", () => {
    fc.assert(
      fc.property(position, (original) => {
        const back = webMercatorToWgs84(wgs84ToWebMercator(original));
        expect(Math.abs(back.lat - original.lat)).toBeLessThan(
          DEGREES_TOLERANCE,
        );
        expect(Math.abs(back.lng - original.lng)).toBeLessThan(
          DEGREES_TOLERANCE,
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("return to the same point after a round trip through degrees", () => {
    fc.assert(
      fc.property(point, (original) => {
        const back = wgs84ToWebMercator(webMercatorToWgs84(original));
        expect(Math.abs(back.x - original.x)).toBeLessThan(METRES_TOLERANCE);
        expect(Math.abs(back.y - original.y)).toBeLessThan(METRES_TOLERANCE);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
