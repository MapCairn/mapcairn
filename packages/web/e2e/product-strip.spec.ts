// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ProductPage } from "./pages/ProductPage";

/*
 * The product page's relief strip, the drawing before the footer: where its
 * marks are, that its two labels are at least 13 px and whole inside the frame
 * at every width and at 200% text, that they clear each other and the marks,
 * and that forced colours keep the strip.
 */

/** The widths checked: phones, the crop's boundary (36rem, 576 px) either side, a tablet and a desktop. */
const WIDTHS = [320, 390, 576, 577, 820, 1440] as const;

/** The widths at which text is also checked at 200%, where the labels grow and the frame does not. */
const ZOOMED_WIDTHS = [320, 390] as const;

/** How far past a mark's own box its halo or stroke reaches, in screen pixels. */
const MARK_REACH = 3;

/** A box on the screen. */
interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Whether two boxes share any area. */
function overlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

/** A box grown by `by` on every side. */
function grow(box: Rect, by: number): Rect {
  return {
    left: box.left - by,
    right: box.right + by,
    top: box.top - by,
    bottom: box.bottom + by,
  };
}

/** Whether `inner` lies inside `outer`, to half a pixel. */
function isInside(inner: Rect, outer: Rect): boolean {
  const slack = 0.5;
  return (
    inner.left >= outer.left - slack &&
    inner.right <= outer.right + slack &&
    inner.top >= outer.top - slack &&
    inner.bottom <= outer.bottom + slack
  );
}

/** Whether a straight line from `from` to `to` passes through `box`, by sampling it. */
function crosses(
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: Rect,
): boolean {
  const steps = 200;
  for (let step = 0; step <= steps; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / steps;
    const y = from.y + ((to.y - from.y) * step) / steps;
    if (x > box.left && x < box.right && y > box.top && y < box.bottom) {
      return true;
    }
  }
  return false;
}

