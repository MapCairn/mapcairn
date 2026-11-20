// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import AxeBuilder from "@axe-core/playwright";
import { compositeOver, contrastRatio } from "@mapcairn/theme";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { DesignPage } from "./pages/DesignPage";
import { AXE_TAGS } from "./support/a11y";

/*
 * A host theme made by `createThemeStylesheet`, served from the app's own
 * origin and linked into the living style guide at /design, which renders
 * real SDK components under the strict policy. The stylesheets come from
 * `/design/host-theme/:name` (`src/routes/design.host-theme.ts`), a route in
 * development and e2e builds that calls the generator in the app's own build,
 * as a host's route or build step would: the generated names match the page's
 * own stylesheet only when both come from one build.
 *
 * The guide is one page with no map, so the two scopes wrap two demos of it
 * rather than two `MapView`s; the mechanism (a scope selector, `data-theme`
 * on the root element and the guarded rules) is the same.
 *
 * Playwright cannot emulate `prefers-reduced-transparency` or a browser
 * without `backdrop-filter`, so the opaque surfaces are covered by the
 * generator's unit tests. There is no Firefox project, so Chromium and
 * WebKit are the engines whose parsing of the media queries is proved here.
 */

/** The colours `src/designGuide/hostThemes.ts` gives each scope. */
const GREEN = {
  name: "green",
  testId: "demo-Button",
  scope: ".host-green",
  light: { accent: "#0b5c3a" },
  dark: { accent: "#7fd9aa" },
};
const BROWN = {
  name: "brown",
  testId: "demo-Chip",
  scope: "#host-brown",
  light: { accent: "#7a3b00", tint: "#fbe6d2" },
  dark: { accent: "#f5b97f", tint: "#3a2412" },
};
/** Changes the surface and text, the roles a tooltip bubble reads. */
const SAGE = {
  name: "sage",
  testId: "demo-Tooltip",
  scope: ".host-sage",
  light: { surface: "#e3f1eb", text: "#0a2a1e" },
  dark: { surface: "#0a1c14", text: "#e4f4ec" },
};
const THEMES = [GREEN, BROWN, SAGE];

// Transitions are off so a computed colour is read at its end value.
test.use({ reducedMotion: "reduce" });

/** The `rgb()` a hex colour computes to. */
function rgb(hex: string): string {
  const channel = (index: number): number =>
    Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

const sheetUrl = (name: string): string => `/design/host-theme/${name}`;

/** Starts recording the policy violations the page reports, from before it loads. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorded: string[] = [];
    Object.assign(window, { __cspViolations: recorded });
    document.addEventListener("securitypolicyviolation", (event) => {
      recorded.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
}

function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
}

/** Loads the style guide with no host theme on it. */
async function openGuide(page: Page): Promise<DesignPage> {
  const design = new DesignPage(page);
  await design.goto();
  return design;
}

/** Puts each scope on its own demo and links its stylesheet, as a host would. */
async function applyThemes(page: Page): Promise<void> {
  for (const { name, scope, testId } of THEMES) {
    await page.getByTestId(testId).evaluate((element, selector) => {
      if (selector.startsWith("#")) {
        element.id = selector.slice(1);
      } else {
        element.classList.add(selector.slice(1));
      }
    }, scope);
    await page.addStyleTag({ url: sheetUrl(name) });
  }
}

const primaryButton = (page: Page): Locator =>
  page.getByTestId("demo-Button").getByRole("button", { name: "Drop pin" });

/** The selected chip: its tint is the accent tint and its edge the accent. */
const selectedChip = (page: Page): Locator =>
  page
    .getByTestId("demo-Chip")
    .getByRole("button", { name: "Streets", pressed: true });

/** The row of the list that is the current choice, outside both scopes. */
const unthemedRow = (page: Page): Locator =>
  page.getByTestId("demo-ListRow").locator('[aria-current="true"]').first();

const background = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

const edge = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => getComputedStyle(element).borderTopColor);

const faceNorth = (page: Page): Locator =>
  page.getByTestId(SAGE.testId).getByRole("button", { name: "Face north" });

/**
 * The tooltip bubble. Radix renders it in a portal under `body`, outside the
 * demo that carries the scope, and keeps a visually hidden copy for
 * assistive technology, which this skips.
 */
const bubble = (page: Page): Locator =>
  page.locator("[data-radix-popper-content-wrapper] > [data-side]");

