// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
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
import { formatWkt, parseWkt } from "./wkt";

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
