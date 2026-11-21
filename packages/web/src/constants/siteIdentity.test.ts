// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { contrastRatio, parseColour, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { PREVIEW_IMAGES } from "../buildPageMeta";
import { HEADLINE } from "../product/productContent";
import { PLAYGROUND_CARD, SHARE_CARD_INKS } from "../product/shareCard";
import { BRAND_COLOUR } from "./brandColour";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "./siteConfig";

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

  it("is the mark colour of the link preview cards", () => {
    const card = parseColour(SHARE_CARD_INKS.mark);
    for (const channel of ["r", "g", "b"] as const) {
      expect(Math.abs(brand[channel] - card[channel])).toBeLessThanOrEqual(1);
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

/** The width and height a PNG's header states. */
function pngSize(name: string): { width: number; height: number } {
  const bytes = readFileSync(resolve(__dirname, "../../public", name));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The most a link preview image may weigh: a share is fetched by every crawler and chat app. */
const PREVIEW_MAX_BYTES = 150_000;

describe.each(["og-sdk.png", "og-image.png"])("the link preview %s", (name) => {
  it("is the size its meta tags state", () => {
    expect(pngSize(name)).toEqual({
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });
  });

  it("stays small", () => {
    const { size } = statSync(resolve(__dirname, "../../public", name));
    expect(size).toBeLessThanOrEqual(PREVIEW_MAX_BYTES);
  });
});

describe("the link preview images' alt text", () => {
  it("names the page and what the picture shows, for both cards", () => {
    expect(PREVIEW_IMAGES.product.alt.toLowerCase()).toContain(
      HEADLINE.toLowerCase(),
    );
    expect(PREVIEW_IMAGES.map.alt.toLowerCase()).toContain(
      PLAYGROUND_CARD.headline.toLowerCase(),
    );
    for (const { alt } of Object.values(PREVIEW_IMAGES)) {
      expect(alt).toContain("survey sheet");
    }
  });
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
