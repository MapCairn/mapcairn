// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { endStackMinHeightForZoom } from "../../map/src/chrome/EndStack/endStackHeight";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { mockLayerProviders } from "./support/layers";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  advanceTourTo,
  CHROME_STATES,
  collapseCredits,
  enterState,
  leaveState,
  MATRIX_VIEWPORTS,
  TOUR_STATES,
  type TourState,
  viewportDetails,
  waitForStableLayout,
} from "./support/states";

// Reduced motion so the sheet and the slots land at once; the layout itself
// is the same with motion on.
test.use({ reducedMotion: "reduce", fastCredits: true });

// Each test walks every chrome state in two themes on one page, so it gets more time.
test.setTimeout(120_000);

/**
 * Checks the end stack at rest with "Show zoom buttons" switched on, the
 * stack at its tallest (every button, the zoom group, no compass).
 *
 * The stack's content height must be what `endStackMinHeightForZoom` says,
 * plus the stack's own padding, so the number the app decides with is the one
 * the browser lays out. Then either everything fits and both zoom buttons are
 * on screen and not covered, or the stack scrolls (DESIGN.md, "Layout and
 * slots"): both zoom buttons are then on screen or scrolled away inside it,
 * and scrolling to the end brings both of them and the Settings button fully
 * into the stack's visible box.
 */
async function checkEndStackAtRest(
  mapPage: MapPage,
  report: Awaited<ReturnType<typeof inspectChromeLayout>>,
  context: string,
): Promise<void> {
  const stack = mapPage.page.getByTestId("end-stack");
  const measured = await stack.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      padding:
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom),
    };
  });
  const contentHeight = measured.scrollHeight - measured.padding;
  expect(
    Math.abs(contentHeight - endStackMinHeightForZoom(false, true, true)),
    `content ${contentHeight}px against endStackMinHeightForZoom`,
  ).toBeLessThanOrEqual(1);

  expect(
    report.zoomButtonsChecked + report.zoomButtonsScrolledAway,
    context,
  ).toBe(2);
  if (measured.scrollHeight <= measured.clientHeight + 1) {
    expect(report.zoomButtonsChecked, context).toBe(2);
    return;
  }

  await stack.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
  });
  const stackBox = await stack.boundingBox();
  if (!stackBox) {
    throw new Error("The end stack has no box.");
  }
  for (const button of [
    mapPage.zoomInButton,
    mapPage.zoomOutButton,
    mapPage.settingsButton,
  ]) {
    const box = await button.boundingBox();
    if (!box) {
      throw new Error("A control has no box after scrolling the end stack.");
    }
    expect(
      box.y,
      "top of a control in the scrolled stack",
    ).toBeGreaterThanOrEqual(stackBox.y - 1);
    expect(
      box.y + box.height,
      "bottom of a control in the scrolled stack",
    ).toBeLessThanOrEqual(stackBox.y + stackBox.height + 1);
  }
  await stack.evaluate((element) => {
    element.scrollTo({ top: 0 });
  });
}

/**
 * Walks every chrome state and checks the layout in each one. With
 * `zoomForcedOn`, the end stack is checked at rest (see
 * {@link checkEndStackAtRest}) and, in every state, the zoom group is either
 * on screen or scrolled inside the end stack, never gone.
 */
async function walkStates(
  mapPage: MapPage,
  label: string,
  zoomForcedOn: boolean,
): Promise<void> {
  for (const state of CHROME_STATES) {
    await test.step(`${label}, ${state}`, async () => {
      await enterState(mapPage, state);
      await waitForStableLayout(mapPage.page);
      const report = await inspectChromeLayout(mapPage.page);
      const context = JSON.stringify(report.boxes);
      expect(report.overlaps, context).toEqual([]);
      expect(report.outside, context).toEqual([]);
      expect(report.obscured, context).toEqual([]);
      if (zoomForcedOn) {
        await expect(mapPage.zoomControls).toBeAttached();
        if (state === "rest") {
          await checkEndStackAtRest(mapPage, report, context);
        } else {
          expect(
            report.zoomButtonsChecked + report.zoomButtonsScrolledAway,
            context,
          ).toBe(2);
        }
      }
      await leaveState(mapPage, state);
    });
  }
}

/*
 * The credits popover must be usable on every screen, the short landscape
 * phone above all, where the end stack leaves little room above the button:
 * every credit link is shown in full, nothing scrolls, and the open popover
 * still collides with nothing. With the zoom buttons switched on, the end
 * stack is at its tallest.
 */
