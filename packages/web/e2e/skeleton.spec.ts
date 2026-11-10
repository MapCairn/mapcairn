import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { viewportDetails, waitForCreditsCollapsed } from "./support/states";

/*
 * The server-rendered chrome skeleton: the page as the server sends it, with
 * every app script removed so nothing hydrates, against the same page after
 * the app has mounted. Each control must be in the same place, so the live
 * chrome replaces the skeleton without a shift.
 */

/** The largest difference in any edge, in CSS pixels, that still counts as the same box. */
const MAX_SHIFT_PX = 1;

/** The viewports checked: a phone and a desktop. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
] as const;

/**
 * Blocks the app's script files, so what renders is the server's HTML and
 * nothing replaces it. The inline pre-paint theme script still runs, because
 * it is part of the page, not a file. Returns a function that lets the files
 * load again. Blocking requests, rather than rewriting the HTML with a regular
 * expression, cannot miss a tag.
 */
async function serveWithoutAppScripts(
  page: Page,
): Promise<() => Promise<void>> {
  const isScriptFile = (url: URL) => url.pathname.endsWith(".js");
  const block: Parameters<Page["route"]>[1] = (route) => route.abort();
  await page.route(isScriptFile, block);
  return () => page.unroute(isScriptFile, block);
}

interface Pair {
  readonly name: string;
  readonly skeleton: (page: Page) => Locator;
  readonly live: (page: Page) => Locator;
}

const inSkeleton = (page: Page) => page.getByTestId("chrome-skeleton");
const button = (page: Page, label: string) =>
  inSkeleton(page).locator(`button[aria-label="${label}"]`);

/** Every control of the skeleton and the live control it stands in for. */
const PAIRS: readonly Pair[] = [
  {
    name: "search pill",
    skeleton: (page) => inSkeleton(page).locator('[data-skeleton="search"]'),
    live: (page) => page.getByTestId("search-pill"),
  },
  {
    name: "search button",
    skeleton: (page) => button(page, "Search"),
    live: (page) => page.getByTestId("location-search-submit"),
  },
  {
    name: "map controls",
    skeleton: (page) => inSkeleton(page).locator('[data-skeleton="controls"]'),
    live: (page) => page.getByRole("group", { name: "Map controls" }),
  },
  {
    name: "Map options",
    skeleton: (page) => button(page, "Map options"),
    live: (page) => page.getByRole("button", { name: "Map options" }),
  },
  {
    name: "Measure",
    skeleton: (page) => button(page, "Measure distance and area"),
    live: (page) =>
      page.getByRole("button", { name: "Measure distance and area" }),
  },
  {
    name: "Directions",
    skeleton: (page) => button(page, "Directions"),
    live: (page) => page.getByRole("button", { name: "Directions" }),
  },
  {
    name: "Draw shapes",
    skeleton: (page) => button(page, "Draw shapes"),
    live: (page) => page.getByRole("button", { name: "Draw shapes" }),
  },
  {
    name: "Locate me",
    skeleton: (page) => button(page, "Locate me"),
    live: (page) => page.getByRole("button", { name: "Locate me" }),
  },
  {
    name: "Settings",
    skeleton: (page) => button(page, "Settings"),
    live: (page) => page.getByRole("button", { name: "Settings", exact: true }),
  },
  {
    name: "zoom controls",
    skeleton: (page) => inSkeleton(page).locator('[data-skeleton="zoom"]'),
    live: (page) => page.getByRole("group", { name: "Zoom controls" }),
  },
  {
    name: "Zoom in",
    skeleton: (page) => button(page, "Zoom in"),
    live: (page) => page.getByRole("button", { name: "Zoom in" }),
  },
  {
    name: "Zoom out",
    skeleton: (page) => button(page, "Zoom out"),
    live: (page) => page.getByRole("button", { name: "Zoom out" }),
  },
  {
    name: "credits button",
    skeleton: (page) => button(page, "Map credits"),
    live: (page) => page.getByRole("button", { name: "Map credits" }),
  },
];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The boxes of a locator that matches nothing (a hidden zoom group) are null. */
async function boxes(
  page: Page,
  pick: (pair: Pair) => (page: Page) => Locator,
): Promise<Map<string, Box | null>> {
  const found = new Map<string, Box | null>();
  for (const pair of PAIRS) {
    const locator = pick(pair)(page);
    const box =
      (await locator.count()) === 0 ? null : await locator.boundingBox();
    found.set(pair.name, box);
  }
  return found;
}

for (const viewport of VIEWPORTS) {
  test.describe(`chrome skeleton at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test(
      "puts every control where the live chrome puts it",
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        const serveNormally = await serveWithoutAppScripts(page);
        await page.goto("/");
        await expect(inSkeleton(page)).toBeVisible();
        await expect(page.getByTestId("map-chrome")).toHaveCount(0);
        const before = await boxes(page, (pair) => pair.skeleton);
        expect(before.get("search pill")).not.toBeNull();
        expect(before.get("credits button")).not.toBeNull();
        expect(before.get("map controls")).not.toBeNull();

        await serveNormally();
        await mapPage.goto();
        await expect(inSkeleton(page)).toHaveCount(0);
        // The credits show themselves once; the button does not move for it,
        // but wait for the first showing to end so the layout is at rest.
        await waitForCreditsCollapsed(mapPage);
        const after = await boxes(page, (pair) => pair.live);

        for (const pair of PAIRS) {
          const skeleton = before.get(pair.name) ?? null;
          const live = after.get(pair.name) ?? null;
          if (skeleton === null || live === null) {
            // Zoom controls follow the pointer, which the skeleton also does,
            // so both are there or neither is.
            expect(skeleton === null, `${pair.name} presence`).toBe(
              live === null,
            );
            continue;
          }
          for (const edge of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(skeleton[edge] - live[edge]),
              `${pair.name} ${edge}: skeleton ${skeleton[edge]}, live ${live[edge]}`,
            ).toBeLessThan(MAX_SHIFT_PX);
          }
        }
      },
    );
  });
}

test.describe("chrome skeleton rendering", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`is decorative, on the map colour, with no focusable control and no axe violation in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await serveWithoutAppScripts(page);
      await page.goto("/");
      const skeleton = inSkeleton(page);
      await expect(skeleton).toBeVisible();
      await expect(skeleton).toHaveAttribute("aria-hidden", "true");
      await expect(skeleton).toHaveAttribute("inert", "");

      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const focusedInside = await page.evaluate(
        () =>
          document
            .querySelector('[data-testid="chrome-skeleton"]')
            ?.contains(document.activeElement) ?? false,
      );
      expect(focusedInside).toBe(false);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
