// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";

/*
 * The end stack is a scroll container, and a scroll container clips what is
 * drawn outside its box. Its groups cast a shadow wider than the box, so a
 * stack that clips while it has nothing to scroll leaves a hard-edged band of
 * shadow beside the controls, which on the dark theme dims the map out to the
 * screen edge.
 */
test.describe("the end stack's edge", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  const overflowY = (element: Element) => getComputedStyle(element).overflowY;

  for (const colorScheme of ["light", "dark"] as const) {
    test(`does not clip the shadows of controls that all fit, in the ${colorScheme} theme`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await mapPage.goto();
      const stack = page.getByTestId("end-stack");
      await expect(stack).toHaveAttribute("data-scroll-more", "none");
      expect(await stack.evaluate(overflowY)).toBe("visible");
    });
  }

  test("still scrolls when the controls do not fit", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 1440, height: 320 });
    await mapPage.goto();
    const stack = page.getByTestId("end-stack");
    await expect(stack).not.toHaveAttribute("data-scroll-more", "none");
    expect(await stack.evaluate(overflowY)).toBe("auto");
    await stack.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight });
    });
    await expect(stack).toHaveAttribute("data-scroll-more", "above");
    expect(await stack.evaluate(overflowY)).toBe("auto");
    expect(
      await stack.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
  });
});