for (const viewport of MATRIX_VIEWPORTS) {
  test(
    `the credits show every link without scrolling at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage }) => {
      await page.setViewportSize(viewport);
      for (const zoomButtons of ["default", "on"] as const) {
        await test.step(`zoom buttons ${zoomButtons}`, async () => {
          if (zoomButtons === "on") {
            await page.addInitScript(() => {
              localStorage.setItem("mapcairn:zoomButtons", "true");
            });
          }
          await mapPage.goto();
          await collapseCredits(mapPage);
          await mapPage.creditsButton.click();
          await expect(mapPage.creditsRegion).toBeVisible();
          await waitForStableLayout(page);
          const fit = await mapPage.creditsRegion.evaluate((region) => {
            const box = region.getBoundingClientRect();
            const links = [...region.querySelectorAll("a[href]")];
            return {
              scrolls: region.scrollHeight > region.clientHeight + 1,
              links: links.length,
              clipped: links
                .filter((link) => {
                  const own = link.getBoundingClientRect();
                  return (
                    own.top < box.top - 0.5 ||
                    own.bottom > box.bottom + 0.5 ||
                    own.left < box.left - 0.5 ||
                    own.right > box.right + 0.5
                  );
                })
                .map((link) => link.textContent),
            };
          });
          expect(fit.links).toBeGreaterThan(0);
          expect(fit.clipped).toEqual([]);
          expect(fit.scrolls).toBe(false);
          const report = await inspectChromeLayout(page);
          const context = JSON.stringify(report.boxes);
          expect(report.overlaps, context).toEqual([]);
          expect(report.outside, context).toEqual([]);
          expect(report.obscured, context).toEqual([]);
        });
      }
    },
  );
}

/*
 * The layout collision test (DESIGN.md, "Layout and slots"). For every
 * viewport, theme and chrome state, no two floating elements overlap,
 * none leaves the viewport (apart from the bottom sheet's documented
 * translation below the fold) and every control, the zoom buttons above all,
 * is the element under its own centre, so the credits never cover them.
 *
 * Each run also repeats the states with "Show zoom buttons" switched on,
 * because an explicit "on" never yields to a short screen: that is when the
 * end stack is tallest and most likely to collide, on touch devices too.
 */
for (const viewport of MATRIX_VIEWPORTS) {
  test(
    `chrome never collides at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage }) => {
      await page.setViewportSize(viewport);
      await scriptSearch(page);
      await mapPage.goto();

      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          colorScheme,
        );
        await walkStates(mapPage, colorScheme, false);
      }

      await page.evaluate(() =>
        localStorage.setItem("mapcairn:zoomButtons", "true"),
      );
      await page.reload();
      await mapPage.waitForMap();
      await walkStates(mapPage, "zoom buttons on", true);
    },
  );
}

/**
 * How the tour card should be on screen in a state, for {@link expectTourLayout}:
 *
 * - `shown`: visible, its slot neither crowded nor inert, and the layout clear.
 * - `crowded`: gone because the bottom row, lifted above the sheet or a
 *   toolbar, has come up to it (`data-crowded`): its slot is inert and hidden.
 * - `covered`: gone because the sheet is at full and modal. Everything else is
 *   behind the sheet then, so only the card is checked.
 * - `as it fits`: `shown` or `crowded`, whichever the page says, and then the
 *   same checks, so a card that claims to be crowded must really be gone and
 *   one that claims to fit must really be clear.
 */
type TourPresence = "shown" | "crowded" | "covered" | "as it fits";

/** What the tour card does while the bottom sheet is open at each of its two lower detents. */
interface PresenceBesideSheet {
  readonly half: TourPresence;
  readonly peek: TourPresence;
}

/**
 * Where the tour card sits beside an open bottom sheet. On a 320 by 568 screen
 * the card (277 px tall for the welcome card, 203 to 269 px for the others)
 * needs 12 px clear of the scale bar, which rides above the sheet: that leaves
 * 154 px under the search pill at half, so every card gives way, and 274 px at
 * peek, so only the welcome card does. Everywhere else it fits.
 */
function presenceBesideSheet(
  viewport: { readonly width: number; readonly height: number },
  state: TourState,
): PresenceBesideSheet {
  const smallPhone = viewport.width === 320 && viewport.height === 568;
  if (!smallPhone) {
    return { half: "shown", peek: "shown" };
  }
  return { half: "crowded", peek: state === "welcome" ? "crowded" : "shown" };
}

/**
 * The credits popover sits above the tour card on the popover layer and, on a
 * short landscape phone, rises beside the end stack into the card's cell (see
 * the tour row of the slot table in DESIGN.md). That overlap is accepted, so
 * a report that names only the card and the popover does not count against it.
 */
function withoutCreditsOverCard<
  T extends {
    readonly overlaps: readonly string[];
    readonly obscured: readonly string[];
  },
>(report: T): T {
  return {
    ...report,
    overlaps: report.overlaps.filter(
      (overlap) =>
        !(overlap.includes("tour") && overlap.includes("attribution-popover")),
    ),
    obscured: report.obscured.filter(
      (entry) => !entry.endsWith("is covered by attribution-popover"),
    ),
  };
}

