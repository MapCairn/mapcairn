// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";

/**
 * Two maps on one page, the e2e-only page at /design/two-maps, with a `label`
 * on each map or, with `?unlabelled`, none. The page holds the one `main`
 * landmark and each map's chrome has the landmarks a screen reader lists.
 */
const PAGE = "/design/two-maps";
const LANDMARK_RULES = [
  "landmark-unique",
  "landmark-no-duplicate-main",
  "landmark-main-is-top-level",
  "duplicate-id",
  "duplicate-id-aria",
];

/** Opens the page and waits until both maps have mounted their chrome. */
async function openTwoMaps(page: Page, query = ""): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await expect(page.getByTestId("end-stack")).toHaveCount(2);
  await expect(page.locator("[data-map-host][aria-busy=false]")).toHaveCount(2);
}

/** The ids of the rules axe reports as violated, with their node counts. */
async function violated(page: Page): Promise<Record<string, number>> {
  const results = await new AxeBuilder({ page })
    .withRules(LANDMARK_RULES)
    .analyze();
  return Object.fromEntries(
    results.violations.map(({ id, nodes }) => [id, nodes.length]),
  );
}

test.describe("two maps on one page", () => {
  test("repeat their landmark names when no label is given, which axe reports", async ({
    page,
  }) => {
    await openTwoMaps(page, "?unlabelled");

    const found = await violated(page);
    expect(found["landmark-unique"]).toBeGreaterThanOrEqual(6);
    expect(found["duplicate-id"]).toBeUndefined();
  });

  test("name every landmark by its map when each has a label", async ({
    page,
    messages,
  }) => {
    await openTwoMaps(page);
    const named = (name: string, label: string): string =>
      messages["host.map.named"]
        .replace("{name}", name)
        .replace("{label}", label);

    for (const label of ["First", "Second"]) {
      await expect(
        page.getByRole("region", {
          name: named(messages["host.map.label"], label),
        }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("search", {
          name: named(messages["tools.search.label"], label),
        }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("region", {
          name: named(messages["chrome.endStack.label"], label),
        }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("region", {
          name: named(messages["chrome.readout.label"], label),
        }),
      ).toHaveCount(1);
    }
    expect(await violated(page)).toEqual({});
  });

  test("have no accessibility violations, with a label on each @a11y", async ({
    page,
  }) => {
    await openTwoMaps(page);

    expect(await axeViolations(page)).toEqual([]);
  });
});
