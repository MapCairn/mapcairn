// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { CHROME_GAP_PX } from "../../map/src/chrome/chromeSpacing";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { mockLayerProviders } from "./support/layers";
import { scriptSearch } from "./support/services";
import {
  collapseCredits,
  enterState,
  waitForStableLayout,
} from "./support/states";

/*
 * The bottom-corner controls (the credits button and its popover, the scale
 * bar and readout, and the map key) move only when a surface that opens would
 * otherwise cover them, and then only as far as they need to; otherwise they
 * hold still. DESIGN.md, "Layout and slots".
 */

test.use({ reducedMotion: "reduce", fastCredits: true });
test.setTimeout(180_000);

/** A box in CSS pixels. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The tolerance, in px, for two positions to count as the same. */
const TOLERANCE = 0.5;

/** Six layers on, so the map key is as wide as it gets and wider than the readout. */
const KEYED_LAYERS =
  "#layers=earthquakes,volcano-alerts,fire-alerts,drought-alerts,flood-alerts,cyclones&map=15.00/48.85660/2.35220";

/** The viewports the issue names: a phone, a tablet and a desktop. */
const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** The states that open something over the map, in the order the issue lists them. */
const TOOL_STATES = [
  "measure active",
  "draw active",
  "sheet open",
  "settings open",
  "directions open",
  "pin card",
] as const;

/** The controls that sit in the bottom corners. */
const CONTROLS = {
  credits: '[data-chrome="bottom-end"]',
  readout: '[data-chrome="bottom-start"]',
  key: '[data-chrome="map-key"]',
} as const;

type ControlName = keyof typeof CONTROLS;

/** The box of a selector, or null while it is absent or has no size. */
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  }, selector);
}

/** Every visible control's box. A control that gave way (the key) is absent. */
async function controlBoxes(
  page: Page,
): Promise<Partial<Record<ControlName, Box>>> {
  const boxes: Partial<Record<ControlName, Box>> = {};
  for (const [name, selector] of Object.entries(CONTROLS)) {
    const crowded = await page.evaluate(
      (target) =>
        document.querySelector<HTMLElement>(target)?.dataset.crowded === "true",
      selector,
    );
    const box = crowded ? null : await boxOf(page, selector);
    if (box) {
      boxes[name as ControlName] = box;
    }
  }
  return boxes;
}

/**
 * The surfaces that can cover a bottom corner: the sheet or side panel while
 * it is open, and whatever is in the bottom-centre slot (the toolbars).
 */
async function obstructions(page: Page): Promise<Box[]> {
  const open = await page.evaluate(
    () =>
      document
        .querySelector('[data-chrome="sheet"]')
        ?.getAttribute("data-state") === "open",
  );
  const boxes = [
    open ? await boxOf(page, '[data-chrome="sheet"]') : null,
    await boxOf(page, '[data-chrome="bottom-centre"]'),
  ];
  return boxes.filter((box): box is Box => box !== null);
}

/** Whether two boxes are in the same place, to within a sub-pixel of rounding. */
function sameBox(a: Box, b: Box): boolean {
  return (["left", "top", "right", "bottom"] as const).every(
    (edge) => Math.abs(a[edge] - b[edge]) <= TOLERANCE,
  );
}

function intersects(a: Box, b: Box): boolean {
  return (
    a.left < b.right - TOLERANCE &&
    b.left < a.right - TOLERANCE &&
    a.top < b.bottom - TOLERANCE &&
    b.top < a.bottom - TOLERANCE
  );
}

/**
 * Where the credits popover is, as a box, once the button has been pressed;
 * the popover is closed again afterwards.
 */
async function popoverBox(mapPage: MapPage): Promise<Box> {
  await mapPage.creditsButton.click();
  await expect(mapPage.creditsRegion).toBeVisible();
  await waitForStableLayout(mapPage.page);
  const box = await mapPage.creditsRegion.boundingBox();
  await mapPage.page.keyboard.press("Escape");
  await expect(mapPage.creditsRegion).toBeHidden();
  if (!box) {
    throw new Error("the credits popover has no box");
  }
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
}

/** The facts one tool state is judged against. */
interface Walk {
  readonly context: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly rest: Partial<Record<ControlName, Box>>;
  readonly after: Partial<Record<ControlName, Box>>;
  readonly covering: readonly Box[];
  readonly restPopover: Box;
  readonly popover: Box;
}

/**
 * A control that nothing would cover holds still; one that something would
 * cover clears every surface and does not move down.
 */
