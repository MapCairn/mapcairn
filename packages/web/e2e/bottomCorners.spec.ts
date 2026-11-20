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
import { CONNECTION_SETTLE_MS, TIMER_SLACK_MS } from "./support/timers";

/*
 * The bottom-corner controls (the credits button and its popover, the scale
 * bar and readout, and the map key) move only when a surface that opens would
 * otherwise cover them, and then only as far as they need to; otherwise they
 * hold still. DESIGN.md, "Layout and slots".
 */

test.use({ reducedMotion: "reduce", fastCredits: true });

/** A box in CSS pixels. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The tolerance, in px, for two positions to count as the same. */
const TOLERANCE = 0.5;

/**
 * The tolerance, in px, for a control to count as not having moved: the chrome
 * measures whole pixels (`offsetTop`) where a box can be fractional.
 */
const ROUNDING_PX = 1;

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
    (edge) => Math.abs(a[edge] - b[edge]) <= ROUNDING_PX,
  );
}

/** A box grown by `by` on every side. */
function grown(box: Box, by: number): Box {
  return {
    left: box.left - by,
    top: box.top - by,
    right: box.right + by,
    bottom: box.bottom + by,
  };
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
  const context = `${name} ${walk.context}`;
  if (!before) {
    return;
  }
  expect
    .soft(
      now,
      `${context}: it is still on screen (none of these states gives it way)`,
    )
    .toBeDefined();
  if (!now) {
    return;
  }
  // A surface closer than a gap counts as covering: a control keeps a gap clear.
  const reach = grown(before, CHROME_GAP_PX);
  if (!walk.covering.some((surface) => intersects(reach, surface))) {
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
      ? Math.abs(rest.credits.top - after.credits.top) > ROUNDING_PX
      : false;
  // The readout moves along when the side panel opens, and can then come
  // under a popover that had it clear.
  const crowds = [after.readout, ...walk.covering].filter(
    (box): box is Box => box !== undefined,
  );
  const reach = grown(walk.restPopover, CHROME_GAP_PX);
  const crowded = crowds.some((box) => intersects(reach, box));
  if (!buttonMoved && !crowded) {
    expect
      .soft(
        sameBox(popover, walk.restPopover),
        `${context} holds still (${JSON.stringify(walk.restPopover)} then ${JSON.stringify(popover)})`,
      )
      .toBe(true);
  }
  for (const box of crowds) {
    expect
      .soft(intersects(popover, box), `${context} clears what is beside it`)
      .toBe(false);
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
    // Next to its button, or, where it shares width with the readout or a
    // toolbar, a step above the top of that, the least that clears it.
    const nextTo = [after.credits, ...crowds].some(
      (box) => Math.abs(box.top - popover.bottom) <= 2 * CHROME_GAP_PX,
    );
    expect
      .soft(nextTo, `${context} stays next to its button or what it clears`)
      .toBe(true);
  }
}

/** A viewport of the matrix. */
interface Size {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** One state of the chrome. */
type ToolState = (typeof TOOL_STATES)[number];

/** Larger text, set the way `text-size.spec.ts` sets it. */
async function setTextSize(page: Page, size: string): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = value;
  }, size);
}

/**
 * One test for each size and state: the corner controls before and after the
 * state is entered. `textSize` is applied before the first reading.
 */
