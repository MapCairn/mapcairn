// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Runs the page built from the README's own quickstart in the repository's
 * Playwright Chromium, under the policy line the README gives, with the
 * default basemap's real style (`openFreeMapFixtures.mjs` answers every request
 * to its origin, so nothing reaches the network), then prints what it saw. The
 * consumer check runs this in a child process (`consumerCheck.mjs`).
 *
 *   node scripts/release/quickstartRun.mjs <built folder> <Chromium binary> <policy file>
 *
 * The page is served three more times with one source taken out of the policy
 * each (`QUICKSTART_REFUSALS`); each run must report a violation, so a
 * directive the README names cannot be one the page does not need.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import {
  classifyRequest,
  colourProblems,
  decodePng,
  pixelAt,
  workerProblems,
} from "./browserLeg.mjs";
import { closeServer, serve } from "./browserRun.mjs";
import {
  OPEN_FREE_MAP_ORIGIN,
  openFreeMapResponse,
} from "./openFreeMapFixtures.mjs";
import {
  policyWithout,
  QUICKSTART_REFUSALS,
  quickstartProblems,
} from "./quickstartLeg.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The colour of the default basemap's background layer (Bright's `background`). */
const BRIGHT_BACKGROUND = "#f8f4f0";

/** How long the map may take to draw, and how long a blocked page may take to report. */
const DRAW_TIMEOUT = 30 * 1000;
const REFUSAL_TIMEOUT = 10 * 1000;

/** Records what the page reports about itself, from before its first script. */
const COLLECT_VIOLATIONS = `
  /** @type {any} */ (window).__violations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    /** @type {any} */ (window).__violations.push({
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
    });
  });
`;

/**
 * What a run of a page saw.
 *
 * @typedef {object} Seen
 * @property {string} origin
 * @property {string[]} requests
 * @property {string[]} workers
 * @property {string[]} consoleErrors
 * @property {string[]} pageErrors
 */

/**
 * Opens a page in a fresh browser context whose every request outside the
 * page's own origin is answered from the default basemap's fixtures or
 * refused, and lets `inspect` look at what happened.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} address The page's address; its origin is the page's own.
 * @param {(page: import("playwright-core").Page, seen: Seen) => Promise<void>} inspect
 * @param {string} [initScript] Runs in the page before any of its own scripts.
 * @returns {Promise<Seen & { violations: { violatedDirective: string, blockedURI: string }[] }>}
 */
export async function openPage(browser, address, inspect, initScript = "") {
  const origin = new URL(address).origin;
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    serviceWorkers: "block",
  });
  try {
    await context.addInitScript(COLLECT_VIOLATIONS);
    await context.addInitScript(initScript);
    /** @type {string[]} */
    const requests = [];
    /** @type {string[]} */
    const workers = [];
    /** @type {string[]} */
    const consoleErrors = [];
    /** @type {string[]} */
    const pageErrors = [];
    context.on("request", (request) => requests.push(request.url()));
    await context.route(
      (url) => classifyRequest(url.href, origin) !== "page",
      (route) => {
        const answer = openFreeMapResponse(route.request().url());
        if (answer === undefined) {
          return route.abort("blockedbyclient");
        }
        return route.fulfill({
          contentType: answer.contentType,
          headers: { "access-control-allow-origin": "*" },
          body: answer.body,
        });
      },
    );
    const page = await context.newPage();
    page.on("worker", (worker) => workers.push(worker.url()));
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(address, { waitUntil: "load" });
    const seen = { origin, requests, workers, consoleErrors, pageErrors };
    await inspect(page, seen);
    const violations = await page.evaluate(
      () => /** @type {any} */ (window).__violations,
    );
    return { ...seen, violations };
  } finally {
    await context.close();
  }
}

/**
 * Serves the built page under a policy, opens it, and lets `inspect` look at
 * what happened.
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} folder
 * @param {string} policy
 * @param {(page: import("playwright-core").Page, seen: Seen) => Promise<void>} inspect
 * @param {{ path?: string, initScript?: string }} [options] The page's path in the folder (`/` by default) and a script to run before its own.
 */
