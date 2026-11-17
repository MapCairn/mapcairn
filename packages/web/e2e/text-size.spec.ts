// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator, Page } from "@playwright/test";
import { TOOLBAR_MAX_SCREEN_SHARE } from "../../map/src/tools/DrawToolbar/toolbarCap";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations, inspectControls } from "./support/a11y";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  collapseCredits,
  viewportDetails,
  waitForStableLayout,
} from "./support/states";

/*
 * Resize text and reflow (WCAG 2.2 1.4.4 and 1.4.10). The site has no text
 * size control, so the page's root font size stands in for the browser
 * setting: every size in the app is in rem and follows it. At 100, 150 and
 * 200 percent, on a small phone, a phone and a tablet, with the draw tool at
 * rest and active, in English and Afrikaans:
 *
 * - every end stack button can be brought fully into the stack's visible box
 *   and is then the element under its own centre, and Tab reaches each one
 *   with the stack scrolling it into view;
 * - the draw toolbar never takes more than half the screen, and every one of
 *   its buttons can be brought fully into view the same way;
 * - the stack and the toolbar say when there is more to scroll to;
 * - nothing floating overlaps or leaves the screen.
 */

test.use({ reducedMotion: "reduce", fastCredits: true });
test.setTimeout(180_000);

const TEXT_SIZES_PERCENT = [100, 150, 200] as const;

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

/** Sub-pixel slack for boxes that sit on a fraction of a pixel. */
const PIXEL_SLACK = 1;

/** Points added to the shape in the "drawing" state. */
const POINTS_DRAWN = 3;

/** Sets the root font size, as a browser's text size setting does, and waits for the layout to settle. */
async function setTextSize(page: Page, percent: number): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = `${value}%`;
  }, percent);
  await waitForStableLayout(page);
}

/** Starts the draw tool and adds points, so the toolbar shows a shape under way. */
async function drawShape(mapPage: MapPage): Promise<void> {
  await mapPage.startDrawing();
  for (let point = 0; point < POINTS_DRAWN; point += 1) {
    await mapPage.drawAddPoint.click();
    await mapPage.focusMap();
    await mapPage.page.keyboard.press("ArrowRight");
  }
}

/**
 * Scrolls each button of a scroll container into view, as focusing it would,
 * and returns the ones that are then not fully inside `frame` or not the
 * element under their own centre.
 */
function unreachableButtons(
  container: Locator,
  frameTestId: string,
): Promise<string[]> {
  return container.evaluate((element, testId) => {
    const frameElement =
      document.querySelector(`[data-testid="${testId}"]`) ?? element;
    const failures: string[] = [];
    for (const button of element.querySelectorAll<HTMLElement>("button")) {
      if (!button.checkVisibility({ visibilityProperty: true })) {
        continue;
      }
      button.scrollIntoView({ block: "nearest" });
      const box = button.getBoundingClientRect();
      const clip = frameElement.getBoundingClientRect();
      const hit = document.elementFromPoint(
        (box.left + box.right) / 2,
        (box.top + box.bottom) / 2,
      );
      const inside =
        box.top >= clip.top - 1 &&
        box.bottom <= clip.bottom + 1 &&
        box.bottom <= innerHeight + 1 &&
        box.top >= -1;
      const label =
        button.getAttribute("aria-label") ?? button.textContent ?? "a button";
      if (!inside) {
        failures.push(
          `${label} is outside its container (${Math.round(box.top)}-${Math.round(box.bottom)} in ${Math.round(clip.top)}-${Math.round(clip.bottom)}, screen ${innerHeight})`,
        );
      } else if (!(hit && button.contains(hit))) {
        failures.push(
          `${label} is covered by ${hit?.closest("[data-chrome]")?.getAttribute("data-chrome") ?? hit?.tagName} (${Math.round(box.top)}-${Math.round(box.bottom)}) ${hit?.outerHTML.slice(0, 200)}`,
        );
      }
    }
    element.scrollTo({ top: 0 });
    return failures;
  }, frameTestId);
}

/**
 * The height of the fade at an end of a scroll container with more behind it
 * (`tokens.space.md`, 16 px, which does not scale with the text).
 */
const FADE_PX = 16;

