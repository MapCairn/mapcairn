// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

/** WCAG 2.2 AA minimum for the parts of a control that convey state (1.4.11). */
const MIN_NON_TEXT_RATIO = 3;

type ColourProperty = "backgroundColor" | "color";

/**
 * The WCAG relative luminance of an element's computed colour. The colour is
 * painted on a canvas so any syntax the browser computes (oklch, system
 * colours) is read as the sRGB the screen shows. Only opaque colours are
 * measured: the checked track and thumb are opaque.
 */
async function luminanceOf(
  locator: Locator,
  property: ColourProperty,
): Promise<number> {
  return locator.evaluate((element, prop) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("No 2d canvas context");
    }
    context.fillStyle = getComputedStyle(element)[prop];
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    const linear = (channel: number): number => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }, property);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe("switch contrast @a11y", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the checked thumb and its tick reach 3:1 on the track, ${colorScheme}`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mapPage.goto();
      await mapPage.openSettings();
      const control = page.getByRole("switch", { name: "Show zoom buttons" });
      if (!(await control.isChecked())) {
        await control.click();
      }
      await expect(control).toBeChecked();
      // Move the pointer off the control so no hover colour applies.
      await page.mouse.move(0, 0);
      const track = control.locator(":scope > span");
      const thumb = track.locator(":scope > span");
      const tick = thumb.locator("svg");

      const trackFill = await luminanceOf(track, "backgroundColor");
      const thumbFill = await luminanceOf(thumb, "backgroundColor");
      const tickStroke = await luminanceOf(tick, "color");

      expect(ratio(thumbFill, trackFill)).toBeGreaterThanOrEqual(
        MIN_NON_TEXT_RATIO,
      );
      expect(ratio(tickStroke, thumbFill)).toBeGreaterThanOrEqual(
        MIN_NON_TEXT_RATIO,
      );
    });
  }
});