/** What the strip looks like on the screen, read once. */
async function readStrip(page: Page) {
  await page.getByTestId("survey-art").scrollIntoViewIfNeeded();
  return page.evaluate(() => {
    const rect = (element: Element | null): Rect => {
      const box = element?.getBoundingClientRect();
      return {
        left: box?.left ?? Number.NaN,
        right: box?.right ?? Number.NaN,
        top: box?.top ?? Number.NaN,
        bottom: box?.bottom ?? Number.NaN,
      };
    };
    const anchor = (name: string) =>
      document.querySelector(`[data-anchor="${name}"]`);
    const byId = (id: string) =>
      document.querySelector(`[data-testid="${id}"]`);
    const onScreen = (element: Element | null, x: number, y: number) => {
      const point = new DOMPoint(x, y).matrixTransform(
        (element as SVGGraphicsElement).getScreenCTM() ?? undefined,
      );
      return { x: point.x, y: point.y };
    };
    const line = anchor("measure-line") as SVGLineElement | null;
    const label = (id: string) => {
      const element = byId(id);
      return {
        ...rect(element),
        fontSize: element
          ? Number.parseFloat(getComputedStyle(element).fontSize)
          : Number.NaN,
      };
    };
    return {
      frame: rect(byId("survey-art-frame")),
      tip: onScreen(anchor("pin-tip"), 0, 0),
      lineStart: onScreen(
        line,
        line?.x1.baseVal.value ?? Number.NaN,
        line?.y1.baseVal.value ?? Number.NaN,
      ),
      lineEnd: onScreen(
        line,
        line?.x2.baseVal.value ?? Number.NaN,
        line?.y2.baseVal.value ?? Number.NaN,
      ),
      pin: rect(anchor("pin")),
      cairn: rect(anchor("cairn")),
      spotHeight: label("survey-art-spot-height"),
      length: label("survey-art-length"),
      text: document.querySelectorAll("[data-testid=survey-art] text").length,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Sets the root font size to 200%, as a person who enlarges text does. */
async function enlargeText(page: Page): Promise<void> {
  // CSSOM, which the strict style CSP allows, unlike a style element.
  await page.evaluate(() =>
    document.documentElement.style.setProperty("font-size", "200%"),
  );
}

test.describe("the relief strip", () => {
  test.use({ reducedMotion: "reduce" });

  const cases = WIDTHS.flatMap((width) =>
    (["light", "dark"] as const).flatMap((colorScheme) => [
      { width, colorScheme, zoomed: false },
      ...(ZOOMED_WIDTHS.some((w) => w === width)
        ? [{ width, colorScheme, zoomed: true }]
        : []),
    ]),
  );

  for (const { width, colorScheme, zoomed } of cases) {
    test(`draws its marks and sets its two labels beside them at 13px or more at ${width}px in ${colorScheme}${zoomed ? " with text at 200%" : ""}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      const product = new ProductPage(page);
      await product.goto();
      if (zoomed) {
        await enlargeText(page);
      }
      const strip = await readStrip(page);

      // The pin's tip is the measured line's first point, to within a hundredth of a pixel.
      expect(Math.abs(strip.tip.x - strip.lineStart.x)).toBeLessThan(0.01);
      expect(Math.abs(strip.tip.y - strip.lineStart.y)).toBeLessThan(0.01);
      // The drawing holds no text, so nothing in it can shrink below the floor.
      expect(strip.text).toBe(0);
      for (const point of [strip.tip, strip.lineStart, strip.lineEnd]) {
        expect(point.x).toBeGreaterThan(strip.frame.left);
        expect(point.x).toBeLessThan(strip.frame.right);
        expect(point.y).toBeGreaterThan(strip.frame.top);
        expect(point.y).toBeLessThan(strip.frame.bottom);
      }
      const labels = {
        spotHeight: strip.spotHeight,
        length: strip.length,
      };
      for (const [name, label] of Object.entries(labels)) {
        const floor = zoomed ? 26 : 13;
        expect(label.fontSize, `${name} size`).toBeGreaterThanOrEqual(floor);
        // Each label is whole inside the frame, never cut off.
        expect(isInside(label, strip.frame), `${name} inside the frame`).toBe(
          true,
        );
        // It clears the pin, the cairn and the dashed line.
        expect(
          overlap(label, grow(strip.pin, MARK_REACH)),
          `${name} on pin`,
        ).toBe(false);
        expect(
          overlap(label, grow(strip.cairn, MARK_REACH)),
          `${name} on cairn`,
        ).toBe(false);
        expect(
          crosses(strip.lineStart, strip.lineEnd, label),
          `${name} on the line`,
        ).toBe(false);
      }
      expect(overlap(strip.spotHeight, strip.length), "the labels touch").toBe(
        false,
      );
      expect(strip.scrollWidth).toBeLessThanOrEqual(width);
    });
  }

  test("keeps the strip whole in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    const product = new ProductPage(page);
    await product.goto();
    await page.getByTestId("survey-art").scrollIntoViewIfNeeded();
    const ink = await page.evaluate(() => {
      const colourOf = (name: "CanvasText" | "Canvas") => {
        const probe = document.createElement("span");
        probe.style.setProperty("color", name);
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const query = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`No element for ${selector}`);
        }
        return getComputedStyle(element);
      };
      return {
        text: colourOf("CanvasText"),
        canvas: colourOf("Canvas"),
        stone: query('[data-anchor="cairn"] polygon:last-child').fill,
        stoneHalo: query('[data-anchor="cairn"] polygon:first-child').fill,
        line: query('[data-anchor="measure-line"]').stroke,
        pin: query('[data-anchor="pin"] path').fill,
        label: query('[data-testid="survey-art-length"]').color,
        labelPlate: query('[data-testid="survey-art-length"]').backgroundColor,
        frameEdge: query('[data-testid="survey-art-frame"]').borderTopColor,
      };
    });
    // Forced colours replace the blue with the system's own colours, so the marks stay visible.
    expect(ink.stone).toBe(ink.text);
    expect(ink.stoneHalo).toBe(ink.canvas);
    expect(ink.line).toBe(ink.text);
    expect(ink.pin).toBe(ink.text);
    expect(ink.label).toBe(ink.text);
    expect(ink.labelPlate).toBe(ink.canvas);
    expect(ink.frameEdge).toBe(ink.text);
  });
});