/**
 * Where the element with focus is in `container`, as the page sees it now:
 * whether it is the target, fully inside the container, and clear of the fade
 * at each end that has more behind it. The fade can only be cleared where the
 * container is tall enough for the control and a fade at both ends; a smaller
 * window (a small phone at 200 percent) only needs the control fully inside.
 */
function focusState(container: Locator, position: number) {
  return container.evaluate(
    (element, args) => {
      const { index, fade } = args;
      const targets = [
        ...element.querySelectorAll<HTMLElement>("button"),
      ].filter(
        (button) =>
          button.tabIndex >= 0 &&
          !button.hasAttribute("disabled") &&
          button.checkVisibility({ visibilityProperty: true }),
      );
      const target = targets[index];
      if (!target) {
        return { focused: false, detail: `no focusable control ${index}` };
      }
      const box = target.getBoundingClientRect();
      const clip = element.getBoundingClientRect();
      const above = element.scrollTop > 1;
      const below =
        element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      const room = clip.height >= box.height + 2 * fade;
      const topEdge = clip.top + (above && room ? fade : 0);
      const bottomEdge = clip.bottom - (below && room ? fade : 0);
      const inside = box.top >= topEdge - 1 && box.bottom <= bottomEdge + 1;
      return {
        focused: document.activeElement === target,
        detail: inside
          ? "inside"
          : `control ${Math.round(box.top)}-${Math.round(box.bottom)} outside ${Math.round(topEdge)}-${Math.round(bottomEdge)}`,
      };
    },
    { index: position, fade: FADE_PX },
  );
}

/** How many controls of a container are in the Tab order. */
function tabStops(container: Locator): Promise<number> {
  return container.evaluate(
    (element) =>
      [...element.querySelectorAll<HTMLElement>("button")].filter(
        (button) =>
          button.tabIndex >= 0 &&
          !button.hasAttribute("disabled") &&
          button.checkVisibility({ visibilityProperty: true }),
      ).length,
  );
}

/**
 * Tabs from the first control of a scroll container through the last,
 * expecting each to take focus in turn and to sit fully inside the container
 * (and clear of its fade where there is room), so what Tab scrolls to is
 * whole, not a sliver.
 */
async function tabThrough(
  page: Page,
  container: Locator,
  name: string,
): Promise<void> {
  const count = await tabStops(container);
  await container.evaluate((element) => {
    element.scrollTo({ top: 0 });
    element
      .querySelector<HTMLElement>("button:not([disabled]):not([tabindex='-1'])")
      ?.focus();
  });
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      await page.keyboard.press("Tab");
    }
    expect(
      await focusState(container, index),
      `${name}: control ${index + 1} of ${count} by Tab`,
    ).toEqual({ focused: true, detail: "inside" });
  }
}

/**
 * The draw toolbar's shape switch is one tab stop; its arrow keys move focus
 * between the four options. Each one that takes focus must be fully inside the
 * toolbar's scroll container.
 */
async function arrowThroughShapeSwitch(mapPage: MapPage): Promise<void> {
  const scroller = mapPage.page.getByTestId("draw-toolbar-scroll");
  await mapPage.page
    .getByTestId("draw-mode")
    .locator('[role="radio"][tabindex="0"]')
    .focus();
  for (let press = 0; press < 3; press += 1) {
    await mapPage.page.keyboard.press("ArrowRight");
    const inside = await scroller.evaluate((element) => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement && element.contains(focused))) {
        return "focus left the toolbar";
      }
      const box = focused.getBoundingClientRect();
      const clip = element.getBoundingClientRect();
      return box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1
        ? "inside"
        : `option ${Math.round(box.top)}-${Math.round(box.bottom)} outside ${Math.round(clip.top)}-${Math.round(clip.bottom)}`;
    });
    expect(inside, `shape switch option after ${press + 1} arrow presses`).toBe(
      "inside",
    );
  }
}

/** Scrolls a container to `top` pixels from its start. */
async function scrollContainerTo(
  container: Locator,
  top: number,
): Promise<void> {
  await container.evaluate((element, position) => {
    element.scrollTo({ top: position });
  }, top);
}

/**
 * Checks a scroll container that overflows says so as it scrolls (more below
 * at the top, more on both sides part of the way, more above at the end), and
 * one that does not says there is nothing more.
 */