function defineMatrix(
  sizes: readonly Size[],
  states: readonly ToolState[],
  textSize?: string,
): void {
  for (const size of sizes) {
    for (const state of states) {
      test(`each bottom-corner control holds still unless it would be covered, and then clears it, with ${state} at ${size.name}`, async ({
        page,
        mapPage,
      }) => {
        await mockLayerProviders(page);
        await page.setViewportSize(size);
        await scriptSearch(page);
        await mapPage.goto(KEYED_LAYERS);
        await collapseCredits(mapPage);
        if (textSize) {
          await setTextSize(page, textSize);
        }
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
  }
}

defineMatrix(SIZES, TOOL_STATES);

/** A phone on its side gets the side panel layout, with little height. */
const LANDSCAPE_PHONE = { name: "landscape phone", width: 844, height: 390 };

test.describe("landscape phone", () => {
  defineMatrix(
    [LANDSCAPE_PHONE],
    ["measure active", "draw active", "sheet open"],
  );
});

test.describe("right to left", () => {
  test.use({ direction: "rtl" });
  defineMatrix(
    [SIZES[1], SIZES[2]],
    ["measure active", "draw active", "sheet open"],
  );
});

test.describe("Afrikaans, whose toolbar words are longer", () => {
  test.use({ language: "af" });
  defineMatrix([SIZES[1], SIZES[2]], ["measure active", "draw active"]);
});

test.describe("200 percent text", () => {
  defineMatrix([SIZES[1], SIZES[2]], ["measure active", "draw active"], "200%");
});

test("a live resize with a tool open lifts the corners where the toolbar spans the row and lets them rest where it does not", async ({
  page,
  mapPage,
}) => {
  await mockLayerProviders(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await mapPage.goto(KEYED_LAYERS);
  await collapseCredits(mapPage);
  await mapPage.startMeasuring();
  await waitForStableLayout(page);
  const restingBottom = (height: number) => height - CHROME_GAP_PX;

  for (const size of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    await waitForStableLayout(page);
    const credits = await boxOf(page, CONTROLS.credits);
    const toolbar = await boxOf(page, '[data-chrome="bottom-centre"]');
    expect(credits, `credits at ${size.width}`).not.toBeNull();
    expect(toolbar, `toolbar at ${size.width}`).not.toBeNull();
    if (size.width < 768) {
      expect(
        intersects(credits as Box, toolbar as Box),
        `credits clear the toolbar at ${size.width}`,
      ).toBe(false);
      expect(
        (credits as Box).bottom,
        `credits are lifted at ${size.width}`,
      ).toBeLessThan(restingBottom(size.height) - TOLERANCE);
    } else {
      expect(
        Math.abs((credits as Box).bottom - restingBottom(size.height)),
        `credits rest at ${size.width}`,
      ).toBeLessThanOrEqual(ROUNDING_PX);
    }
  }
});

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

test("the credits popover clears a message that arrives while it is open at tablet size", async ({
  page,
  context,
  mapPage,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await mapPage.goto("#map=15.00/48.85660/2.35220");
  await collapseCredits(mapPage);
  await mapPage.creditsButton.click();
  await expect(mapPage.creditsRegion).toBeVisible();

  await context.setOffline(true);
  await page.waitForFunction(() => navigator.onLine === false);
  await page.clock.runFor(CONNECTION_SETTLE_MS + TIMER_SLACK_MS);
  await expect(page.getByTestId("connection-notice")).toBeVisible();
  await waitForStableLayout(page);

  const popover = await boxOf(page, '[data-chrome="attribution-popover"]');
  const notice = await boxOf(page, '[data-chrome="bottom-centre"]');
  expect(popover).not.toBeNull();
  expect(notice).not.toBeNull();
  // The case proves something only if the notice comes within a gap of the
  // popover's width: without that the two could not overlap either way.
  expect(
    (notice?.right ?? 0) + CHROME_GAP_PX,
    "the notice reaches the popover's width",
  ).toBeGreaterThan(popover?.left ?? Number.POSITIVE_INFINITY);
  expect(
    popover && notice && intersects(popover, notice),
    `the popover ${JSON.stringify(popover)} and the notice ${JSON.stringify(notice)} overlap`,
  ).toBe(false);
});

/** A frame in which the popover and the bottom-centre slot were over each other. */
interface OverFrame {
  readonly frame: number;
  readonly popover: Box;
  readonly centre: Box;
}

/**
 * Records, on every animation frame while `action` runs and for a few frames
 * after it, whether the credits popover is over the bottom-centre slot. A
 * sample is also read from a ResizeObserver callback that runs after
 * `MapChrome`'s own in the same frame, so it is the state the frame is about
 * to draw.
 */
async function overFramesDuring(
  page: Page,
  action: () => Promise<void>,
): Promise<{ frames: number; over: OverFrame[]; withSlot: number }> {
  await page.evaluate(() => {
    const state = {
      running: true,
      frames: 0,
      withSlot: 0,
      over: [] as { frame: number; popover: Box; centre: Box }[],
    };
    const channel = new MessageChannel();
    const read = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          }
        : null;
    };
    const sample = () => {
      const popover = read('[data-chrome="attribution-popover"]:not([hidden])');
      const centre = read('[data-chrome="bottom-centre"]');
      if (!popover || !centre) {
        return;
      }
      state.frames += 1;
      state.withSlot += 1;
      const overlap =
        popover.left < centre.right - 0.5 &&
        centre.left < popover.right - 0.5 &&
        popover.top < centre.bottom - 0.5 &&
        centre.top < popover.bottom - 0.5;
      if (overlap) {
        state.over.push({ frame: state.frames, popover, centre });
      }
    };
    const observer = new ResizeObserver(sample);
    const watched = new Set<Element>();
    const watch = () => {
      for (const target of document.querySelectorAll(
        '[data-chrome="bottom-centre"], [data-chrome="attribution-popover"]',
      )) {
        if (!watched.has(target)) {
          watched.add(target);
          observer.observe(target);
        }
      }
    };
    new MutationObserver(watch).observe(document.body, {
      childList: true,
      subtree: true,
    });
    watch();
    const heartbeat = () => {
      sample();
      if (state.running) {
        requestAnimationFrame(() => channel.port2.postMessage(null));
      } else {
        observer.disconnect();
      }
    };
    channel.port1.onmessage = heartbeat;
    channel.port2.postMessage(null);
    (window as unknown as { __over: typeof state }).__over = state;
  });
  await action();
  await page.evaluate(async () => {
    for (let index = 0; index < 12; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        __over: {
          running: boolean;
          frames: number;
          withSlot: number;
          over: { frame: number; popover: Box; centre: Box }[];
        };
      }
    ).__over;
    state.running = false;
    return {
      frames: state.frames,
      over: state.over,
      withSlot: state.withSlot,
    };
  });
}

/*
 * A long credits list (six layers on) with the draw toolbar open on a short
 * tablet: the room above the button is too small once the popover rises over
 * the toolbar, so the popover moves beside the end stack and shows every link,
 * and does not stay above the button in a smaller box that scrolls.
 */
for (const height of [600, 680]) {
  test(`the credits popover shows every link and clears the draw toolbar at 820x${height}`, async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize({ width: 820, height });
    await mapPage.goto(KEYED_LAYERS);
    await collapseCredits(mapPage);
    await mapPage.startDrawing();
    await waitForStableLayout(page);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toBeVisible();
    await waitForStableLayout(page);

    const scrolls = await mapPage.creditsRegion.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    expect(scrolls, "the popover scrolls").toBe(false);
    const popover = await boxOf(page, '[data-chrome="attribution-popover"]');
    const toolbar = await boxOf(page, '[data-chrome="bottom-centre"]');
    expect(popover && toolbar && intersects(popover, toolbar)).toBe(false);
  });
}

/*
 * Real time and real frames: the page clock the other cases install replays its
 * animation frames in one batch, without the layout observers in between, so
 * it cannot show what a frame draws. The credits show themselves for their
 * first five seconds, which is the time a notice is likeliest to arrive.
 */
test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference", fastCredits: false });

  test("the credits popover is never over a message that arrives while it is open, in any frame, at tablet size", async ({
    page,
    context,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await mapPage.goto("#map=15.00/48.85660/2.35220");
    await expect(mapPage.creditsRegion).toBeVisible();

    const result = await overFramesDuring(page, async () => {
      await context.setOffline(true);
      await expect(page.getByTestId("connection-notice")).toBeVisible({
        timeout: CONNECTION_SETTLE_MS + TIMER_SLACK_MS * 5,
      });
    });
    // The frames prove something only if the notice was on screen in some, and
    // the popover was still open beside it.
    expect(result.withSlot, "frames with the notice on screen").toBeGreaterThan(
      0,
    );
    expect(result.over, "frames with the popover over the notice").toEqual([]);
  });
});