/** Opens the tooltip with the keyboard, or skips where the device cannot hover. */
async function openTooltip(page: Page): Promise<void> {
  const hovers = await page.evaluate(
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  test.skip(!hovers, "A touch screen has no tooltips");
  await showTooltip(page);
}

/**
 * Focuses the control with the tooltip. The control is scrolled into view
 * first because a scroll closes an open tooltip, and focusing it would
 * otherwise scroll after the tooltip opens.
 */
async function showTooltip(page: Page): Promise<void> {
  await faceNorth(page).scrollIntoViewIfNeeded();
  await faceNorth(page).focus();
  await expect(bubble(page)).toBeVisible();
}

const textColour = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => getComputedStyle(element).color);

/** The bubble's text colour and surface, as the browser computes them. */
interface BubbleColours {
  text: string;
  surface: string;
}

const BUBBLE_SELECTOR = "[data-radix-popper-content-wrapper] > [data-side]";

/**
 * Reads both colours in one step, so the bubble cannot close between them,
 * and opens the tooltip again if a late scroll or layout shift closed it.
 */
async function bubbleColours(page: Page): Promise<BubbleColours> {
  let read: BubbleColours | null = null;
  await expect(async () => {
    if ((await bubble(page).count()) === 0) {
      await faceNorth(page).blur();
      await showTooltip(page);
    }
    read = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (element === null) {
        return null;
      }
      const style = getComputedStyle(element);
      return { text: style.color, surface: style.backgroundColor };
    }, BUBBLE_SELECTOR);
    expect(read).not.toBeNull();
  }).toPass();
  return read as unknown as BubbleColours;
}

/** The red, green and blue of a computed `rgb()`, `rgba()` or `color(srgb ...)`. */
function channelsOf(computed: string): number[] {
  const numbers = computed.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const scale = computed.startsWith("color(") ? 255 : 1;
  return numbers.slice(0, 3).map((value) => value * scale);
}

/** Expects a computed colour to be a hex colour, give or take one step per channel. */
function expectColour(computed: string, hex: string): void {
  const actual = channelsOf(computed);
  const wanted = channelsOf(rgb(hex));
  expect(actual, `${computed} is not ${hex}`).toHaveLength(3);
  for (const [index, channel] of wanted.entries()) {
    expect(
      Math.abs((actual[index] ?? Number.NaN) - channel),
    ).toBeLessThanOrEqual(1);
  }
}