async function expectScrollAffordance(
  container: Locator,
  context: string,
): Promise<void> {
  const [overflow, client] = await container.evaluate((element) => [
    element.scrollHeight,
    element.clientHeight,
  ]);
  if (overflow <= client + PIXEL_SLACK) {
    await expect(container, context).toHaveAttribute(
      "data-scroll-more",
      "none",
    );
    return;
  }
  const distance = overflow - client;
  await scrollContainerTo(container, 0);
  await expect(container, `${context}: at the top`).toHaveAttribute(
    "data-scroll-more",
    "below",
  );
  // A container that is barely taller than its box has no middle to rest in.
  if (distance > 2 * PIXEL_SLACK) {
    await scrollContainerTo(container, distance / 2);
    await expect(container, `${context}: part of the way`).toHaveAttribute(
      "data-scroll-more",
      "both",
    );
  }
  await scrollContainerTo(container, distance);
  await expect(container, `${context}: at the end`).toHaveAttribute(
    "data-scroll-more",
    "above",
  );
  await scrollContainerTo(container, 0);
}

/** Checks every end stack button is reachable by scrolling and by Tab. */
async function expectEndStackReachable(
  mapPage: MapPage,
  context: string,
): Promise<void> {
  expect(
    await unreachableButtons(
      mapPage.page.getByTestId("end-stack"),
      "end-stack",
    ),
    `${context}: end stack`,
  ).toEqual([]);
  await tabThrough(
    mapPage.page,
    mapPage.page.getByTestId("end-stack"),
    "end stack",
  );
}

/** Checks the draw toolbar stays within its share of the screen and every button is reachable by scrolling. */
async function expectDrawToolbarReachable(
  mapPage: MapPage,
  context: string,
  screenHeight: number,
): Promise<void> {
  const box = await mapPage.drawToolbar.boundingBox();
  if (!box) {
    throw new Error("The draw toolbar has no box.");
  }
  expect(
    box.height / screenHeight,
    `${context}: share of the screen the toolbar takes`,
  ).toBeLessThanOrEqual(TOOLBAR_MAX_SCREEN_SHARE + PIXEL_SLACK / screenHeight);
  expect(
    await unreachableButtons(
      mapPage.page.getByTestId("draw-toolbar-scroll"),
      "draw-toolbar",
    ),
    `${context}: draw toolbar`,
  ).toEqual([]);
  await tabThrough(
    mapPage.page,
    mapPage.page.getByTestId("draw-toolbar-scroll"),
    `${context}: draw toolbar`,
  );
  await expectShapeSwitchApart(mapPage, context);
}

/** Checks no two options of the shape switch overlap, whatever the text size or language. */
async function expectShapeSwitchApart(
  mapPage: MapPage,
  context: string,
): Promise<void> {
  const boxes = await mapPage.page
    .getByTestId("draw-mode")
    .locator('[role="radio"]')
    .evaluateAll((radios) =>
      radios.map((radio) => {
        const box = radio.getBoundingClientRect();
        return {
          name: radio.textContent?.trim() ?? "",
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      }),
    );
  expect(boxes, `${context}: shape switch options`).toHaveLength(4);
  const overlaps = boxes.flatMap((first, index) =>
    boxes.slice(index + 1).flatMap((second) => {
      const width =
        Math.min(first.right, second.right) - Math.max(first.left, second.left);
      const height =
        Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
      return width > 0.5 && height > 0.5
        ? [
            `${first.name} overlaps ${second.name} by ${Math.round(width)}x${Math.round(height)}`,
          ]
        : [];
    }),
  );
  expect(overlaps, `${context}: shape switch options`).toEqual([]);
}

/** Checks the search pill and the credits button are fully on screen and nothing floating collides. */
async function expectChromeClear(mapPage: MapPage): Promise<void> {
  const page = mapPage.page;
  await expect(mapPage.creditsButton).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-chrome="top-start"]')).toBeInViewport({
    ratio: 1,
  });
  const report = await inspectChromeLayout(page);
  const details = JSON.stringify(report.boxes);
  expect(report.overlaps, details).toEqual([]);
  expect(report.outside, details).toEqual([]);
  expect(report.obscured, details).toEqual([]);
}

