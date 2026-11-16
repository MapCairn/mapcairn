// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SheetSection } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { sheetTitle } from "./sheetTitle";

const title = (sheetSection: SheetSection, directionsActive = false) =>
  sheetTitle({ sheetSection, directionsActive }).key;

describe("sheetTitle", () => {
  it("is the Settings and help key for the settings and help sections", () => {
    expect(title("settings")).toBe("app.sheetTitle.settings");
    expect(title("help")).toBe("app.sheetTitle.settings");
  });

  it("is the Map options key for every other section, the pin card included", () => {
    for (const section of ["basemap", "layers", "shapes", "pin"] as const) {
      expect(title(section)).toBe("app.sheetTitle.mapOptions");
    }
  });

  it("is the Directions key while that panel is open, whatever section is set", () => {
    for (const section of ["basemap", "settings", "help", "pin"] as const) {
      expect(title(section, true)).toBe("app.sheetTitle.directions");
    }
  });
});
