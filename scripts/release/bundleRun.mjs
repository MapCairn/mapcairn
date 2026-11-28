// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Draws pages that use `@mapcairn/sdk/browser` in the repository's Playwright
 * Chromium and prints what it saw, a line for each check that passed. The
 * consumer check runs this in a child process (`consumerCheck.mjs`), so a
 * failure cannot leave a browser, a server or a development server behind.
 *
 *   node scripts/release/bundleRun.mjs page  <folder> <Chromium binary>
 *   node scripts/release/bundleRun.mjs built <folder> <Chromium binary>
 *   node scripts/release/bundleRun.mjs dev   <app>    <Chromium binary>
 *
 * A fourth argument, `webkit` or `firefox`, runs the same mode in that
 * engine (the Chromium argument is then ignored).
 *
 * `page` takes a folder that holds the example page (`index.html`), the
 * leg's own pages (`consumer-bundle/`) and the bundle's files in `mapcairn/`,
 * served as a plain static server would, under `BUNDLE_POLICY`. `built` draws
 * the output of a bundler build the same way, and `dev` starts the app's Vite
 * development server and draws the page it serves, with no setting for the
 * bundle. Every request outside the page's own origin is answered from the
 * default basemap's fixtures or refused. The Playwright is the one the
 * repository already installs.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { connect, createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import { violationProblems } from "./browserLeg.mjs";
import {
  BUNDLE_POLICY,
  blobWorkerProblems,
  COUNT_PAGE_ACTIVITY,
  createdElementProblems,
  cycleProblems,
  elementProblems,
  fileRequestProblems,
  GLOBE_ANNOUNCEMENT,
  hostilePageProblems,
  hostParityProblems,
  hostStyleProblems,
  leakProblems,
  MOVED_ZOOM,
  plantedStyleProblems,
  privateElementProblems,
  reachProblems,
  twoCopiesProblems,
  workerRefusalProblems,
} from "./bundleLeg.mjs";
import { OPEN_FREE_MAP_ORIGIN } from "./openFreeMapFixtures.mjs";
import { policyWithout, quickstartProblems } from "./quickstartLeg.mjs";
import { drawnFrame, openPage, openUnder } from "./quickstartRun.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** Where the example's files are served from, as the example page names them. */
const FILES_FOLDER = "/mapcairn";

/** How long a development server may take to answer, a blocked page to report and a worker to end, in ms. */
const SERVER_TIMEOUT = 60 * 1000;
const REFUSAL_TIMEOUT = 10 * 1000;
const SETTLE_TIMEOUT = 10 * 1000;
const POLL_INTERVAL = 250;

/** What the frame check reads: WebKit's is without the pixel (`drawnFrame`). */
const frame = { pixel: true };

/** How long the second map has to say it moved, in ms. */
const MOVE_TIMEOUT = 10 * 1000;

/**
 * Runs the two-map cycle in the page: mounts two maps, destroys the first,
 * then the second, and reads the page at each step.
 *
 * @param {import("playwright-core").Page} page The leg's `two.html`.
 * @returns {Promise<{ cycle: import("./bundleLeg.mjs").Cycle, attributes: import("./bundleLeg.mjs").Attributes }[]>} Two cycles.
 */
async function twoMapCycles(page) {
  /** @type {{ cycle: import("./bundleLeg.mjs").Cycle, attributes: import("./bundleLeg.mjs").Attributes }[]} */
  const cycles = [];
  for (let run = 0; run < 2; run += 1) {
    const afterBoth = await page.evaluate(
      async ({ zoom, timeout }) => {
        const win = /** @type {any} */ (window);
        const first = /** @type {HTMLElement} */ (
          document.getElementById("first")
        );
        const second = /** @type {HTMLElement} */ (
          document.getElementById("second")
        );
        const hold = () => {
          const activity = win.__activity;
          return {
            canvases: document.querySelectorAll("canvas").length,
            regions: document.querySelectorAll("[aria-live]").length,
            listeners: activity.listeners(),
            workers: activity.workers(),
          };
        };
        const attributes = {
          first: first.getAttributeNames(),
          second: second.getAttributeNames(),
        };
        const one = win.mountMap(first, { label: "First map" });
        const two = win.mountMap(second, { label: "Second map" });
        await Promise.all([one.ready, two.ready]);
        const both = hold();
        const moved = new Promise((resolve) =>
          two.on("viewchange", (view) => resolve(view.zoom)),
        );
        one.destroy();
        const afterFirst = {
          ...hold(),
          firstChildren: first.childElementCount,
          firstAttributes: first.getAttributeNames(),
          secondCanvases: second.querySelectorAll("canvas").length,
          secondZoom: undefined,
        };
        // The other map must still answer: it is asked to move and says so.
        two.setView({ zoom }, { animate: false });
        afterFirst.secondZoom = await Promise.race([
          moved,
          new Promise((resolve) => setTimeout(resolve, timeout)),
        ]);
        two.destroy();
        return { attributes, both, afterFirst };
      },
      { zoom: MOVED_ZOOM, timeout: MOVE_TIMEOUT },
    );
    await page
      .waitForFunction(
        () => {
          const workers = /** @type {any} */ (window).__activity.workers();
          return workers.made === workers.ended;
        },
        undefined,
        { timeout: SETTLE_TIMEOUT },
      )
      .catch(() => undefined);
    const end = await page.evaluate(() => {
      const activity = /** @type {any} */ (window).__activity;
      return {
        canvases: document.querySelectorAll("canvas").length,
        regions: document.querySelectorAll("[aria-live]").length,
        listeners: activity.listeners(),
        workers: activity.workers(),
        containerAttributes: {
          first: /** @type {HTMLElement} */ (
            document.getElementById("first")
          ).getAttributeNames(),
          second: /** @type {HTMLElement} */ (
            document.getElementById("second")
          ).getAttributeNames(),
        },
      };
    });
    const { attributes, both, afterFirst } = afterBoth;
    cycles.push({
      attributes,
      cycle: {
        both,
        afterFirst,
        end,
      },
    });
  }
  return cycles;
}

/**
 * Uses two `<mapcairn-map>` elements as a page would, and reads what each step
 * left: the second element is zoomed through its attribute, the first is
 * moved by script and removed, the second is moved in the page and removed.
 *
 * @param {import("playwright-core").Page} page The leg's `elements.html`.
 * @returns {Promise<import("./bundleLeg.mjs").ElementRun>}
 */
async function elementRun(page) {
  await page.waitForFunction(
    () => document.querySelectorAll("canvas.maplibregl-canvas").length === 2,
    undefined,
    { timeout: SERVER_TIMEOUT },
  );
  const run = await page.evaluate(
    async ({ zoom, timeout }) => {
      const first = /** @type {any} */ (document.getElementById("first"));
      const second = /** @type {any} */ (document.getElementById("second"));
      const hold = () => ({
        canvases: document.querySelectorAll("canvas").length,
        regions: document.querySelectorAll("[aria-live]").length,
      });
      /** @param {number} ms */
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      /** @returns {Promise<number | undefined>} */
      const nextZoom = () =>
        new Promise((resolve) => {
          const stop = setTimeout(() => resolve(undefined), timeout);
          document.addEventListener(
            "mapcairn-view-change",
            (event) => {
              clearTimeout(stop);
              resolve(/** @type {CustomEvent} */ (event).detail.zoom);
            },
            { once: true },
          );
        });
      const display = getComputedStyle(first).display;
      const startZoom = first.map.getView().zoom;
      const both = hold();

      const arrived = nextZoom();
      second.setAttribute("zoom", String(zoom));
      const movedZoom = await arrived;

      const moved = nextZoom();
      first.map.setView({ bearing: 40 }, { animate: false });
      await moved;
      const writtenBack = ["latitude", "longitude", "bearing"].filter((name) =>
        first.hasAttribute(name),
      );

      first.remove();
      await wait(0);
      const afterFirst = {
        ...hold(),
        firstChildren: first.childElementCount,
        firstMarked: first.hasAttribute("data-mapcairn"),
      };

      const map = second.map;
      document.body.append(second);
      await wait(0);
      const keptMap = second.map === map;

      second.remove();
      await wait(0);
      const bad = document.createElement("mapcairn-map");
      bad.setAttribute("tools", "warp-drive");
      const errored = new Promise((resolve) => {
        bad.addEventListener("mapcairn-error", (event) =>
          resolve(/** @type {CustomEvent} */ (event).detail),
        );
      });
      // The element logs what it could not do; the leg reads that line instead of reporting it as a console error.
      const logged = [];
      const log = console.error;
      console.error = (/** @type {unknown} */ line) =>
        logged.push(String(line));
      document.body.append(bad);
      const error = await errored;
      console.error = log;
      bad.remove();
      await wait(0);
      return {
        display,
        startZoom,
        both,
        movedZoom,
        writtenBack,
        afterFirst,
        keptMap,
        errorKind: error.kind,
        errorMessage: error.message,
        logged,
        end: {
          ...hold(),
          marked: document.querySelectorAll("[data-mapcairn]").length,
        },
      };
    },
    { zoom: MOVED_ZOOM, timeout: MOVE_TIMEOUT },
  );
  await page
    .waitForFunction(
      () => {
        const workers = /** @type {any} */ (window).__activity.workers();
        return workers.made === workers.ended;
      },
      undefined,
      { timeout: SETTLE_TIMEOUT },
    )
    .catch(() => undefined);
  const workers = await page.evaluate(() =>
    /** @type {any} */ (window).__activity.workers(),
  );
  return { ...run, end: { ...run.end, workers } };
}

/**
 * Reads the chrome of the page's map: each button's size, box model and
 * background, and the focus ring of the control that keyboard focus reaches.
 *
 * @param {import("playwright-core").Page} page A page with one map in `#map`.
 * @returns {Promise<import("./bundleLeg.mjs").Chrome>}
 */
async function readChrome(page) {
  await page.waitForFunction(
    () => {
      const region = document.querySelector("[data-map-host]");
      return (
        region !== null &&
        region.getAttribute("aria-busy") === "false" &&
        region.querySelector("canvas.maplibregl-canvas") !== null
      );
    },
    undefined,
    { timeout: SERVER_TIMEOUT },
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  // Safari's Tab skips buttons unless the person asks otherwise; focus is moved by script after the keys, which still counts as keyboard focus.
  await page.evaluate(() => {
    const map = document.getElementById("map");
    if (map !== null && !map.contains(document.activeElement)) {
      map.querySelector("button")?.focus();
    }
  });
  return page.evaluate(() => {
    const map = /** @type {HTMLElement} */ (document.getElementById("map"));
    const round = (/** @type {number} */ value) => Math.round(value * 10) / 10;
    const buttons = [...map.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const icon = button.querySelector("svg");
      return {
        name: button.getAttribute("aria-label") ?? button.textContent ?? "",
        width: round(box.width),
        height: round(box.height),
        boxSizing: style.boxSizing,
        margin: style.margin,
        background: style.backgroundColor,
        icon: icon && {
          width: round(icon.getBoundingClientRect().width),
          fill: getComputedStyle(icon).fill,
          stroke: getComputedStyle(icon).stroke,
        },
      };
    });
    const focused = document.activeElement;
    const ring =
      focused !== null && map.contains(focused)
        ? getComputedStyle(focused)
        : undefined;
    return {
      theme: map.getAttribute("data-theme") ?? "",
      buttons,
      focus:
        ring === undefined || focused === null
          ? undefined
          : {
              name: focused.getAttribute("aria-label") ?? "",
              outlineStyle: ring.outlineStyle,
              outlineWidth: ring.outlineWidth,
            },
    };
  });
}

/**
 * Waits for a page's map to draw.
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<void>}
 */
async function drawn(page) {
  await page.waitForFunction(
    () => {
      const region = document.querySelector("[data-map-host]");
      return (
        region !== null &&
        region.getAttribute("aria-busy") === "false" &&
        region.querySelector("canvas.maplibregl-canvas") !== null
      );
    },
    undefined,
    { timeout: SERVER_TIMEOUT },
  );
}

/**
 * Reads what the host's base styles give, from a map with every tool, opening
 * the credits and Settings as a person would.
 *
 * @param {import("playwright-core").Page} page The leg's `parity.html`.
 * @returns {Promise<Record<keyof typeof import("./bundleLeg.mjs").HOST_STYLES, string | number>>}
 */
async function readHostStyles(page) {
  await drawn(page);
  const first = await page.evaluate(() => {
    const map = /** @type {HTMLElement} */ (document.getElementById("map"));
    const input = /** @type {HTMLElement} */ (
      map.querySelector("input[role=combobox]")
    );
    const style = getComputedStyle(map);
    return {
      containerFontSize: style.fontSize,
      containerLineHeight: style.lineHeight,
      searchInputBoxSizing: getComputedStyle(input).boxSizing,
    };
  });
  // The credits show by themselves at first; a click would close them.
  const links = page.locator("#map ul a").first();
  if (!(await links.isVisible())) {
    await page.getByRole("button", { name: "Map credits" }).click();
  }
  const credits = await page.evaluate(() => {
    const link = /** @type {HTMLElement} */ (
      document.querySelector("#map ul a")
    );
    const list = /** @type {HTMLElement} */ (link.closest("ul"));
    return {
      creditsListBoxSizing: getComputedStyle(list).boxSizing,
      creditsLinkBoxSizing: getComputedStyle(link).boxSizing,
      creditsLinkHeight: link.getBoundingClientRect().height,
    };
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).first().click();
  const radio = await page.evaluate(() => {
    const button = /** @type {HTMLElement} */ (
      document.querySelector("#map button[role=radio]")
    );
    return {
      radioBoxSizing: getComputedStyle(button).boxSizing,
      radioHeight: button.getBoundingClientRect().height,
    };
  });
  return { ...first, ...credits, ...radio };
}

/**
 * Draws and uses the private elements on a map with Settings: what each
 * `radiogroup` is made of, the Theme control's keys, and what the announcer
 * says after the map's shape is chosen.
 *
 * @param {import("playwright-core").Page} page The leg's `parity.html`.
 * @returns {Promise<import("./bundleLeg.mjs").PrivateElementReading>}
 */
async function readPrivateElements(page) {
  await drawn(page);
  await page.getByRole("button", { name: "Settings" }).first().click();
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  await theme.waitFor();
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll('#map [role="radiogroup"]')].map((group) => ({
      tag: group.localName,
      shadow: group.shadowRoot !== null,
    })),
  );
  const focused = () =>
    page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  const checked = async () =>
    (await theme.locator('[aria-checked="true"]').textContent())?.trim() ?? "";
  await theme.focus();
  const entered = await focused();
  await page.keyboard.press("ArrowRight");
  const afterArrow = await focused();
  const checkedAfterArrow = await checked();
  await page.keyboard.press("Space");
  const checkedAfterSpace = await checked();
  await page.getByRole("radio", { name: "Globe" }).click();
  const polite = '#map [role="status"][aria-live]';
  // An earlier message may still be in the region, so the wait is for this one.
  await page
    .waitForFunction(
      ({ selector, said }) =>
        document.querySelector(selector)?.textContent === said,
      { selector: polite, said: GLOBE_ANNOUNCEMENT },
      { timeout: SETTLE_TIMEOUT },
    )
    .catch(() => undefined);
  const announced = (await page.locator(polite).textContent()) ?? "";
  return {
    groups,
    keyboard: { entered, afterArrow, checkedAfterArrow, checkedAfterSpace },
    announced,
  };
}