/** Runs axe and the control checks on the page as it is. */
async function expectAccessible(page: Page, context: string): Promise<void> {
  expect(await axeViolations(page), context).toEqual([]);
  const controls = await inspectControls(page);
  expect(controls.unnamed, context).toEqual([]);
  expect(controls.tooSmall, context).toEqual([]);
}

/** Finishes the shape and closes the draw tool. */
async function stopDrawing(mapPage: MapPage): Promise<void> {
  await mapPage.drawRemove.click();
  await mapPage.drawPrimary.click();
  await expect(mapPage.drawToolbar).toHaveCount(0);
}

for (const language of [null, "af"] as const) {
  test.describe(`text size, ${language ?? "English"}`, () => {
    test.use({ language });

    for (const viewport of VIEWPORTS) {
      test(
        `every control is reachable at ${viewport.width}x${viewport.height}`,
        viewportDetails(viewport),
        async ({ page, mapPage }) => {
          await page.setViewportSize(viewport);
          await scriptSearch(page);
          for (const percent of TEXT_SIZES_PERCENT) {
            for (const drawing of [false, true]) {
              const state = drawing ? "drawing" : "at rest";
              await test.step(`${percent} percent, ${state}`, async () => {
                const context = `${percent}% at ${viewport.width}x${viewport.height}, ${state}`;
                await mapPage.goto();
                await setTextSize(page, percent);
                await collapseCredits(mapPage);
                if (drawing) {
                  await drawShape(mapPage);
                }
                await waitForStableLayout(page);

                await expectEndStackReachable(mapPage, context);
                if (drawing) {
                  await expectDrawToolbarReachable(
                    mapPage,
                    context,
                    viewport.height,
                  );
                }
                await expectChromeClear(mapPage);

                await expectScrollAffordance(
                  page.getByTestId("end-stack"),
                  `${context}: end stack`,
                );
                if (drawing) {
                  await expectScrollAffordance(
                    page.getByTestId("draw-toolbar-scroll"),
                    `${context}: draw toolbar`,
                  );
                  await arrowThroughShapeSwitch(mapPage);
                }
              });
            }
          }
        },
      );
    }

    test("the shape switch keeps its words apart at 200 percent text and 320 px wide", async ({
      page,
      mapPage,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await scriptSearch(page);
      await mapPage.goto();
      await setTextSize(page, 200);
      await collapseCredits(mapPage);
      await mapPage.startDrawing();
      await waitForStableLayout(page);
      await expectShapeSwitchApart(mapPage, "200% at 320x568");
    });

    test("the fade gives way to a full-strength edge in forced colours, and every control is still reachable", async ({
      page,
      mapPage,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ forcedColors: "active" });
      await scriptSearch(page);
      await mapPage.goto();
      await setTextSize(page, 200);
      await collapseCredits(mapPage);
      await drawShape(mapPage);
      await waitForStableLayout(page);
      for (const [testId, name] of [
        ["end-stack", "end stack"],
        ["draw-toolbar-scroll", "draw toolbar"],
      ] as const) {
        const container = page.getByTestId(testId);
        await expect(
          container,
          `${name} has more to scroll to`,
        ).not.toHaveAttribute("data-scroll-more", "none");
        const mask = await container.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.maskImage}|${style.webkitMaskImage}`;
        });
        expect(mask, `${name} mask in forced colours`).toBe("none|none");
        expect(
          await unreachableButtons(container, testId),
          `${name} in forced colours`,
        ).toEqual([]);
      }
      await tabThrough(page, page.getByTestId("end-stack"), "end stack");
    });

    test.describe("axe at large text @a11y", () => {
      for (const viewport of [VIEWPORTS[0], VIEWPORTS[1]]) {
        test(`passes at 200 percent and ${viewport.width}x${viewport.height} in both themes @a11y`, async ({
          page,
          mapPage,
        }) => {
          await page.setViewportSize(viewport);
          await scriptSearch(page);
          await mapPage.goto();
          await setTextSize(page, 200);
          await collapseCredits(mapPage);
          for (const colorScheme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme });
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              colorScheme,
            );
            await waitForStableLayout(page);
            await expectAccessible(page, `${colorScheme}, at rest`);
            await drawShape(mapPage);
            await waitForStableLayout(page);
            await expectAccessible(page, `${colorScheme}, drawing`);
            await stopDrawing(mapPage);
          }
        });
      }
    });
  });
}
