// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "@playwright/test";
import { gapBetween, headerTargets, open, prepare } from "./support";

/** Widths around the framework's 996 px breakpoint, where the header changes shape. */
const HEADER_WIDTHS = [320, 360, 390, 430, 820, 996, 997, 1280] as const;

/** The smallest target size, and the smallest gap between targets, in CSS pixels. */
const MIN_TARGET = 44;
const MIN_GAP = 8;

for (const width of HEADER_WIDTHS) {
  test(`the header at ${width} px has no overlap, 44 px targets, 8 px gaps and no sideways scroll`, async ({
    page,
  }) => {
    await prepare(page, "light", width);
    await open(page, "/docs/");
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();

    const targets = await headerTargets(page);
    expect(targets.length).toBeGreaterThanOrEqual(3);

    const small = targets
      .filter((t) => t.width < MIN_TARGET || t.height < MIN_TARGET)
      .map(
        (t) => `${t.name} is ${Math.round(t.width)}x${Math.round(t.height)}`,
      );
    expect(small).toEqual([]);

    const tight: string[] = [];
    for (const [index, a] of targets.entries()) {
      for (const b of targets.slice(index + 1)) {
        const gap = gapBetween(a, b);
        if (gap < MIN_GAP) {
          tight.push(`${a.name} and ${b.name} are ${Math.round(gap)} px apart`);
        }
      }
    }
    expect(tight).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
