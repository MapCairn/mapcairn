// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "@playwright/test";
import {
  gapBetween,
  type HeaderTarget,
  headerTargets,
  open,
  prepare,
} from "./support";

/** Widths around the framework's 996 px breakpoint, where the header changes shape. */
const HEADER_WIDTHS = [320, 360, 390, 430, 820, 996, 997, 1280] as const;

/** Phone widths, where the header's links move into the drawer the menu button opens. */
const DRAWER_WIDTHS = [320, 360, 390, 430] as const;

/** The smallest target size, and the smallest gap between targets, in CSS pixels. */
const MIN_TARGET = 44;
const MIN_GAP = 8;

/** One line for each target under the minimum size. */
function undersized(targets: readonly HeaderTarget[]): string[] {
  return targets
    .filter((t) => t.width < MIN_TARGET || t.height < MIN_TARGET)
    .map((t) => `${t.name} is ${Math.round(t.width)}x${Math.round(t.height)}`);
}

/** One line for each pair of targets closer than the minimum gap. */
function crowded(targets: readonly HeaderTarget[]): string[] {
  const tight: string[] = [];
  for (const [index, a] of targets.entries()) {
    for (const b of targets.slice(index + 1)) {
      const gap = gapBetween(a, b);
      if (gap < MIN_GAP) {
        tight.push(`${a.name} and ${b.name} are ${Math.round(gap)} px apart`);
      }
    }
  }
  return tight;
}

for (const width of HEADER_WIDTHS) {
  test(`the header at ${width} px has no overlap, 44 px targets, 8 px gaps and no sideways scroll`, async ({
    page,
  }) => {
    await prepare(page, "light", width);
    await open(page, "/");
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();

    const targets = await headerTargets(page);
    expect(targets.length).toBeGreaterThanOrEqual(3);
    expect(undersized(targets)).toEqual([]);
    expect(crowded(targets)).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const width of DRAWER_WIDTHS) {
  test(`the open menu at ${width} px has 44 px targets and 8 px gaps`, async ({
    page,
  }) => {
    await prepare(page, "light", width);
    await open(page, "/");
    await page.getByRole("button", { name: "Toggle navigation bar" }).click();
    await expect(
      page.getByRole("button", { name: "Close navigation bar" }),
    ).toBeVisible();

    const targets = await headerTargets(
      page,
      ".navbar-sidebar a, .navbar-sidebar button",
    );
    expect(targets.length).toBeGreaterThanOrEqual(8);
    expect(undersized(targets)).toEqual([]);
    expect(crowded(targets)).toEqual([]);
  });

  test(`the open menu at ${width} px keeps 44 px targets and 8 px gaps once a category is expanded`, async ({
    page,
  }) => {
    await prepare(page, "light", width);
    await open(page, "/");
    await page.getByRole("button", { name: "Toggle navigation bar" }).click();
    const drawer = page.locator(".navbar-sidebar");
    const before = (await headerTargets(page, ".navbar-sidebar a")).length;
    await drawer
      .getByRole("button", { name: /^Expand sidebar category/ })
      .first()
      .click();

    const targets = await headerTargets(
      page,
      ".navbar-sidebar a, .navbar-sidebar button",
    );
    expect(targets.filter((t) => t.name).length).toBeGreaterThan(before + 3);
    expect(undersized(targets)).toEqual([]);
    expect(crowded(targets)).toEqual([]);
  });
}
