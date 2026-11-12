// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { CHROME_GAP_PX, CHROME_INSET_PX } from "./chromeSpacing";

describe("chrome spacing", () => {
  it("is the gap and inset tokens, in pixels", () => {
    expect(`${CHROME_GAP_PX}px`).toBe(tokenValues.space.sm);
    expect(`${CHROME_INSET_PX}px`).toBe(tokenValues.inset);
  });
});
