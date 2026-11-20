// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { collapseCredits } from "./support/states";

/** WCAG 2.2 AA minimum for a control's glyph (1.4.11). */
const MIN_NON_TEXT_RATIO = 3;

/** The worst-case backdrops DESIGN.md measures surfaces over: a white and a black map. */
const BACKDROPS = { "a light basemap": "#ffffff", "a dark basemap": "#000000" };

interface Measured {
  /** The glyph colour's relative luminance. */
  glyph: number;
  /** The button's own surface, painted over the backdrop, as luminance. */
  surface: number;
  /** The alpha of the computed `background-color`. */
  alpha: number;
}

/**
 * Paints the computed colours on a canvas so any syntax the browser computes
 * (oklch, system colours) reads as the sRGB the screen shows, and flattens the
 * button's translucent surface over a backdrop colour.
 */
async function measure(button: Locator, backdrop: string): Promise<Measured> {
  return button.evaluate((element, fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("No 2d canvas context");
    }
    const linear = (channel: number): number => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminanceOver = (base: string, colour: string): number => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = base;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const style = getComputedStyle(element);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const alpha = context.getImageData(0, 0, 1, 1).data[3] ?? 0;
    return {
      glyph: luminanceOver(fill, style.color),
      surface: luminanceOver(fill, style.backgroundColor),
      alpha: alpha / 255,
    };
  }, backdrop);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe("credits button contrast @a11y", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  for (const colorScheme of ["light", "dark"] as const) {
    for (const [name, backdrop] of Object.entries(BACKDROPS)) {
      test(`the glyph reaches 3:1 on the button's surface over ${name}, ${colorScheme} theme`, async ({
        page,
        mapPage,
      }) => {
        await page.emulateMedia({ colorScheme });
        await mapPage.goto();
        await collapseCredits(mapPage);
        await page.mouse.move(0, 0);
        const measured = await measure(mapPage.creditsButton, backdrop);
        expect(ratio(measured.glyph, measured.surface)).toBeGreaterThanOrEqual(
          MIN_NON_TEXT_RATIO,
        );
      });
    }
  }

  test("the button has a painted surface of its own", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await mapPage.goto();
    await collapseCredits(mapPage);
    await page.mouse.move(0, 0);
    const measured = await measure(mapPage.creditsButton, "#ffffff");
    expect(measured.alpha).toBeGreaterThan(0);
  });

  test("more contrast gives the button an opaque surface", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ contrast: "more", colorScheme: "dark" });
    await mapPage.goto();
    await collapseCredits(mapPage);
    await page.mouse.move(0, 0);
    const measured = await measure(mapPage.creditsButton, "#ffffff");
    expect(measured.alpha).toBe(1);
    expect(ratio(measured.glyph, measured.surface)).toBeGreaterThanOrEqual(
      MIN_NON_TEXT_RATIO,
    );
  });

  test("forced colours keep the button's surface and glyph apart", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await mapPage.goto();
    await collapseCredits(mapPage);
    await page.mouse.move(0, 0);
    const measured = await measure(mapPage.creditsButton, "#ffffff");
    expect(measured.alpha).toBe(1);
    expect(ratio(measured.glyph, measured.surface)).toBeGreaterThanOrEqual(
      MIN_NON_TEXT_RATIO,
    );
  });
});
