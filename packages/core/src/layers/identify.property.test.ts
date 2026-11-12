// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SAMPLE_IDENTIFY_LAYER } from "../fakes/layerFixtures";
import { wgs84ToWebMercator } from "../geometry/mercator";
import { LayerError } from "../ports/errors";
import type { IdentifyTarget } from "../ports/layers";
import { failureOf } from "../propertyTesting/failureOf";
import { responseBody } from "../propertyTesting/layerArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0,
  MAX_MERCATOR_LATITUDE,
} from "../zoom/zoom";
import { createDecoderRegistry } from "./decoders";
import {
  decodeIdentify,
  identifyUrl,
  MAX_IDENTIFIED_FEATURES,
  MAX_IDENTIFY_TOLERANCE_PX,
  MIN_IDENTIFY_TOLERANCE_PX,
} from "./identify";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

/** Rounding each edge to a millimetre moves the centre or the width by at most this many metres. */
const ROUNDING_METRES = 0.002;

const MAX_ZOOM = 24;

const tolerance = fc.integer({
  min: MIN_IDENTIFY_TOLERANCE_PX,
  max: MAX_IDENTIFY_TOLERANCE_PX,
});

const zoom = fc.double({ min: 0, max: MAX_ZOOM, noNaN: true });

const insideTheWorld = fc.record({
  lat: fc.double({
    min: -MAX_MERCATOR_LATITUDE,
    max: MAX_MERCATOR_LATITUDE,
    noNaN: true,
  }),
  lng: fc.double({ min: -180, max: 180, noNaN: true }),
});

/** A tap anywhere a map can report, poles included. */
const anyTap: fc.Arbitrary<IdentifyTarget> = fc.record({
  latlng: fc.record({
    lat: fc.double({ min: -90, max: 90, noNaN: true }),
    lng: fc.double({ min: -180, max: 180, noNaN: true }),
  }),
  zoom,
});

function layerWith(toleranceValue: number) {
  return {
    ...SAMPLE_IDENTIFY_LAYER,
    identify: { ...SAMPLE_IDENTIFY_LAYER.identify, tolerance: toleranceValue },
  };
}

function boxOf(url: string): number[] {
  const bbox = new URL(url).searchParams.get("bbox") as string;
  return bbox.split(",").map(Number);
}

describe("identifyUrl", () => {
  it("never throws for a tap anywhere on the map at any tolerance", () => {
    fc.assert(
      fc.property(anyTap, tolerance, (at, t) => {
        expect(identifyUrl(layerWith(t), {}, NOW, at)).toBeTypeOf("string");
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("centres a box of 2t+1 pixels on the tap, whatever the zoom and tolerance", () => {
    fc.assert(
      fc.property(insideTheWorld, zoom, tolerance, (latlng, z, t) => {
        const url = identifyUrl(layerWith(t), {}, NOW, { latlng, zoom: z });
        const [minx, miny, maxx, maxy] = boxOf(url) as [
          number,
          number,
          number,
          number,
        ];
        const centre = wgs84ToWebMercator(latlng);
        expect((minx + maxx) / 2).toBeCloseTo(centre.x, 2);
        expect((miny + maxy) / 2).toBeCloseTo(centre.y, 2);
        const side =
          ((2 * t + 1) * EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0) / 2 ** z;
        expect(Math.abs(maxx - minx - side)).toBeLessThan(ROUNDING_METRES);
        expect(Math.abs(maxy - miny - side)).toBeLessThan(ROUNDING_METRES);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("puts the tapped pixel in the middle of a picture as wide as the box", () => {
    fc.assert(
      fc.property(anyTap, tolerance, (at, t) => {
        const params = new URL(identifyUrl(layerWith(t), {}, NOW, at))
          .searchParams;
        expect(params.get("width")).toBe(String(2 * t + 1));
        expect(params.get("height")).toBe(String(2 * t + 1));
        expect(params.get("i")).toBe(String(t));
        expect(params.get("j")).toBe(String(t));
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("decodeIdentify", () => {
  const decoders = createDecoderRegistry();
  const records = {
    ...SAMPLE_IDENTIFY_LAYER,
    identify: {
      ...SAMPLE_IDENTIFY_LAYER.identify,
      records: "features",
      fields: { id: "properties.id", title: "properties.name" },
    },
  };
  const at: IdentifyTarget = { latlng: { lat: 0, lng: 0 }, zoom: 5 };

  it("returns a few features or refuses with a layer error, for any response body", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(SAMPLE_IDENTIFY_LAYER, records),
        responseBody,
        (definition, body) => {
          const failure = failureOf(LayerError, () => {
            const found = decodeIdentify(definition, body, decoders, at);
            expect(found.length).toBeLessThanOrEqual(MAX_IDENTIFIED_FEATURES);
          });
          expect(failure === undefined || failure.kind === "invalid").toBe(
            true,
          );
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});
