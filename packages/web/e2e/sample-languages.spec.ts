// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations, inspectControls } from "./support/a11y";
import { findClippedPlaceholders, findClippedText } from "./support/clipped";
import { SAMPLE_LANGUAGES } from "./support/language";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  CHROME_STATES,
  enterState,
  leaveState,
  viewportDetails,
  waitForStableLayout,
} from "./support/states";

/*
 * The chrome in the sample languages (`SAMPLE_LANGUAGES` in
 * `support/language.ts`): expanded English (`en-XA`), mirrored English
 * (`en-XB`) and a small Arabic sample (`ar`). Their projects in
 * `playwright.config.ts` run only this spec. In every chrome state it checks
 * that no control collides and no text is cut off (run by `npm run e2e`), and
 * the axe and control audits (tagged @a11y, run by `npm run a11y`), so a
 * longer or right-to-left translation cannot hide a collision or a clipped
 * label. It also checks that the page took the sample's language and
 * direction. Each check is soft, so one run lists every finding. The default
 * projects run in English and skip it.
 */
test.use({ reducedMotion: "reduce", fastCredits: true });
test.setTimeout(120_000);

/** The narrowest phone, a short landscape phone and a desktop: where text has the least room, and the widest. */
const SAMPLE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
] as const;

/*
 * The checks must be able to fail: a label that ends in an ellipsis, a
 * placeholder that does not fit and a clipped label that scrolls (which is
 * not a cut) are each read as they should be. Runs once, in the default
 * desktop project.
 */
test.describe("the cut-off checks", () => {
  test.beforeEach(({ language, isMobile }) => {
    test.skip(language !== null || isMobile, "Runs once, in English.");
  });

  test("find a label cut by an ellipsis and a placeholder that does not fit", async ({
    page,
  }) => {
    await page.setContent(`
      <p id="cut" style="width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A label that is far too long</p>
      <p id="scrolls" style="width:60px;overflow:auto;white-space:nowrap">A label that scrolls</p>
      <p id="fits" style="width:300px;overflow:hidden;white-space:nowrap">Fits</p>
      <input style="width:60px" placeholder="A placeholder that is far too long">
      <input style="width:300px" placeholder="Fits">`);
    expect(await findClippedText(page)).toEqual([
      expect.stringContaining('"A label that is far too long" in p.'),
    ]);
    expect(await findClippedPlaceholders(page)).toEqual([
      expect.stringContaining("A placeholder that is far too long"),
    ]);
  });
});

/** Loads the map in the sample language and checks the page speaks it in its direction. */
async function openInSampleLanguage(
  page: Page,
  mapPage: MapPage,
  language: string | null,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  const sample = SAMPLE_LANGUAGES[language ?? ""];
  if (sample === undefined) {
    test.skip(true, "Runs in the sample languages only.");
    return;
  }
  await page.setViewportSize(viewport);
  await scriptSearch(page);
  await mapPage.goto();
  await expect(page.locator("html")).toHaveAttribute("lang", sample.tag);
  await expect(page.locator("html")).toHaveAttribute("dir", sample.direction);
}

for (const viewport of SAMPLE_VIEWPORTS) {
  test(
    `the chrome never collides or cuts text at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage, language }) => {
      await openInSampleLanguage(page, mapPage, language, viewport);
      for (const state of CHROME_STATES) {
        await test.step(state, async () => {
          await enterState(mapPage, state);
          await waitForStableLayout(page);
          const layout = await inspectChromeLayout(page);
          const context = JSON.stringify(layout.boxes);
          expect.soft(layout.overlaps, context).toEqual([]);
          expect.soft(layout.outside, context).toEqual([]);
          expect.soft(layout.obscured, context).toEqual([]);
          expect.soft(await findClippedText(page)).toEqual([]);
          await leaveState(mapPage, state);
        });
      }
    },
  );

  test(
    `passes axe and the control checks at ${viewport.width}x${viewport.height} @a11y`,
    viewportDetails(viewport),
    async ({ page, mapPage, language }) => {
      await openInSampleLanguage(page, mapPage, language, viewport);
      for (const state of CHROME_STATES) {
        await test.step(state, async () => {
          await enterState(mapPage, state);
          await waitForStableLayout(page);
          expect.soft(await axeViolations(page)).toEqual([]);
          const controls = await inspectControls(page);
          expect.soft(controls.unnamed).toEqual([]);
          expect.soft(controls.tooSmall).toEqual([]);
          await leaveState(mapPage, state);
        });
      }
    },
  );
}

/*
 * A field's placeholder must fit its box in every language, or it ends in an
 * ellipsis and loses its meaning. The Directions place search is cut off
 * already in English on a 320 pixel phone (#395), so its test is
 * marked `fixme` until that is fixed, and the search pill's is run.
 */
for (const viewport of SAMPLE_VIEWPORTS) {
  test(
    `the search pill's placeholder fits at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage, language }) => {
      test.skip(language === null, "Runs in the sample languages only.");
      await page.setViewportSize(viewport);
      await mapPage.goto();
      expect(await findClippedPlaceholders(page)).toEqual([]);
    },
  );

  test(
    `the directions place search's placeholder fits at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage, language }) => {
      test.skip(language === null, "Runs in the sample languages only.");
      test.fixme(true, "#395");
      await page.setViewportSize(viewport);
      await scriptSearch(page);
      await mapPage.goto();
      await enterState(mapPage, "directions open");
      expect(await findClippedPlaceholders(page)).toEqual([]);
    },
  );
}