/**
 * Reads two copies of the bundle on one page, on `copies.html`: the private
 * elements each map drew, whether any two names run one class, and whether
 * each copy's Theme control takes a choice.
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<import("./bundleLeg.mjs").CopiesReading>}
 */
async function readCopies(page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll("canvas.maplibregl-canvas").length === 2 &&
      document.querySelectorAll('[data-map-host][aria-busy="false"]').length ===
        2,
    undefined,
    { timeout: SERVER_TIMEOUT },
  );
  /** @type {{ tags: string[], chosen: string }[]} */
  const copies = [];
  for (const id of ["first", "second"]) {
    const map = page.locator(`#${id}`);
    await map.getByRole("button", { name: "Settings" }).first().click();
    const theme = map.getByRole("radiogroup", { name: "Theme" });
    // Light changes no basemap on a light system, so no other style is asked for.
    await theme.getByRole("radio", { name: "Light" }).click();
    const chosen =
      (await theme.locator('[aria-checked="true"]').textContent())?.trim() ??
      "";
    const tags = await map.evaluate((container) => [
      ...new Set(
        [...container.querySelectorAll("*")]
          .map((element) => element.localName)
          .filter((name) => name.startsWith("mapcairn-segmented-")),
      ),
    ]);
    copies.push({ tags, chosen });
  }
  const classesShared = await page.evaluate(
    (tags) => {
      const classes = tags.map((tag) => customElements.get(tag));
      return new Set(classes).size !== classes.length;
    },
    copies.flatMap((copy) => copy.tags),
  );
  return { copies, classesShared };
}

