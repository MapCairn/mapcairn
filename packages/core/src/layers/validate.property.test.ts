import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { damagedDefinition } from "../propertyTesting/layerArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { validateLayerDefinition } from "./validate";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

const definitions = fc.oneof(fc.jsonValue(), damagedDefinition);

describe("validateLayerDefinition", () => {
  it("lists problems as text for any JSON, without throwing", () => {
    fc.assert(
      fc.property(definitions, (value) => {
        const problems = validateLayerDefinition(value, options);
        expect(problems.every((problem) => typeof problem === "string")).toBe(
          true,
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("finds problems in anything that is not an object", () => {
    fc.assert(
      fc.property(
        fc
          .jsonValue()
          .filter((value) => typeof value !== "object" || value === null),
        (value) => {
          expect(validateLayerDefinition(value, options)).toEqual([
            "definition: must be an object",
          ]);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});
