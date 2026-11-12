// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fieldValue } from "../propertyTesting/layerArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { parseTime } from "./formatters";

/** The earliest and latest instants a JavaScript date can hold, in epoch milliseconds. */
const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

describe("parseTime", () => {
  it("returns null or an instant a date can hold, for any field value", () => {
    fc.assert(
      fc.property(fieldValue, (value) => {
        const time = parseTime(value);
        if (time !== null) {
          expect(Math.abs(time)).toBeLessThanOrEqual(MAX_DATE_MILLISECONDS);
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
