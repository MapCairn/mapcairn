// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { parseThemeChoice } from "./theme";

const THEME_CHOICES = ["system", "light", "dark"];

describe("parseThemeChoice", () => {
  it("returns a theme choice for any stored value", () => {
    fc.assert(
      fc.property(fc.anything(), (stored) => {
        expect(THEME_CHOICES).toContain(parseThemeChoice(stored));
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
