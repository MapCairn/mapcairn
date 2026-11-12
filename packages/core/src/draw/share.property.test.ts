// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  finishShape,
  shapeInput,
  shapeInputs,
} from "../propertyTesting/shapeArbitraries";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { validateShape } from "./shape";
import {
  decodeShapes,
  encodeShapes,
  MAX_SHARE_LENGTH,
  MAX_SHARE_SHAPES,
  SHARE_PATTERN,
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
