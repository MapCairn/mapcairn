import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatLatitude, formatLongitude } from "../format";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { parseCoordinates } from "./parseCoordinates";

const FRAGMENTS = [
  "26.2041",
  "-",
  "+",
  ".",
  "0",
  "°",
  "'",
  '"',
  "S",
  "e",
  "north",
  "degrees",
  "coordinates",
  ",",
  ";",
  " ",
  "12",
  "59.9",
];

const LAT = fc.integer({ min: -90_000_000, max: 90_000_000 });
const LNG = fc.integer({ min: -180_000_000, max: 180_000_000 });

describe("parseCoordinates properties", () => {
  it("never throws, and any position it returns is within range", () => {
    fc.assert(
      fc.property(
        fc.oneof(hostileText, textFromFragments(FRAGMENTS)),
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

  it("answers repeated fragments without trouble", () => {
    fc.assert(
      fc.property(
        fc
          .constantFrom(...FRAGMENTS)
          .chain((fragment) => repeatedFragment(fragment)),
        (text) => {
          expect(() => parseCoordinates(text)).not.toThrow();
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads back any position written as plain decimals", () => {
    fc.assert(
      fc.property(
        LAT,
        LNG,
        fc.constantFrom(", ", " ", ","),
        (lat, lng, glue) => {
          const position = { lat: lat / 1e7, lng: lng / 1e7 };
          expect(
            parseCoordinates(
              `${position.lat.toFixed(7)}${glue}${position.lng.toFixed(7)}`,
            ),
          ).toEqual(position);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads back what the coordinate formatters write", () => {
    fc.assert(
      fc.property(LAT, LNG, (lat, lng) => {
        const position = { lat: lat / 1e7, lng: lng / 1e7 };
        const parsed = parseCoordinates(
          `${formatLatitude(position.lat)}, ${formatLongitude(position.lng)}`,
        );
        expect(parsed?.lat).toBeCloseTo(position.lat, 4);
        expect(parsed?.lng).toBeCloseTo(position.lng, 4);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads degrees, minutes and seconds to within a centimetre", () => {
    const dms = fc.record({
      degrees: fc.integer({ min: 0, max: 89 }),
      minutes: fc.integer({ min: 0, max: 59 }),
      seconds: fc.integer({ min: 0, max: 599_999 }).map((n) => n / 10_000),
    });
    fc.assert(
      fc.property(dms, dms, (south, west) => {
        const text = `${south.degrees}°${south.minutes}'${south.seconds}"S ${west.degrees}°${west.minutes}'${west.seconds}"W`;
        const parsed = parseCoordinates(text);
        const expectedLat = -(
          south.degrees +
          south.minutes / 60 +
          south.seconds / 3600
        );
        const expectedLng = -(
          west.degrees +
          west.minutes / 60 +
          west.seconds / 3600
        );
        expect(parsed?.lat).toBeCloseTo(expectedLat, 6);
        expect(parsed?.lng).toBeCloseTo(expectedLng, 6);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