test.describe("a generated host theme", () => {
  test("applies to its own scope in each theme, from a same-origin file under the strict policy", async ({
    page,
  }) => {
    await recordViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
    const design = await openGuide(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const unthemed = await background(unthemedRow(page));
    await applyThemes(page);

    expect(await background(primaryButton(page))).toBe(rgb(GREEN.light.accent));
    expect(await edge(selectedChip(page))).toBe(rgb(BROWN.light.accent));
    expect(await background(selectedChip(page))).toBe(rgb(BROWN.light.tint));
    expect(await background(unthemedRow(page))).toBe(unthemed);

    await design.themeControl.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await background(primaryButton(page))).toBe(rgb(GREEN.dark.accent));
    expect(await edge(selectedChip(page))).toBe(rgb(BROWN.dark.accent));
    expect(await background(selectedChip(page))).toBe(rgb(BROWN.dark.tint));

    expect(await cspViolations(page)).toEqual([]);
  });

  test("reaches a tooltip, which renders outside the scope", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const design = await openGuide(page);
    await applyThemes(page);
    await openTooltip(page);

    const light = await bubbleColours(page);
    expectColour(light.text, SAGE.light.text);
    expectColour(light.surface, SAGE.light.surface);
    await expect(page.locator(`.host-sage [data-side]`)).toHaveCount(0);

    await faceNorth(page).blur();
    await design.themeControl.getByRole("radio", { name: "Dark" }).click();
    await showTooltip(page);
    const dark = await bubbleColours(page);
    expectColour(dark.text, SAGE.dark.text);
    expectColour(dark.surface, SAGE.dark.surface);
  });

  test("leaves a tooltip with no scope in the SDK's colours", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openGuide(page);
    await applyThemes(page);
    await page.getByTestId(SAGE.testId).evaluate((element) => {
      element.classList.remove("host-sage");
    });
    await openTooltip(page);

    // An unscoped heading reads the same text token as the bubble does.
    const sdkText = await textColour(
      page.getByTestId("demo-SkipLink").locator("h3"),
    );
    expect(sdkText).not.toBe(rgb(SAGE.light.text));
    expect((await bubbleColours(page)).text).toBe(sdkText);
  });

  test("is served from the app's own origin, for the policy that blocks inline styles", async ({
    page,
  }) => {
    await page.goto("/design");
    const sheet = await page.request.get(sheetUrl(GREEN.name));

    expect(sheet.status()).toBe(200);
    expect(sheet.headers()["content-type"]).toContain("text/css");
    expect(await sheet.text()).toContain(GREEN.scope);
    const policy = (await page.request.get("/design")).headers()[
      "content-security-policy"
    ];
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("unsafe-inline");
  });

  test("follows the system theme when the page has no data-theme attribute", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openGuide(page);
    await applyThemes(page);
    await page.evaluate(() =>
      document.documentElement.removeAttribute("data-theme"),
    );
    expect(await background(primaryButton(page))).toBe(rgb(GREEN.dark.accent));
    expect(await background(selectedChip(page))).toBe(rgb(BROWN.dark.tint));

    await page.emulateMedia({ colorScheme: "light" });
    expect(await background(primaryButton(page))).toBe(rgb(GREEN.light.accent));
    expect(await background(selectedChip(page))).toBe(rgb(BROWN.light.tint));
  });

  for (const emulation of [
    { name: "high contrast", media: { contrast: "more" } },
    { name: "forced colours", media: { forcedColors: "active" } },
  ] as const) {
    test(`keeps the SDK's own values under ${emulation.name}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "light", ...emulation.media });
      await openGuide(page);
      const sdkButton = await background(primaryButton(page));
      const sdkChip = await background(selectedChip(page));
      await applyThemes(page);

      expect(await background(primaryButton(page))).toBe(sdkButton);
      expect(await background(selectedChip(page))).toBe(sdkChip);
      expect(await background(primaryButton(page))).not.toBe(
        rgb(GREEN.light.accent),
      );

      await page.emulateMedia({
        colorScheme: "light",
        contrast: null,
        forcedColors: null,
      });
      expect(await background(primaryButton(page))).toBe(
        rgb(GREEN.light.accent),
      );
    });
  }

  test("is written in media queries this browser parses", async ({ page }) => {
    await page.goto("/design");
    const queries: string[] = [];
    for (const { name } of THEMES) {
      const css = await (await page.request.get(sheetUrl(name))).text();
      queries.push(
        ...[...css.matchAll(/^@media (.+) \{$/gm)].flatMap(
          (match) => match[1] ?? [],
        ),
      );
    }
    expect(queries.length).toBeGreaterThan(0);

    const unparsed = await page.evaluate(
      (list) =>
        list.filter((query) => window.matchMedia(query).media === "not all"),
      queries,
    );
    expect(unparsed).toEqual([]);
  });
});

test.describe("a generated host theme accessibility @a11y", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`passes axe inside both scopes in the ${colorScheme} theme @a11y`, async ({
      page,
    }) => {
      test.slow();
      await page.emulateMedia({ colorScheme });
      await openGuide(page);
      await applyThemes(page);
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        colorScheme,
      );

      const scan = new AxeBuilder({ page }).withTags(AXE_TAGS);
      for (const { testId } of THEMES) {
        scan.include(`[data-testid="${testId}"]`);
      }
      const results = await scan.analyze();

      expect(
        results.violations.flatMap((violation) =>
          violation.nodes.map(
            (node) => `${violation.id}: ${node.target.join(" ")}`,
          ),
        ),
      ).toEqual([]);
      expect(results.passes.length).toBeGreaterThan(0);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    // Axe does not measure text on a translucent surface in a portal, so the
    // ratio is worked out here, over the two backdrops that bound it.
    test(`keeps a tooltip in a scoped theme at 4.5:1 over any backdrop in the ${colorScheme} theme @a11y`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openGuide(page);
      await applyThemes(page);
      await openTooltip(page);

      const { text, surface } = await bubbleColours(page);
      // The SDK's own colours also pass, so first prove the bubble is themed.
      expectColour(text, SAGE[colorScheme].text);
      expectColour(surface, SAGE[colorScheme].surface);
      for (const backdrop of ["#ffffff", "#000000"]) {
        const flattened = compositeOver(surface, backdrop);
        expect(contrastRatio(text, flattened)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
