// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { collapseCredits, waitForStableLayout } from "./support/states";
import { MIN_TARGET_PX, measureChromeTargets } from "./support/targets";

/*
 * The chrome in a host page whose own styles are hostile: an 8 px body
 * margin, a serif body font, `content-box` everywhere and a reset that
 * clears every button (`button { all: unset }`) and every margin.
 *
 * The page is the reference host's map, which already sets its own base
 * styles (a zero body margin, `border-box`, the token font), so the hostile
 * sheet has to beat them: its page rules are unlayered and name `html`. Its
 * reset is what the documentation says to layer ("What an app of your own
 * provides" in the extending guide): in the first test it sits in a layer the
 * sheet declares first, and in the second the same rules sit outside any
 * layer. The sheet is linked ahead of the app's stylesheets, as a host
 * imports its reset before `@mapcairn/map/styles.css`, so the layer order is
 * the documented one. It is served from a same-origin URL because the
 * strict policy refuses an inline style.
 */

const SHEET_PATH = "/__e2e/hostile-host.css";

/** The reset a host writes: every margin and every button cleared. */
const RESET_RULES = "* { margin: 0; } button { all: unset; }";

/** What a host's own base styles do to the page, whatever its reset. */
const HOSTILE_BASE = `
  html body { margin: 8px; font-family: Georgia, "Times New Roman", serif; }
  html *, html *::before, html *::after { box-sizing: content-box; }
`;

const LAYERED_SHEET = `@layer host-reset;\n@layer host-reset { ${RESET_RULES} }\n${HOSTILE_BASE}`;
const UNLAYERED_SHEET = `${RESET_RULES}\n${HOSTILE_BASE}`;

/** The width of a control that has lost its padding and size: its icon alone (the icon size token, 24px, in CSS pixels). */
const ICON_SIZE_PX = 24;

/** The tolerance for a layout comparison, in CSS pixels. */
const POSITION_TOLERANCE_PX = 0.5;

test.use({ reducedMotion: "reduce", fastCredits: true });

/** Links the hostile sheet as the first stylesheet in the head and waits for it to load. */
async function linkHostileSheet(page: Page, css: string): Promise<void> {
  await page.route(`**${SHEET_PATH}`, (route) =>
    route.fulfill({ contentType: "text/css", body: css }),
  );
  await page.evaluate(
    (href) =>
      new Promise<void>((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.addEventListener("load", () => resolve());
        link.addEventListener("error", () =>
          reject(new Error("The hostile sheet did not load")),
        );
        document.head.prepend(link);
      }),
    SHEET_PATH,
  );
  await waitForStableLayout(page);
}

/** Proves the page really is hostile, so a pass cannot come from a sheet that did nothing. */
async function expectHostilePage(page: Page): Promise<void> {
  const seen = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.padding = "4px";
    document.body.append(probe);
    const boxSizing = getComputedStyle(probe).boxSizing;
    probe.remove();
    const body = getComputedStyle(document.body);
    return { margin: body.marginTop, font: body.fontFamily, boxSizing };
  });
  expect(seen.margin).toBe("8px");
  expect(seen.font).toContain("Georgia");
  expect(seen.boxSizing).toBe("content-box");
}

/**
 * Where each shown slot sits in the chrome root: its distance from the root's
 * left, right, top and bottom edges. The chrome fills its container, so a body
 * margin that shrinks the container moves the root and changes its size, but
 * every slot keeps its place against the edge it is anchored to.
 */
async function slotInsets(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate(() => {
    const root = document
      .querySelector("[data-testid='map-chrome']")
      ?.getBoundingClientRect();
    if (!root) {
      throw new Error("The chrome root is missing");
    }
    const insets: Record<string, number[]> = {};
    for (const [index, element] of document
      .querySelectorAll("[data-chrome]")
      .entries()) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      insets[`${index} ${element.getAttribute("data-chrome")}`] = [
        box.left - root.left,
        root.right - box.right,
        box.top - root.top,
        root.bottom - box.bottom,
      ];
    }
    return insets;
  });
}

