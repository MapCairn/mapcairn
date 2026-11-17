// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations, inspectControls } from "./support/a11y";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import { collapseCredits, waitForStableLayout } from "./support/states";

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
] as const;

/** The most of the screen's height the draw toolbar may take. */
const MAX_TOOLBAR_SHARE = 0.5;

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

/** Tabs from the first button of the stack through the last, expecting each to be in turn and on screen. */
async function tabThroughStack(mapPage: MapPage): Promise<void> {
  const stack = mapPage.page.getByTestId("end-stack");
  const buttons = stack.locator("button");
  const count = await buttons.count();
  await buttons.first().focus();
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      await mapPage.page.keyboard.press("Tab");
    }
    const state = await stack.evaluate((element, position) => {
      const target = element.querySelectorAll("button")[position];
      const box = target?.getBoundingClientRect();
      const clip = element.getBoundingClientRect();
      if (!(target && box)) {
        return { focused: false, onScreen: false };
      }
      return {
        focused: document.activeElement === target,
        onScreen: box.bottom > clip.top + 1 && box.top < clip.bottom - 1,
      };
    }, index);
    expect(state, `stack button ${index + 1} of ${count} by Tab`).toEqual({
      focused: true,
      onScreen: true,
    });
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
  await tabThroughStack(mapPage);
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
  ).toBeLessThanOrEqual(MAX_TOOLBAR_SHARE + PIXEL_SLACK / screenHeight);
  expect(
    await unreachableButtons(
      mapPage.page.getByTestId("draw-toolbar-scroll"),
      "draw-toolbar",
    ),
    `${context}: draw toolbar`,
  ).toEqual([]);
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
      test(`every control is reachable at ${viewport.width}x${viewport.height}`, async ({
        page,
        mapPage,
      }) => {
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
              }
            });
          }
        }
      });
    }

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
