// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations, inspectControls } from "./support/a11y";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  CHROME_STATES,
  enterState,
  leaveState,
  waitForStableLayout,
} from "./support/states";

/*
 * The layout contract for a host's font (DESIGN.md, Tokens). `createThemeStylesheet` cannot know
 * how wide a font is when it runs, so the chrome promises instead that its
 * controls keep their size and that text wraps or is cut short inside them
 * rather than overlapping anything. This puts a deliberately wide face on the
 * whole page through a generated stylesheet (`fontFamily`, served from the
 * app's own origin as a host would serve it, `/design/host-theme/wide`) and
 * walks the chrome states at the two narrowest phone widths, in both themes.
 *
 * The face is defined here, with `size-adjust` on a font every platform has,
 * so no font file is needed. Text is allowed to be cut off, so this does not
 * run the clipped-text check that the sample-language spec does.
 */
test.use({ reducedMotion: "reduce", fastCredits: true });
test.setTimeout(120_000);

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
] as const;

/** How much wider than the SDK's own face the wide face must measure, at least. */
const MIN_WIDTH_RATIO = 1.4;

const WIDE_FACE_PATH = "/wide-test-face.css";

const WIDE_FACE_CSS = `@font-face {
  font-family: "Wide Test";
  src: local("Arial"), local("Helvetica"), local("Liberation Sans"), local("DejaVu Sans");
  size-adjust: 175%;
}
`;

/** Serves the wide face from the app's own origin, so the strict policy allows it. */
async function serveWideFace(page: Page): Promise<void> {
  await page.route(`**${WIDE_FACE_PATH}`, (route) =>
    route.fulfill({ contentType: "text/css", body: WIDE_FACE_CSS }),
  );
}

/** The widths of one string in the wide face and in a plain sans-serif. */
async function measureFaces(
  page: Page,
): Promise<{ wide: number; plain: number }> {
  return page.evaluate(async () => {
    await document.fonts.load('16px "Wide Test"');
    const width = (family: string): number => {
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;white-space:nowrap;font:16px ${family}`;
      probe.textContent = "Search places and addresses";
      document.body.append(probe);
      const measured = probe.getBoundingClientRect().width;
      probe.remove();
      return measured;
    };
    return {
      wide: width('"Wide Test", monospace'),
      plain: width("sans-serif"),
    };
  });
}

/** Opens the map in a viewport and theme, with the page's own font. */
async function openMap(
  page: Page,
  mapPage: MapPage,
  viewport: (typeof VIEWPORTS)[number],
  colorScheme: "light" | "dark",
): Promise<void> {
  await serveWideFace(page);
  await page.emulateMedia({ colorScheme });
  await page.setViewportSize(viewport);
  await scriptSearch(page);
  await mapPage.goto();
  await waitForStableLayout(page);
}

/**
 * The targets in a report without their sizes: a wide font makes a link wider,
 * and the report is about which targets are small, not how wide they are.
 */
function targetNames(report: readonly string[]): readonly string[] {
  return report.map((entry) => entry.replace(/ is \d+x\d+$/, ""));
}

/** The targets under 44 pixels in each chrome state, as the page has them now. */
async function smallTargetsByState(
  page: Page,
  mapPage: MapPage,
): Promise<Map<string, readonly string[]>> {
  const found = new Map<string, readonly string[]>();
  for (const state of CHROME_STATES) {
    await enterState(mapPage, state);
    await waitForStableLayout(page);
    found.set(state, targetNames((await inspectControls(page)).under44));
    await leaveState(mapPage, state);
  }
  return found;
}

/** Puts the wide face on the page through the generated stylesheet and waits for the layout to settle. */
async function applyWideFont(page: Page, mapPage: MapPage): Promise<void> {
  await page.addStyleTag({ url: WIDE_FACE_PATH });
  await page.addStyleTag({ url: "/design/host-theme/wide" });
  const { wide, plain } = await measureFaces(page);
  expect(wide / plain, "the test face is wide").toBeGreaterThanOrEqual(
    MIN_WIDTH_RATIO,
  );
  const family = await mapPage.searchInput.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(family).toContain("Wide Test");
  await waitForStableLayout(page);
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    const name = `${viewport.width}x${viewport.height} in the ${colorScheme} theme`;

    test(`a wide font does not make the chrome overlap or shrink its controls at ${name}`, async ({
      page,
      mapPage,
    }) => {
      await openMap(page, mapPage, viewport, colorScheme);
      const before = await smallTargetsByState(page, mapPage);
      await applyWideFont(page, mapPage);
      for (const state of CHROME_STATES) {
        await test.step(state, async () => {
          await enterState(mapPage, state);
          await waitForStableLayout(page);
          const layout = await inspectChromeLayout(page);
          const context = JSON.stringify(layout.boxes);
          expect.soft(layout.overlaps, context).toEqual([]);
          expect.soft(layout.outside, context).toEqual([]);
          expect.soft(layout.obscured, context).toEqual([]);
          const controls = await inspectControls(page);
          expect.soft(controls.tooSmall).toEqual([]);
          const newlySmall = targetNames(controls.under44).filter(
            (target) => !before.get(state)?.includes(target),
          );
          expect.soft(newlySmall, "targets the font made smaller").toEqual([]);
          await leaveState(mapPage, state);
        });
      }
    });

    test(`passes axe with a wide font at ${name} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await openMap(page, mapPage, viewport, colorScheme);
      await applyWideFont(page, mapPage);
      for (const state of CHROME_STATES) {
        await test.step(state, async () => {
          await enterState(mapPage, state);
          await waitForStableLayout(page);
          expect.soft(await axeViolations(page)).toEqual([]);
          await leaveState(mapPage, state);
        });
      }
    });
  }
}
