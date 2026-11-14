// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  finishShape,
  offGridSmallCircleInput,
  shapeInput,
  shapeInputs,
} from "../propertyTesting/shapeArbitraries";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { exportableShapes } from "./export";
import { validateShape } from "./shape";
import {
  decodeShapes,
  encodeShapes,
  MAX_SHARE_LENGTH,
  MAX_SHARE_SHAPES,
  SHARE_PATTERN,
  unsharableShapes,
} from "./share";

const SHARE_FRAGMENTS = [
  "p",
  "l",
  "g",
  "c",
  ".",
  "A",
  "B",
  "_",
  "-",
  "gA",
  "w",
];

describe("decodeShapes", () => {
  it("reads any text without throwing", () => {
    fc.assert(
      fc.property(hostileText, (text) => {
        decodeShapes(text);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("returns null or valid shapes for text made of the encoding's own parts", () => {
    fc.assert(
      fc.property(textFromFragments(SHARE_FRAGMENTS), (text) => {
        const shapes = decodeShapes(text);
        expect(shapes === null || shapes.length > 0).toBe(true);
        for (const [index, input] of (shapes ?? []).entries()) {
          expect(validateShape(finishShape(input, index))).toBeNull();
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses a number that never ends", () => {
    fc.assert(
      fc.property(repeatedFragment("g"), (text) => {
        expect(decodeShapes(text)).toBeNull();
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("encodeShapes", () => {
  it("writes only link-safe characters, within the length limit", () => {
    fc.assert(
      fc.property(
        shapeInputs.filter((inputs) => inputs.length > 0),
        (inputs) => {
          const text = encodeShapes(inputs.map(finishShape));
          expect(text).not.toBeNull();
          expect(SHARE_PATTERN.test(text ?? "")).toBe(true);
          expect(text?.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses more shapes than a link may carry", () => {
    fc.assert(
      fc.property(
        fc.array(shapeInput, {
          minLength: MAX_SHARE_SHAPES + 1,
          maxLength: MAX_SHARE_SHAPES + 1,
        }),
        (inputs) => {
          expect(encodeShapes(inputs.map(finishShape))).toBeNull();
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});

/** A position anywhere on the map, off the grid, and one a few units of the grid from it. */
const nearbyPositions = fc
  .record({
    lat: fc.double({ min: -80, max: 80, noNaN: true }),
    lng: fc.double({ min: -170, max: 170, noNaN: true }),
    offsets: fc.array(
      fc.record({
        lat: fc.double({ min: -4e-5, max: 4e-5, noNaN: true }),
        lng: fc.double({ min: -4e-5, max: 4e-5, noNaN: true }),
      }),
      { minLength: 2, maxLength: 5 },
    ),
  })
  .map(({ lat, lng, offsets }) =>
    offsets.map((offset) => ({
      lat: lat + offset.lat,
      lng: lng + offset.lng,
    })),
  );

/** Shapes of every size, among them circles of a few centimetres and lines and polygons a few metres across. */
const shapesOfAnySize = fc.array(
  fc.oneof(
    shapeInput,
    offGridSmallCircleInput,
    fc.double({ min: 0.01, max: 3, noNaN: true }).map((radiusMetres) => ({
      kind: "circle" as const,
      vertices: [{ lat: 1.5, lng: 2.5 }],
      radiusMetres,
    })),
    nearbyPositions.map((vertices) => ({ kind: "line" as const, vertices })),
    nearbyPositions.map((vertices) => ({ kind: "polygon" as const, vertices })),
  ),
  { minLength: 1, maxLength: 6 },
);

describe("encodeShapes and unsharableShapes", () => {
  it("write a link that reads back as every shape but those reported as left out", () => {
    fc.assert(
      fc.property(shapesOfAnySize, (inputs) => {
        const shapes = inputs.map(finishShape);
        const carried =
          exportableShapes(shapes).length - unsharableShapes(shapes).length;
        const text = encodeShapes(shapes);
        expect(text).not.toBeNull();
        expect(decodeShapes(text ?? "")?.length ?? 0).toBe(carried);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("encodeShapes and decodeShapes", () => {
  it("read back the shapes that were written", () => {
    fc.assert(
      fc.property(
        shapeInputs.filter((inputs) => inputs.length > 0),
        (inputs) => {
          const text = encodeShapes(inputs.map(finishShape));
          expect(decodeShapes(text ?? "")).toEqual(inputs);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});
