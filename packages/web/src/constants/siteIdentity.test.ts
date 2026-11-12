// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrastRatio, parseColour, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { BRAND_COLOUR } from "./brandColour";

const publicFile = (name: string) =>
  readFileSync(resolve(__dirname, "../../public", name), "utf8");

const manifest = JSON.parse(publicFile("site.webmanifest")) as {
  theme_color?: string;
  background_color?: string;
};

const brand = parseColour(BRAND_COLOUR);

describe("the brand colour", () => {
  it("is the accent step the favicon is drawn in", () => {
    const accent = parseColour(tokenValues.accent[600]);
    for (const channel of ["r", "g", "b"] as const) {
      expect(Math.abs(brand[channel] - accent[channel])).toBeLessThanOrEqual(1);
    }
  });

  it.each(["light", "dark"] as const)(
    "stays at least 3:1 against the %s browser chrome",
    (theme) => {
      const chrome = parseColour(tokenValues.themeColor[theme]);
      expect(contrastRatio(brand, chrome)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("the web manifest and tile config", () => {
  it("uses the brand colour for the splash background", () => {
    expect(manifest.background_color).toBe(BRAND_COLOUR);
  });

  it("leaves the browser bar to the page's own light and dark theme-color tags", () => {
    expect(manifest.theme_color).toBeUndefined();
  });

  it("uses the brand colour for the Windows tile", () => {
    expect(publicFile("browserconfig.xml")).toContain(
      `<TileColor>${BRAND_COLOUR}</TileColor>`,
    );
  });
});
