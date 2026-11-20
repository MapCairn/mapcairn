// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Serves a built page under the strict Content-Security-Policy and draws it in
 * the repository's Playwright Chromium, then prints what it saw. The consumer
 * check runs this in a child process (`consumerCheck.mjs`), so a failure
 * cannot leave a browser or a server behind: the process closes both either
 * way.
 *
 *   node scripts/release/browserRun.mjs <built folder> <Chromium binary>
 *
 * The server listens on 127.0.0.1 only, on a port the system picks. The page
 * may reach its own origin and the one made-up style, which the browser's
 * routes answer; every other request is refused and fails the run. The
 * Playwright is the one the repository already installs; this script adds no
 * dependency.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../entryPoint.mjs";
import {
  BROWSER_STYLE_URL,
  browserPolicy,
  classifyRequest,
  colourProblems,
  consumerStyle,
  contentTypeOf,
  decodePng,
  earlyRequestProblems,
  engineStyleProblems,
  MAP_BACKGROUND,
  pixelAt,
  requestProblems,
  staticFile,
  violationProblems,
  workerProblems,
} from "./browserLeg.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** How long the map may take to load its style and draw, in ms. */
const DRAW_TIMEOUT = 30 * 1000;

/** Records what the page reports about itself, from before its first script. */
const COLLECT_VIOLATIONS = `
  window.__violations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__violations.push({
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
    });
  });
`;

/**
 * Starts a static server for a folder, with the policy on every response.
 *
 * @param {string} root
 * @returns {Promise<import("node:http").Server>} Listening on a free port.
 */
function serve(root) {
  const policy = browserPolicy();
  const server = createServer(async (request, response) => {
    const file = staticFile(root, request.url ?? "/");
    try {
      if (file === undefined) {
        throw new Error("outside the folder");
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": contentTypeOf(file),
        "content-security-policy": policy,
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-security-policy": policy });
      response.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/**
 * The problems with the frame the engine drew: its canvas has a size, and a
 * pixel of the map region, away from the point the style draws, has the
 * style's background colour.
 *
 * @param {import("playwright-core").Page} page
 * @param {import("playwright-core").Locator} host The map region.
 * @returns {Promise<string[]>}
 */
async function drawnFrameProblems(page, host) {
  const canvas = await page.locator("canvas.maplibregl-canvas").boundingBox();
  const region = await host.boundingBox();
  if (canvas === null || canvas.width === 0 || canvas.height === 0) {
    return ["the engine's canvas has no size"];
  }
  if (region === null) {
    return ["the map region has no box"];
  }
  const shot = await page.screenshot({
    clip: { x: region.x + 8, y: region.y + 8, width: 1, height: 1 },
  });
  return colourProblems(pixelAt(decodePng(shot), 0, 0), MAP_BACKGROUND);
}

/**
 * Draws the built page and checks it.
 *
 * @param {string} folder The built page.
 * @param {string} executablePath Chromium.
 * @returns {Promise<string[]>} One line for each check that passed.
 * @throws When anything the leg looks for is missing, naming each problem.
 */
export async function drawRealMap(folder, executablePath) {
  const { chromium } = createRequire(path.join(REPO, "package.json"))(
    "playwright-core",
  );
  const server = await serve(path.resolve(folder));
  const browser = await chromium.launch({ executablePath });
  const stop = () => {
    void Promise.allSettled([browser.close(), server.close()]).finally(() =>
      process.exit(1),
    );
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const { port } = /** @type {import("node:net").AddressInfo} */ (
      server.address()
    );
    const origin = `http://127.0.0.1:${port}`;
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      serviceWorkers: "block",
    });
    await context.addInitScript(COLLECT_VIOLATIONS);

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
        if (route.request().url() !== BROWSER_STYLE_URL) {
          return route.abort("blockedbyclient");
        }
        return route.fulfill({
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(consumerStyle()),
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

    await page.goto(`${origin}/`, { waitUntil: "load" });
    const early = [...requests];
    await page.getByRole("button", { name: "Draw the map" }).click();

    const host = page.locator("[data-map-host]");
    try {
      await page.waitForFunction(
        () => {
          const region = document.querySelector("[data-map-host]");
          return (
            region !== null &&
            (region.getAttribute("data-state") === "error" ||
              (region.getAttribute("aria-busy") === "false" &&
                region.querySelector("canvas.maplibregl-canvas") !== null))
          );
        },
        undefined,
        { timeout: DRAW_TIMEOUT },
      );
    } catch (error) {
      const reported = await page.evaluate(() => window.__violations);
      throw new Error(
        [
          `the map neither loaded nor reported an error within ${DRAW_TIMEOUT / 1000} s`,
          ...violationProblems({
            violations: reported,
            consoleErrors,
            pageErrors,
          }),
          `requests: ${requests.join(", ")}`,
          error instanceof Error ? error.message : String(error),
        ].join("\n"),
      );
    }

    /** @type {string[]} */
    const problems = [];
    const failed = (await host.getAttribute("data-state")) === "error";
    if (failed) {
      problems.push("the map reported an engine error instead of loading");
    } else {
      problems.push(...(await drawnFrameProblems(page, host)));
    }

    const styles = await page.evaluate(() => {
      const container = document.querySelector(
        "[data-map-host] .maplibregl-map",
      );
      const controls = document.querySelector(
        "[data-map-host] .maplibregl-control-container",
      );
      const probe = document.querySelector('[data-testid="background-probe"]');
      return {
        container: container && getComputedStyle(container).backgroundColor,
        probe: probe && getComputedStyle(probe).backgroundColor,
        controls: controls && getComputedStyle(controls).display,
        violations: window.__violations,
      };
    });
    if (!failed) {
      problems.push(...engineStyleProblems(styles));
    }

    problems.push(
      ...earlyRequestProblems(early, origin),
      ...requestProblems(requests, origin),
      ...workerProblems(workers, origin),
      ...violationProblems({
        violations: styles.violations,
        consoleErrors,
        pageErrors,
      }),
    );
    if (problems.length > 0) {
      throw new Error(problems.join("\n"));
    }
    return [
      "the page's request log is empty of the style, the engine and the worker until the page gives the adapter a basemap: ok",
      "the engine's worker came from the page's own origin, and no request went anywhere but that origin and the made-up style: ok",
      "the style loaded, the map drew a frame whose pixel is the style's background colour, and the canvas has a size: ok",
      "the engine container has the map background token and no engine control shows: ok",
      "no Content-Security-Policy violation, console error or uncaught error: ok",
    ];
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (isEntryPoint(import.meta.url)) {
  try {
    const lines = await drawRealMap(
      process.argv[2] ?? "",
      process.argv[3] ?? "",
    );
    process.stdout.write(JSON.stringify(lines));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  process.exit();
}
