// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SheetSection } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { sheetTitle } from "./sheetTitle";

const title = (sheetSection: SheetSection, directionsActive = false) =>
  sheetTitle({ sheetSection, directionsActive });

describe("sheetTitle", () => {
  it("is Settings and help for the settings and help sections", () => {
    expect(title("settings")).toBe("Settings and help");
    expect(title("help")).toBe("Settings and help");
  });

  it("is Map options for every other section, the pin card included", () => {
    for (const section of ["basemap", "layers", "shapes", "pin"] as const) {
      expect(title(section)).toBe("Map options");
    }
  });

  it("is Directions while that panel is open, whatever section is set", () => {
    for (const section of ["basemap", "settings", "help", "pin"] as const) {
      expect(title(section, true)).toBe("Directions");
    }
  });
});