/**
 * The private elements' pages under the policy: one drawn and used, two copies
 * of the package on one page, and a page whose planted style binding the policy
 * must report.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} folder
 * @returns {Promise<string[]>} Each problem, none when they all passed.
 */
async function privateElementPageProblems(browser, folder) {
  /** @type {string[]} */
  const problems = [];
  /** @type {import("./bundleLeg.mjs").PrivateElementReading | undefined} */
  let elements;
  const used = await openUnder(
    browser,
    folder,
    BUNDLE_POLICY,
    async (page) => {
      elements = await readPrivateElements(page);
    },
    { path: "/parity.html" },
  );
  problems.push(
    ...violationProblems(used).map((line) => `private elements: ${line}`),
    ...(elements === undefined ? [] : privateElementProblems(elements)),
  );

  /** @type {import("./bundleLeg.mjs").CopiesReading | undefined} */
  let copies;
  const twice = await openUnder(
    browser,
    folder,
    BUNDLE_POLICY,
    async (page) => {
      copies = await readCopies(page);
    },
    { path: "/copies.html" },
  );
  problems.push(
    ...violationProblems(twice).map((line) => `two copies: ${line}`),
    ...(copies === undefined ? [] : twoCopiesProblems(copies)),
  );

  const planted = await openUnder(
    browser,
    folder,
    BUNDLE_POLICY,
    async (page) => {
      await page
        .waitForFunction(
          () => /** @type {any} */ (window).__violations.length > 0,
          undefined,
          { timeout: REFUSAL_TIMEOUT },
        )
        .catch(() => undefined);
    },
    { path: "/planted.html" },
  );
  problems.push(...plantedStyleProblems(planted.violations));
  return problems;
}