/** Whether either inset of a pair (left and right, or top and bottom) is unchanged. */
function keepsAnAnchor(
  was: readonly number[],
  now: readonly number[],
  [first, second]: readonly [number, number],
): boolean {
  return [first, second].some(
    (index) =>
      Math.abs((now[index] ?? Number.NaN) - (was[index] ?? Number.NaN)) <=
      POSITION_TOLERANCE_PX,
  );
}

/**
 * Names each slot that is no longer anchored where it was: on each axis, one
 * of its two insets must be as before (a slot at the end edge keeps its end
 * inset, one that spans keeps both), and no slot may appear or vanish.
 */
function movedSlots(
  before: Record<string, number[]>,
  after: Record<string, number[]>,
): string[] {
  const slots = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...slots].flatMap((slot) => {
    const was = before[slot] ?? [];
    const now = after[slot] ?? [];
    const anchored =
      keepsAnAnchor(was, now, [0, 1]) && keepsAnAnchor(was, now, [2, 3]);
    return anchored
      ? []
      : [`${slot}: insets ${was.join(",")} became ${now.join(",")}`];
  });
}

async function size(control: Locator): Promise<{ w: number; h: number }> {
  const box = await control.boundingBox();
  if (box === null) {
    throw new Error("The control has no box");
  }
  return { w: Math.round(box.width), h: Math.round(box.height) };
}

test.describe("the chrome in a host page with hostile base styles", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`keeps its targets, spacing and slots when the reset is in a layer declared first, in ${colorScheme}`, async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto();
      await page.emulateMedia({ colorScheme });
      await collapseCredits(mapPage);
      await waitForStableLayout(page);
      const before = await slotInsets(page);
      const settingsBefore = await size(mapPage.settingsButton);
      expect(settingsBefore.w).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(settingsBefore.h).toBeGreaterThanOrEqual(MIN_TARGET_PX);

      await linkHostileSheet(page, LAYERED_SHEET);
      await expectHostilePage(page);

      expect(await size(mapPage.settingsButton)).toEqual(settingsBefore);
      const after = await slotInsets(page);
      expect(movedSlots(before, after)).toEqual([]);
      const report = await measureChromeTargets(page);
      expect(report.checked).toBeGreaterThan(3);
      expect(report.small).toEqual([]);
      expect(report.crowded).toEqual([]);
    });

    test(`passes axe with the reset in a layer declared first, in ${colorScheme} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto();
      await page.emulateMedia({ colorScheme });
      await collapseCredits(mapPage);
      await linkHostileSheet(page, LAYERED_SHEET);
      await expectHostilePage(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

/*
 * DOCUMENTS A KNOWN LIMITATION, not a guarantee. The extending guide and
 * DESIGN.md ("Overriding a primitive") say an unlayered element rule beats
 * the primitives' layer, so a host that does not put its reset in a layer
 * declared first loses the controls' size. These tests assert the damage, so
 * the guide's claim stays true: if the SDK stops being affected, they fail
 * and the guide's note is to be reconsidered, not these tests quietly
 * deleted.
 */
test.describe("the same reset with no layer (documents the failure the guide warns of)", () => {
  test("shrinks the controls below the 44 px target", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await collapseCredits(mapPage);
    await waitForStableLayout(page);
    const settingsBefore = await size(mapPage.settingsButton);
    expect(settingsBefore.w).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(settingsBefore.h).toBeGreaterThanOrEqual(MIN_TARGET_PX);

    await linkHostileSheet(page, UNLAYERED_SHEET);
    await expectHostilePage(page);

    const settings = await size(mapPage.settingsButton);
    // The icon's own 24 px is all that is left of a 48 px control.
    expect(settings.w).toBe(ICON_SIZE_PX);
    expect(settings.h).toBeLessThan(MIN_TARGET_PX);
    const report = await measureChromeTargets(page);
    expect(report.small.length).toBeGreaterThan(0);
  });
});
