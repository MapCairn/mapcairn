// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import type { Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { failureOf } from "../propertyTesting/failureOf";
import { geoJsonGeometry } from "../propertyTesting/geoArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { GeometryError } from "./errors";
import { formatWkt, parseWkt, readWktSequence } from "./wkt";

const WKT_FRAGMENTS = [
  "POINT",
  "LINESTRING",
  "POLYGON",
  "MULTIPOINT",
  "MULTILINESTRING",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
  "EMPTY",
  "Z",
  "M",
  "SRID=4326;",
  "(",
  ")",
  ",",
  " ",
  "1.5",
  "-2",
  "1e3",
  "NaN",
];

/** What reading text can lead to: a geometry, or one of the refusals the parser documents. */
const PARSE_OUTCOMES = ["geometry", "invalid", "unsupported"];

/** What reading `text` led to. Any failure but a {@link GeometryError} escapes. */
function outcomeOf(text: string): string {
  return failureOf(GeometryError, () => parseWkt(text))?.kind ?? "geometry";
}

describe("parseWkt", () => {
  it("reads or refuses any text, never failing in another way", () => {
    fc.assert(
      fc.property(hostileText, (text) => {
        expect(PARSE_OUTCOMES).toContain(outcomeOf(text));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads or refuses text made of WKT's own parts, never failing in another way", () => {
    fc.assert(
      fc.property(textFromFragments(WKT_FRAGMENTS), (text) => {
        expect(PARSE_OUTCOMES).toContain(outcomeOf(text));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses collections nested far deeper than it allows", () => {
    fc.assert(
      fc.property(repeatedFragment("GEOMETRYCOLLECTION("), (text) => {
        expect(outcomeOf(text)).toBe("invalid");
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

/** `value` with the first two numbers of every position swapped. */
function swapAxes<T>(value: T): T {
  if (!Array.isArray(value)) {
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, part]) => [key, swapAxes(part)]),
      ) as T;
    }
    return value;
  }
  if (typeof value[0] === "number") {
    const [first, second, ...rest] = value;
    return [second, first, ...rest] as T;
  }
  return value.map(swapAxes) as T;
}

describe("readWktSequence", () => {
  const sequenceOutcomeOf = (text: string): string =>
    failureOf(GeometryError, () => readWktSequence(text))?.kind ?? "geometries";

  it("reads or refuses any text, never failing in another way", () => {
    fc.assert(
      fc.property(hostileText, (text) => {
        expect(["geometries", ...PARSE_OUTCOMES]).toContain(
          sequenceOutcomeOf(text),
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads or refuses text made of WKT's own parts, never failing in another way", () => {
    fc.assert(
      fc.property(textFromFragments(WKT_FRAGMENTS), (text) => {
        expect(["geometries", ...PARSE_OUTCOMES]).toContain(
          sequenceOutcomeOf(text),
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads back geometries written one to a line", () => {
    fc.assert(
      fc.property(fc.array(geoJsonGeometry, { minLength: 1 }), (geometries) => {
        const text = geometries
          .map((geometry) => formatWkt(geometry))
          .join("\n");
        expect(readWktSequence(text)).toEqual(geometries);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads a latitude-first text as the longitude-first geometry it swaps to", () => {
    fc.assert(
      fc.property(geoJsonGeometry, (geometry) => {
        const text = formatWkt(geometry);
        const swapped = readWktSequence(text, { axisOrder: "lat-lng" });
        const plain = readWktSequence(text);
        expect(swapped).toHaveLength(1);
        expect(swapped[0]).toEqual(swapAxes(plain[0] as Geometry));
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("formatWkt and parseWkt", () => {
  it("read back the geometry that was written", () => {
    fc.assert(
      fc.property(geoJsonGeometry, (geometry) => {
        expect(parseWkt(formatWkt(geometry))).toEqual(geometry);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