/**
 * Reads what a page's rules did to the interface, on `leaks.html`.
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<Record<keyof typeof import("./bundleLeg.mjs").REACH, string>>}
 */
async function readReach(page) {
  await drawn(page);
  return page.evaluate(() => {
    const map = /** @type {HTMLElement} */ (document.getElementById("map"));
    const zoomIn = /** @type {HTMLElement} */ (
      map.querySelector('button[aria-label="Zoom in"]')
    );
    const icon = /** @type {Element} */ (zoomIn.querySelector("svg"));
    const help = /** @type {HTMLElement} */ (
      [...map.querySelectorAll("span")].find((each) =>
        each.textContent?.startsWith("Arrow keys"),
      )
    );
    const helpStyle = getComputedStyle(help);
    return {
      buttonBackgroundFromAttributeSelector:
        getComputedStyle(zoomIn).backgroundColor,
      buttonBorderFromClassAndElement: getComputedStyle(zoomIn).borderTopWidth,
      iconStrokeFromSvgRule: getComputedStyle(icon).stroke,
      inheritedTextTransform: helpStyle.textTransform,
      inheritedLetterSpacing: helpStyle.letterSpacing,
      inheritedTextAlign: helpStyle.textAlign,
    };
  });
}

/**
 * Draws a page and says what is wrong with it: the frame, the requests, the
 * worker, and anything the page reported.
 *
 * @param {(inspect: (page: import("playwright-core").Page, seen: import("./quickstartRun.mjs").Seen) => Promise<void>) => Promise<import("./quickstartRun.mjs").Seen & { violations: { violatedDirective: string, blockedURI: string }[] }>} open How to open it.
 * @param {{ checkCreated?: boolean }} [options] `checkCreated: true` for the plain page, where nothing but the bundle's own code runs: a bundler's client adds a `style` element for a stylesheet in development and a `link` to preload a chunk in a build.
 * @returns {Promise<{ problems: string[], run: import("./quickstartRun.mjs").Seen }>}
 */