/**
 * Checks the floating elements in the state the page is in now: nothing
 * overlaps, nothing leaves the viewport, no control is covered, and the tour
 * card is on screen as `presence` says. `creditsOpen` allows the accepted
 * overlap of the credits popover over the card (see
 * {@link withoutCreditsOverCard}).
 */
async function expectTourLayout(
  mapPage: MapPage,
  context: string,
  presence: TourPresence,
  creditsOpen = false,
): Promise<void> {
  const page = mapPage.page;
  const slot = page.locator('[data-chrome="tour"]');
  const card = page.getByTestId("tour-card");
  await waitForStableLayout(page);
  let expected = presence;
  if (expected === "as it fits") {
    expected =
      (await slot.getAttribute("data-crowded")) === "true"
        ? "crowded"
        : "shown";
  }
  // Wait for the card to settle first: it fades, and hides after the fade.
  if (expected === "shown") {
    await expect(card, context).toBeVisible();
  } else {
    await expect(card, context).toBeHidden();
  }
  const found = await inspectChromeLayout(page);
  const report = creditsOpen ? withoutCreditsOverCard(found) : found;
  const details = `${context}: ${JSON.stringify(report.boxes)}`;
  const tourShown = report.boxes.some((box) => box.name === "tour");

  if (expected === "shown") {
    await expect(slot, details).toHaveAttribute("data-crowded", "false");
    await expect(slot, details).not.toHaveAttribute("inert", /.*/);
    expect(tourShown, details).toBe(true);
  } else {
    await expect(slot, details).toHaveAttribute("inert", /.*/);
    expect(tourShown, details).toBe(false);
  }
  if (expected === "crowded") {
    await expect(slot, details).toHaveAttribute("data-crowded", "true");
  }
  if (expected === "covered") {
    return;
  }
  expect(report.overlaps, details).toEqual([]);
  expect(report.outside, details).toEqual([]);
  expect(report.obscured, details).toEqual([]);
}

/**
 * Walks the sheet conditions under the tour card that is showing: no sheet,
 * Map options, Settings and, where the sheet is a bottom sheet, the full
 * detent (the card hides, because the sheet is modal and covers the map), the
 * peek detent and the half detent. The side panel has no detents, so those
 * three are left out. After each close the card is back and clear.
 *
 * @param beside - How the card should be beside the open bottom sheet.
 */
async function walkSheetConditions(
  mapPage: MapPage,
  label: string,
  beside: PresenceBesideSheet,
): Promise<void> {
  await expectTourLayout(mapPage, `${label}, no sheet`, "shown");

  for (const open of [
    () => mapPage.openMapOptions(),
    () => mapPage.openSettings(),
  ]) {
    await open();
    const isSheet = (await mapPage.detent()) !== null;
    await expectTourLayout(
      mapPage,
      `${label}, sheet open`,
      isSheet ? beside.half : "shown",
    );
    await mapPage.sheetClose.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expectTourLayout(mapPage, `${label}, sheet closed`, "shown");
  }

  await mapPage.openMapOptions();
  if ((await mapPage.detent()) !== null) {
    await mapPage.sheetHandle.focus();
    await mapPage.page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await expectTourLayout(mapPage, `${label}, sheet at full`, "covered");
    await mapPage.page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "peek");
    await expectTourLayout(mapPage, `${label}, sheet at peek`, beside.peek);
    await mapPage.page.keyboard.press(" ");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "half");
    await expectTourLayout(mapPage, `${label}, sheet at half`, beside.half);
  }
  await mapPage.sheetClose.click();
  await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
  await expectTourLayout(mapPage, `${label}, sheet closed again`, "shown");
}

/** Starts a new first visit in `colorScheme` and waits for the welcome card with the credits collapsed. */
async function startFirstVisit(
  mapPage: MapPage,
  colorScheme: "light" | "dark",
): Promise<void> {
  const page = mapPage.page;
  await page.emulateMedia({ colorScheme });
  // The walk before stored that the tour was answered.
  await page.addInitScript(() => {
    localStorage.removeItem("mapcairn:tourSeen");
  });
  await mapPage.goto();
  await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
  await expect(page.getByTestId("tour-card")).toBeVisible();
  await collapseCredits(mapPage);
}

/*
 * The first-visit tour card in the layout collision test. For every viewport
 * and theme, each card (the welcome card, the three steps and the ending)
 * shares the screen with no other floating element, in the sheet and the side
 * panel layouts and with the sheet closed, open on Map options or Settings,
 * and at each detent. The credits' own first showing is collapsed first; their
 * accepted overlap with the card is described in DESIGN.md (the tour row of
 * the slot table) and covered by the chrome-state walk below.
 */