export async function openUnder(
  browser,
  folder,
  policy,
  inspect,
  options = {},
) {
  const server = await serve(path.resolve(folder), policy);
  try {
    const { port } = /** @type {import("node:net").AddressInfo} */ (
      server.address()
    );
    return await openPage(
      browser,
      `http://127.0.0.1:${port}${options.path ?? "/"}`,
      inspect,
      options.initScript,
    );
  } finally {
    await closeServer(server);
  }
}

/**
 * Waits for the map to draw its frame, then reads a pixel from the map
 * region away from the chrome (the left edge, halfway down).
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<string[]>} The problems with the drawn frame.
 */
export async function drawnFrame(page) {
  const host = page.locator("[data-map-host]");
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
    { timeout: DRAW_TIMEOUT },
  );
  if ((await host.getAttribute("data-state")) === "error") {
    return ["the map reported an engine error instead of loading"];
  }
  const region = await host.boundingBox();
  if (region === null) {
    return ["the map region has no box"];
  }
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const shot = await page.screenshot({
    clip: {
      x: region.x + 8,
      y: region.y + region.height / 2,
      width: 1,
      height: 1,
    },
  });
  return colourProblems(pixelAt(decodePng(shot), 0, 0), BRIGHT_BACKGROUND);
}

/**
 * Runs the README's page under its own policy, then under each changed policy.
 *
 * @param {string} folder The built page.
 * @param {string} executablePath Chromium.
 * @param {string} policy The README's policy line.
 * @returns {Promise<string[]>} One line for each check that passed.
 * @throws When anything the leg looks for is missing, naming each problem.
 */
export async function runQuickstart(folder, executablePath, policy) {
  const { chromium } = createRequire(path.join(REPO, "package.json"))(
    "playwright-core",
  );
  const browser = await chromium.launch({ executablePath });
  try {
    /** @type {string[]} */
    const problems = [];
    /** @type {string[]} */
    let frame = [];
    const run = await openUnder(browser, folder, policy, async (page) => {
      frame = await drawnFrame(page);
      // The glyph and sprite requests follow the first frame; let them land.
      await page.waitForLoadState("networkidle");
    });
    problems.push(
      ...frame,
      ...quickstartProblems(run),
      ...workerProblems(run.workers, run.origin),
    );
    for (const { directive, source } of QUICKSTART_REFUSALS) {
      const changed = policyWithout(policy, directive, source);
      const refused = await openUnder(
        browser,
        folder,
        changed,
        async (page) => {
          await page
            .waitForFunction(
              () => /** @type {any} */ (window).__violations.length > 0,
              undefined,
              { timeout: REFUSAL_TIMEOUT },
            )
            .catch(() => undefined);
        },
      );
      if (refused.violations.length === 0) {
        problems.push(
          `the page reported no violation without ${source} in ${directive}, so the README's ${directive} is not what lets it draw`,
        );
      }
    }
    if (problems.length > 0) {
      throw new Error(problems.join("\n"));
    }
    return [
      `the README's page drew Bright's frame from the real style, with its tile set, a vector tile, the sprite and a glyph range all fetched from ${OPEN_FREE_MAP_ORIGIN}: ok`,
      "the engine's worker came from the page's own origin, and no request went anywhere but that origin and the basemap's: ok",
      "no Content-Security-Policy violation, console error or uncaught error under the README's policy line: ok",
      ...QUICKSTART_REFUSALS.map(
        ({ directive, source }) =>
          `without ${source} in ${directive} the page reports a violation, so the directive is needed: ok`,
      ),
    ];
  } finally {
    await browser.close();
  }
}

if (isEntryPoint(import.meta.url)) {
  try {
    const policy = (await readFile(process.argv[4] ?? "", "utf8")).trim();
    const lines = await runQuickstart(
      process.argv[2] ?? "",
      process.argv[3] ?? "",
      policy,
    );
    process.stdout.write(JSON.stringify(lines));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  process.exit();
}