async function drawProblems(open, { checkCreated = false } = {}) {
  /** @type {string[]} */
  const problems = [];
  const run = await open(async (page) => {
    problems.push(...(await drawnFrame(page, frame)));
    // Requests such as the sprite follow the first frame; let them land.
    await page.waitForLoadState("networkidle");
    if (checkCreated) {
      problems.push(
        ...createdElementProblems(
          await page.evaluate(() =>
            /** @type {any} */ (window).__activity.created(),
          ),
        ),
      );
    }
  });
  // The first view is the whole world, where the style draws no labels, so no glyphs are asked for.
  problems.push(
    ...quickstartProblems({ ...run, skip: ["glyph"] }),
    ...blobWorkerProblems(run.workers, run.origin),
  );
  return { problems, run };
}

/**
 * The example page, two maps, and the hostile page, under the policy.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} folder
 * @returns {Promise<string[]>} One line for each check that passed.
 * @throws When a check fails, naming each problem.
 */
async function checkPlainPage(browser, folder) {
  /** @type {string[]} */
  const problems = [];
  const options = { initScript: COUNT_PAGE_ACTIVITY };

  const example = await drawProblems(
    (inspect) => openUnder(browser, folder, BUNDLE_POLICY, inspect, options),
    { checkCreated: true },
  );
  problems.push(
    ...example.problems.map((line) => `example page: ${line}`),
    ...fileRequestProblems(
      example.run.requests,
      FILES_FOLDER,
      example.run.origin,
    ),
  );

  const refused = await openUnder(
    browser,
    folder,
    policyWithout(BUNDLE_POLICY, "worker-src", "blob:"),
    async (page) => {
      await page
        .waitForFunction(
          () => /** @type {any} */ (window).__violations.length > 0,
          undefined,
          { timeout: REFUSAL_TIMEOUT },
        )
        .catch(() => undefined);
    },
    options,
  );
  problems.push(...workerRefusalProblems(refused.violations));

  const element = await drawProblems(
    (inspect) =>
      openUnder(browser, folder, BUNDLE_POLICY, inspect, {
        ...options,
        path: "/element.html",
      }),
    { checkCreated: true },
  );
  problems.push(
    ...element.problems.map((line) => `element page: ${line}`),
    ...fileRequestProblems(
      element.run.requests,
      FILES_FOLDER,
      element.run.origin,
    ),
  );

  /** @type {import("./bundleLeg.mjs").ElementRun | undefined} */
  let elements;
  const elementPage = await openUnder(
    browser,
    folder,
    BUNDLE_POLICY,
    async (page) => {
      elements = await elementRun(page);
    },
    { ...options, path: "/elements.html" },
  );
  problems.push(
    ...violationProblems(elementPage).map((line) => `two elements: ${line}`),
    ...(elements === undefined ? [] : elementProblems(elements)),
  );

  /** @type {{ cycle: import("./bundleLeg.mjs").Cycle, attributes: import("./bundleLeg.mjs").Attributes }[]} */
  let cycles = [];
  const two = await openUnder(
    browser,
    folder,
    BUNDLE_POLICY,
    async (page) => {
      cycles = await twoMapCycles(page);
    },
    { ...options, path: "/two.html" },
  );
  for (const { cycle, attributes } of cycles) {
    problems.push(...cycleProblems(cycle, attributes));
  }
  problems.push(
    ...leakProblems(cycles.map(({ cycle }) => cycle)),
    ...violationProblems(two).map((line) => `two maps: ${line}`),
  );

  /** @type {Record<string, any>} */
  const read = {};
  for (const [name, reader] of /** @type {const} */ ([
    ["parity", readHostStyles],
    ["leaks", readReach],
  ])) {
    const seen = await openUnder(
      browser,
      folder,
      BUNDLE_POLICY,
      async (page) => {
        read[name] = await reader(page);
      },
      { path: `/${name}.html` },
    );
    problems.push(
      ...violationProblems(seen).map((line) => `${name} page: ${line}`),
    );
  }
  if (read.parity !== undefined) {
    problems.push(...hostStyleProblems(read.parity));
  }
  if (read.leaks !== undefined) {
    problems.push(...reachProblems(read.leaks));
  }

  /** @type {Record<string, import("./bundleLeg.mjs").Chrome>} */
  const chrome = {};
  for (const name of ["clean", "hostile"]) {
    const seen = await openUnder(
      browser,
      folder,
      BUNDLE_POLICY,
      async (page) => {
        chrome[name] = await readChrome(page);
      },
      { path: `/${name}.html` },
    );
    problems.push(
      ...violationProblems(seen).map((line) => `${name} page: ${line}`),
    );
  }
  if (chrome.clean !== undefined && chrome.hostile !== undefined) {
    problems.push(
      ...hostParityProblems(chrome.clean),
      ...hostilePageProblems({ clean: chrome.clean, hostile: chrome.hostile }),
    );
  }

  problems.push(...(await privateElementPageProblems(browser, folder)));

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  const [first, second] = cycles;
  return [
    "under the policy the segmented control drew as a private element in the light DOM with no violation, the Theme control took the keys as it should (arrows move, Space chooses) and choosing the globe was announced: ok",
    "two copies of the bundle on one page defined their private elements under different names, each running its own class and taking a choice: ok",
    "a style binding planted in a Lit template was reported by the policy, so the empty lists of violations above mean something: ok",
    `it drew the default basemap's frame from the fixtures, with its tile set, a vector tile and the sprite fetched from ${OPEN_FREE_MAP_ORIGIN}: ok`,
    "the engine's worker started from a blob of the bundle's own copy, the engine's chunk and the worker's text were fetched from beside the module, and the page asked for no worker file: ok",
    "no Content-Security-Policy violation, console error or uncaught error under the policy, and no script created a link, style or script element: ok",
    "without blob: in worker-src the page reports a violation, so the directive is needed: ok",
    "the plain page with a bare <mapcairn-map> and no script of its own drew the same frame under the policy, and two elements drew in one page, took their start from a view set before the element was defined, zoomed through an attribute with mapcairn-view-change reaching the document, were not written back to, kept their map when moved and left no canvas, live region, marker or worker when removed, and a tool name that is not one came back as a mapcairn-error: ok",
    `two maps drew in one page, one was destroyed and the other kept drawing, and after both were destroyed no canvas, live region or attribute of either was left (a pair held ${first?.cycle.both.regions} live regions): ok`,
    `a second pair of maps left no more listeners on the window and the document than the first (${first?.cycle.end.listeners} after one pair, ${second?.cycle.end.listeners} after two), and the engine's worker was ended with the last map (${second?.cycle.end.workers.made} made, ${second?.cycle.end.workers.ended} ended): ok`,
    "a map with every tool has what the reference host's base styles give (border-box everywhere read, the container's 15px text, a 26 px credits link and a 44 px Settings radio): ok",
    "a page with rules the reset does not stop reaches as far as the documents say: an attribute selector and a class with an element still set a button's background and border, an id rule on the container still sets the inherited text, and an svg rule's stroke does not reach an icon: ok",
    "the zoom and credits buttons have the boxes the reference host's /map gives them (48 by 48, Zoom out 48 by 49 with its hairline, credits 44 by 44), and a page with rules on *, button, svg, h1, box-sizing and [data-theme=dark] left every button at 44 px or more, the focus ring showing and the map's theme and chrome as they are with no rules: ok",
  ];
}