test.describe("tour card", () => {
  test.use({ firstVisit: true });

  for (const viewport of MATRIX_VIEWPORTS) {
    test(
      `the tour card never collides at ${viewport.width}x${viewport.height}`,
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        await page.setViewportSize(viewport);
        const card = page.getByTestId("tour-card");

        for (const colorScheme of ["light", "dark"] as const) {
          await startFirstVisit(mapPage, colorScheme);
          for (const state of TOUR_STATES) {
            await test.step(`${colorScheme}, ${state}`, async () => {
              await advanceTourTo(mapPage, state);
              await walkSheetConditions(
                mapPage,
                `${colorScheme}, ${state}`,
                presenceBesideSheet(viewport, state),
              );
            });
          }
          await card.getByRole("button", { name: "Close" }).click();
          await expect(card).toHaveCount(0);
        }
      },
    );
  }

  /*
   * The card in every chrome state (the measure and draw toolbars, a pin
   * card, an open search, the credits and the rest). At 390 by 844 there is
   * room for it in all of them. On a small phone and a short landscape one
   * the bottom row comes up to it in some states, and it must then be gone
   * and inert, not left under the toolbar.
   */
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ] as const) {
    test(`the tour card stays clear in every chrome state at ${viewport.width}x${viewport.height}`, async ({
      page,
      mapPage,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize(viewport);
      await scriptSearch(page);
      await startFirstVisit(mapPage, "light");
      const roomy = viewport.height >= 800;

      for (const state of TOUR_STATES) {
        await advanceTourTo(mapPage, state);
        for (const chromeState of CHROME_STATES) {
          // Focusing the search field is what step 3 asks for, so it moves the tour on.
          if (state === "step 3" && chromeState === "search open") {
            continue;
          }
          await test.step(`${state}, ${chromeState}`, async () => {
            await enterState(mapPage, chromeState);
            await expectTourLayout(
              mapPage,
              `${state}, ${chromeState}`,
              roomy || chromeState === "rest" ? "shown" : "as it fits",
              chromeState === "attribution open",
            );
            await leaveState(mapPage, chromeState);
          });
        }
      }
    });
  }
});

/** The sizes the map key's placement is checked at: two small phones, a phone, a tablet and a desktop. */
const MAP_KEY_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

/** Three layers on that have a key. */
const KEYED_LAYERS = "#layers=earthquakes,fire-alerts,cyclones";

/**
 * Brings the map key to open or minimised from the state it starts in, which
 * is minimised on a phone and open on a larger screen.
 */
async function setMapKey(
  mapPage: MapPage,
  state: "open" | "minimised",
): Promise<void> {
  const expanded = state === "open";
  if (
    (await mapPage.mapKeyToggle.getAttribute("aria-expanded")) !== `${expanded}`
  ) {
    await mapPage.mapKeyToggle.click();
  }
  await expect(mapPage.mapKeyToggle).toHaveAttribute(
    "aria-expanded",
    `${expanded}`,
  );
}

/*
 * The map key in the layout collision test (DESIGN.md, "Layout and slots").
 * With layers on, open and minimised, it shares the screen with no other
 * floating element in any chrome state, and stays inside the viewport. It
 * is either shown and clear, or it has given way (`data-crowded`, or the
 * credits are open) and is hidden and inert, never left under another
 * element.
 */
for (const viewport of MAP_KEY_VIEWPORTS) {
  test(
    `the map key never collides at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage }) => {
      test.setTimeout(240_000);
      await mockLayerProviders(page);
      await page.setViewportSize(viewport);
      await scriptSearch(page);
      await mapPage.goto(KEYED_LAYERS);

      for (const keyState of ["open", "minimised"] as const) {
        await collapseCredits(mapPage);
        await setMapKey(mapPage, keyState);
        for (const state of CHROME_STATES) {
          await test.step(`${keyState}, ${state}`, async () => {
            await enterState(mapPage, state);
            await waitForStableLayout(mapPage.page);
            const report = await inspectChromeLayout(mapPage.page);
            const context = `${keyState}, ${state}: ${JSON.stringify(report.boxes)}`;
            expect(report.overlaps, context).toEqual([]);
            expect(report.outside, context).toEqual([]);
            expect(report.obscured, context).toEqual([]);

            const crowded =
              (await mapPage.mapKeySlot.getAttribute("data-crowded")) ===
              "true";
            const shown = report.boxes.some((box) => box.name === "map-key");
            if (state === "attribution open" || crowded) {
              expect(shown, context).toBe(false);
              await expect(mapPage.mapKey, context).toBeHidden();
            } else {
              expect(shown, context).toBe(true);
              await expect(mapPage.mapKey, context).toBeVisible();
            }
            await leaveState(mapPage, state);
          });
        }
      }
    },
  );
}
