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
  fileRequestProblems,
  hostilePageProblems,
  hostParityProblems,
  leakProblems,
  MOVED_ZOOM,
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
    // The glyph and sprite requests follow the first frame; let them land.
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
  if (refused.violations.length === 0) {
    problems.push(
      "the page reported no violation without blob: in worker-src, so that is not what lets the worker start",
    );
  }

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

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  const [first, second] = cycles;
  return [
    `it drew the default basemap's frame from the fixtures, with its tile set, a vector tile and the sprite fetched from ${OPEN_FREE_MAP_ORIGIN}: ok`,
    "the engine's worker started from a blob of the bundle's own copy, the engine's chunk and the worker's text were fetched from beside the module, and the page asked for no worker file: ok",
    "no Content-Security-Policy violation, console error or uncaught error under the policy, and no script created a link, style or script element: ok",
    "without blob: in worker-src the page reports a violation, so the directive is needed: ok",
    `two maps drew in one page, one was destroyed and the other kept drawing, and after both were destroyed no canvas, live region or attribute of either was left (a pair held ${first?.cycle.both.regions} live regions): ok`,
    `a second pair of maps left no more listeners on the window and the document than the first (${first?.cycle.end.listeners} after one pair, ${second?.cycle.end.listeners} after two), and the engine's worker was ended with the last map (${second?.cycle.end.workers.made} made, ${second?.cycle.end.workers.ended} ended): ok`,
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
