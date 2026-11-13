// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations, inspectControls } from "./support/a11y";
import { BROKEN, QUAKES, RAINFALL, WINDS } from "./support/catalogueLayers";
import { mockLayerProviders } from "./support/layers";
import { refreshCatalogue, scriptCatalogue } from "./support/services";
import { waitForStableLayout } from "./support/states";

/** An answer held back for as long as a test needs to look at the loading state. */
const LOADING_HOLD_MS = 60_000;

const PHONE = { name: "phone", width: 390, height: 844 } as const;
const TABLET = { name: "tablet", width: 820, height: 1180 } as const;
const DESKTOP = { name: "desktop", width: 1440, height: 900 } as const;

/** One state of a scripted catalogue, and how to put the page in it. */
interface CatalogueCase {
  readonly name: string;
  /** Loads the page with the catalogue scripted for this state. The sheet is still closed. */
  readonly setup: (
    page: Parameters<typeof scriptCatalogue>[0],
    mapPage: MapPage,
  ) => Promise<void>;
  /** The words the section must show, so a case cannot pass on a section that never reached its state. */
  readonly shows: string;
  /** The sizes it is checked at. Every state is checked at phone width, where the section is tightest. */
  readonly sizes: readonly { name: string; width: number; height: number }[];
}

const CASES: readonly CatalogueCase[] = [
  {
    name: "loading",
    shows: "Loading layers",
    sizes: [PHONE],
    setup: async (page, mapPage) => {
      await scriptCatalogue(page, [[RAINFALL]], LOADING_HOLD_MS);
      await mapPage.goto();
    },
  },
  {
    name: "failed with Try again",
    shows: "Layers could not be loaded.",
    sizes: [PHONE, TABLET, DESKTOP],
    setup: async (page, mapPage) => {
      await scriptCatalogue(page, ["fail"]);
      await mapPage.goto();
    },
  },
  {
    name: "empty",
    shows: "No layers are available.",
    sizes: [PHONE],
    setup: async (page, mapPage) => {
      await scriptCatalogue(page, [[]]);
      await mapPage.goto();
    },
  },
  {
    name: "a link layer that arrived, with skipped layers",
    shows: "2 layers could not be shown",
    sizes: [PHONE],
    setup: async (page, mapPage) => {
      await scriptCatalogue(page, [[RAINFALL, WINDS, BROKEN, {}]]);
      await mapPage.goto("#layers=catalogue-wind,retired");
    },
  },
  {
    name: "a failed refresh keeping the last list",
    shows: "Layers could not be updated. Showing the last list.",
    sizes: [PHONE, TABLET, DESKTOP],
    setup: async (page, mapPage) => {
      await scriptCatalogue(page, [[RAINFALL, QUAKES], "fail"]);
      await mapPage.goto();
      await page.waitForFunction(
        () => window.__mapcairnCatalogue?.getState().status === "ready",
      );
      await refreshCatalogue(page);
    },
  },
];

test.describe("the Layers section's catalogue states @a11y", () => {
  test.use({ reducedMotion: "reduce" });

  for (const { name, shows, setup, sizes } of CASES) {
    for (const size of sizes) {
      for (const colorScheme of ["light", "dark"] as const) {
        test(`${name} passes axe in ${colorScheme} at ${size.name} width @a11y`, async ({
          page,
          mapPage,
        }) => {
          await mockLayerProviders(page);
          await page.setViewportSize(size);
          await page.emulateMedia({ colorScheme });
          await setup(page, mapPage);
          await mapPage.openMapOptions();
          await expect(mapPage.layersSection).toContainText(shows);
          await mapPage.layersSection.scrollIntoViewIfNeeded();
          await waitForStableLayout(page);

          expect(await axeViolations(page)).toEqual([]);
          const controls = await inspectControls(page);
          expect(controls.unnamed).toEqual([]);
          expect(controls.tooSmall).toEqual([]);
        });
      }
    }
  }
});
