// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { sheetTitle } from "./sheetTitle";

describe("sheetTitle", () => {
  it("adds the map's label in brackets", () => {
    expect(sheetTitle("map-options", "Pine")).toBe("Map options (Pine)");
    expect(sheetTitle("settings", "Heather")).toBe(
      "Settings and help (Heather)",
    );
  });

  it("leaves the brackets out when the map has no label", () => {
    expect(sheetTitle("map-options", undefined)).toBe("Map options");
    expect(sheetTitle("settings", undefined)).toBe("Settings and help");
    expect(sheetTitle(null, undefined)).toBe("Map options");
  });
});