function checkControl(walk: Walk, name: ControlName): void {
  const before = walk.rest[name];
  const now = walk.after[name];
  if (!before || !now) {
    return;
  }
  const context = `${name} ${walk.context}`;
  if (!walk.covering.some((surface) => intersects(before, surface))) {
    expect
      .soft(
        sameBox(now, before),
        `${context}: nothing covers it, so it holds still (${JSON.stringify(before)} then ${JSON.stringify(now)})`,
      )
      .toBe(true);
    return;
  }
  for (const surface of walk.covering) {
    expect
      .soft(
        intersects(now, surface),
        `${context}: it clears the surface that would cover it`,
      )
      .toBe(false);
  }
  expect
    .soft(
      before.top - now.top,
      `${context}: it rises or moves aside, never down`,
    )
    .toBeGreaterThanOrEqual(-TOLERANCE);
}

/**
 * The popover follows its button: where the button holds still, so does the
 * popover, and it is fully on screen and just above the button.
 */
function checkPopover(walk: Walk): void {
  const { popover, rest, after, size } = walk;
  const context = `popover ${walk.context}`;
  const buttonMoved =
    rest.credits && after.credits
      ? Math.abs(rest.credits.top - after.credits.top) > TOLERANCE
      : false;
  if (!buttonMoved) {
    expect
      .soft(
        sameBox(popover, walk.restPopover),
        `${context} holds still (${JSON.stringify(walk.restPopover)} then ${JSON.stringify(popover)})`,
      )
      .toBe(true);
  }
  expect
    .soft(
      popover.left >= 0 &&
        popover.top >= 0 &&
        popover.right <= size.width &&
        popover.bottom <= size.height,
      `${context} is fully on screen`,
    )
    .toBe(true);
  if (after.credits) {
    const space = after.credits.top - popover.bottom;
    expect
      .soft(space, `${context} stays above its button`)
      .toBeGreaterThanOrEqual(0);
    expect
      .soft(space, `${context} stays next to its button`)
      .toBeLessThanOrEqual(2 * CHROME_GAP_PX);
  }
}

for (const size of SIZES) {
  test(`each bottom-corner control holds still unless a tool that opens would cover it, and then clears it, at ${size.name}`, async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(size);
    await scriptSearch(page);
    for (const state of TOOL_STATES) {
      await test.step(state, async () => {
        await mapPage.goto(KEYED_LAYERS);
        await collapseCredits(mapPage);
        await expect(mapPage.mapKey).toBeVisible();
        await waitForStableLayout(page);
        const rest = await controlBoxes(page);
        const restPopover = await popoverBox(mapPage);
        await enterState(mapPage, state);
        await waitForStableLayout(page);
        const walk: Walk = {
          context: `at ${size.name} with ${state}`,
          size,
          rest,
          after: await controlBoxes(page),
          covering: await obstructions(page),
          restPopover,
          popover: await popoverBox(mapPage),
        };
        for (const name of Object.keys(CONTROLS) as ControlName[]) {
          checkControl(walk, name);
        }
        checkPopover(walk);
      });
    }
  });
}

test("the credits and the readout sit a gap above a toolbar that spans their width on a phone", async ({
  page,
  mapPage,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mapPage.goto("#map=15.00/48.85660/2.35220");
  await collapseCredits(mapPage);
  await mapPage.startMeasuring();
  await waitForStableLayout(page);
  const toolbar = await boxOf(page, '[data-chrome="bottom-centre"]');
  const credits = await boxOf(page, CONTROLS.credits);
  const readout = await boxOf(page, CONTROLS.readout);
  expect(toolbar).not.toBeNull();
  for (const box of [credits, readout]) {
    expect((toolbar?.top ?? 0) - (box?.bottom ?? 0)).toBeCloseTo(
      CHROME_GAP_PX,
      0,
    );
  }
});

test.describe("tour card", () => {
  test.use({ firstVisit: true });

  test("the bottom corners hold still when the tour card closes at desktop size", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // The walk before stored that the tour was answered.
    await page.addInitScript(() => {
      localStorage.removeItem("mapcairn:tourSeen");
    });
    await mapPage.goto();
    await expect(page.getByTestId("tour-card")).toBeVisible();
    await collapseCredits(mapPage);
    await waitForStableLayout(page);
    const withTour = await controlBoxes(page);
    await page
      .getByTestId("tour-card")
      .getByRole("button", {
        name: mapPage.messages["tools.tour.skip"],
        exact: true,
      })
      .click();
    await expect(page.getByTestId("tour-card")).toHaveCount(0);
    await waitForStableLayout(page);
    const withoutTour = await controlBoxes(page);
    for (const name of Object.keys(withTour) as ControlName[]) {
      const before = withTour[name];
      const after = withoutTour[name];
      expect(before && after && sameBox(before, after), name).toBe(true);
    }
  });
});