/**
 * The output of a bundler build, served under the policy and drawn.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} folder
 * @returns {Promise<string[]>}
 * @throws When the page does not draw cleanly.
 */
async function checkBuiltPage(browser, folder) {
  const { problems } = await drawProblems((inspect) =>
    openUnder(browser, folder, BUNDLE_POLICY, inspect, {
      initScript: COUNT_PAGE_ACTIVITY,
    }),
  );
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return [
    "the built page drew the default basemap's frame under the policy, with a worker from a blob and no violation or console error: ok",
  ];
}

/**
 * A free port, found by asking the system for one.
 *
 * @returns {Promise<number>}
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (
        probe.address()
      );
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Whether something accepts connections on a port.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function listening(port) {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => socket.end(() => resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

/**
 * Starts the app's Vite development server, with no setting for the bundle,
 * waits until it answers, and returns how to stop it.
 *
 * @param {string} app
 * @returns {Promise<{ address: string, stop: () => Promise<void> }>}
 */
async function startDevServer(app) {
  const port = await freePort();
  const vite = path.join(
    path.dirname(
      createRequire(path.join(app, "package.json")).resolve(
        "vite/package.json",
      ),
    ),
    "bin",
    "vite.js",
  );
  const child = spawn(
    process.execPath,
    [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: app, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const stop = async () => {
    child.kill("SIGTERM");
    await exited;
  };
  const address = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + SERVER_TIMEOUT;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`vite exited before it answered:\n${output}`);
    }
    if (await listening(port)) {
      return { address, stop };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
  await stop();
  throw new Error(
    `vite did not answer within ${SERVER_TIMEOUT / 1000} seconds.\n${output}`,
  );
}

/**
 * The page of an app, served by its Vite development server with no
 * configuration, drawn.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} app
 * @returns {Promise<string[]>}
 * @throws When the page does not draw cleanly.
 */
async function checkDevPage(browser, app) {
  const server = await startDevServer(app);
  try {
    const { problems } = await drawProblems((inspect) =>
      openPage(browser, server.address, inspect, COUNT_PAGE_ACTIVITY),
    );
    if (problems.length > 0) {
      throw new Error(problems.join("\n"));
    }
  } finally {
    await server.stop();
  }
  return [
    "the page drew the default basemap's frame under `vite` with no setting for the bundle, with a worker from a blob and no console error: ok",
  ];
}

/**
 * Runs one mode in a browser it starts and stops.
 *
 * @param {"page" | "built" | "dev"} mode
 * @param {string} folder
 * @param {string} executablePath Chromium's binary; the other engines are Playwright's own.
 * @param {"chromium" | "webkit" | "firefox"} [engine]
 * @returns {Promise<string[]>}
 */
export async function runBundle(
  mode,
  folder,
  executablePath,
  engine = "chromium",
) {
  const playwright = createRequire(path.join(REPO, "package.json"))(
    "playwright-core",
  );
  frame.pixel = engine !== "webkit";
  const browser = await playwright[engine].launch(
    engine === "chromium" ? { executablePath } : {},
  );
  try {
    const target = path.resolve(folder);
    if (mode === "page") {
      return await checkPlainPage(browser, target);
    }
    return mode === "built"
      ? await checkBuiltPage(browser, target)
      : await checkDevPage(browser, target);
  } finally {
    await browser.close();
  }
}

if (isEntryPoint(import.meta.url)) {
  try {
    const [mode, folder, executable, engine = "chromium"] =
      process.argv.slice(2);
    if (mode !== "page" && mode !== "built" && mode !== "dev") {
      throw new Error("The first argument is page, built or dev.");
    }
    if (!["chromium", "webkit", "firefox"].includes(engine)) {
      throw new Error("The fourth argument is chromium, webkit or firefox.");
    }
    const lines = await runBundle(
      mode,
      folder ?? "",
      executable ?? "",
      /** @type {"chromium" | "webkit" | "firefox"} */ (engine),
    );
    process.stdout.write(JSON.stringify(lines));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  process.exit();
}
