// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { parseThemeChoice } from "@mapcairn/core";
import { expect, it } from "vitest";
import { sharedChoiceFor } from "./sharedChoice";

it.each([
  [null, "system"],
  ["light", "light"],
  ["dark", "dark"],
] as const)(
  "writes %s as %s, which the reference site reads back as the same choice",
  (mode, written) => {
    expect(sharedChoiceFor(mode)).toBe(written);
    expect(parseThemeChoice(sharedChoiceFor(mode))).toBe(written);
  },
);
