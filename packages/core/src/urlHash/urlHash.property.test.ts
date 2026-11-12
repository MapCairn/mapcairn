// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  hostileText,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { urlStateValue } from "../propertyTesting/urlStateArbitraries";
import { parseUrlHash, serialiseUrlHash } from "./urlHash";

/** The limits of the world a view may show, in degrees and zoom levels. */
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MAX_ZOOM = 24;
const FULL_TURN = 360;

const HASH_FRAGMENTS = [
  "#",
  "&",
  "=",
  "/",
  ",",
  ".",
  "-",
  "map=",
  "basemap=",
  "layers=",
  "shapes=",
  "12.5/-26.2041/28.0473",
  "90",
  "earthquakes",
  "earthquakes.window=day",
];

describe("parseUrlHash", () => {
  it("reads any text without throwing", () => {
    fc.assert(
      fc.property(hostileText, (hash) => {
        expect(parseUrlHash(hash)).toBeTypeOf("object");
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads text made of the hash's own parts without throwing", () => {
    fc.assert(
      fc.property(textFromFragments(HASH_FRAGMENTS), (hash) => {
        expect(parseUrlHash(hash)).toBeTypeOf("object");
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("only returns a view that is inside the world", () => {
    fc.assert(
      fc.property(textFromFragments(HASH_FRAGMENTS), (hash) => {
        const { view } = parseUrlHash(hash);
        if (view) {
          expect(Math.abs(view.center.lat)).toBeLessThanOrEqual(MAX_LATITUDE);
          expect(Math.abs(view.center.lng)).toBeLessThanOrEqual(MAX_LONGITUDE);
          expect(view.zoom).toBeGreaterThanOrEqual(0);
          expect(view.zoom).toBeLessThanOrEqual(MAX_ZOOM);
          expect(view.bearing).toBeGreaterThanOrEqual(0);
          expect(view.bearing).toBeLessThan(FULL_TURN);
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("serialiseUrlHash and parseUrlHash", () => {
  it("read back the state that was written", () => {
    fc.assert(
      fc.property(urlStateValue, (state) => {
        expect(parseUrlHash(serialiseUrlHash(state))).toEqual(state);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
