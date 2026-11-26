// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The pure parts of the consumer check's leg for `@mapcairn/sdk/browser`
 * (`bundleRun.mjs`): the policy its pages are served under, the page activity
 * it counts, and what each reading must be. They are kept apart so unit tests
 * can cover them without a browser.
 */
import { gzipSync } from "node:zlib";
import { OPEN_FREE_MAP_ORIGIN } from "./openFreeMapFixtures.mjs";

/**
 * The Content-Security-Policy the pages are served under: what
 * `buildContentSecurityPolicy` in `examples/embed` builds for a host whose one
 * basemap is the built-in one (a unit test keeps the two equal). Nothing is
 * inline, and the engine's worker starts from a `blob:`.
 */
export const BUNDLE_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: blob: ${OPEN_FREE_MAP_ORIGIN}`,
  "font-src 'self'",
  `connect-src 'self' ${OPEN_FREE_MAP_ORIGIN}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Where the second map is asked to go once the first is destroyed. */
export const MOVED_ZOOM = 3;

/** The smallest a control may be, in CSS pixels, on each side. */
export const TARGET_SIZE = 44;

/**
 * Runs in the page before any of its own scripts. It keeps, on `window`, the
 * listeners that are on (a listener added and not removed) on the window and the
 * document, which outlive a map, the workers made
 * and ended, and the tag of each element a script creates. The key of a
 * listener is its target, type, callback and capture flag, so a second
 * `addEventListener` with the same four is one listener, as the browser has it.
 */
export const COUNT_PAGE_ACTIVITY = `
  (() => {
    const listeners = new Map();
    const onThePage = (target) => target === window || target === document;
    const ids = new WeakMap();
    let next = 0;
    const idOf = (value) => {
      if (value === null || (typeof value !== "object" && typeof value !== "function")) {
        return String(value);
      }
      if (!ids.has(value)) {
        next += 1;
        ids.set(value, next);
      }
      return ids.get(value);
    };
    const keyOf = (target, type, callback, options) =>
      [idOf(target), type, idOf(callback), typeof options === "object" ? Boolean(options?.capture) : Boolean(options)].join(":");
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if (callback) {
        listeners.set(keyOf(this, type, callback, options), new WeakRef(this));
      }
      return add.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      if (callback) {
        listeners.delete(keyOf(this, type, callback, options));
      }
      return remove.call(this, type, callback, options);
    };
    const workers = { made: 0, ended: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...rest) {
        super(...rest);
        workers.made += 1;
      }
      terminate() {
        workers.ended += 1;
        return super.terminate();
      }
    };
    const created = [];
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function (tag, options) {
      created.push(String(tag).toLowerCase());
      return createElement.call(this, tag, options);
    };
    window.__activity = {
      listeners: () =>
        [...listeners.values()].filter((ref) => {
          const target = ref.deref();
          return target !== undefined && onThePage(target);
        }).length,
      workers: () => ({ ...workers }),
      created: () => [...created],
    };
  })();
`;

/** The tags a script of the bundle must never create: they would load or style the page outside the policy. */
const FORBIDDEN_TAGS = ["link", "style", "script"];

/**
 * The problems with the elements scripts created: the bundle adds no
 * stylesheet and no script of its own while it runs.
 *
 * @param {string[]} tags The tag of each element a script created.
 * @returns {string[]}
 */
export function createdElementProblems(tags) {
  return FORBIDDEN_TAGS.filter((tag) => tags.includes(tag)).map(
    (tag) => `a script created a <${tag}> element at run time`,
  );
}

/**
 * The problems with the workers the page started: each is a `blob:` made by
 * the page's own origin (a script the bundle carries, which `worker-src blob:`
 * allows), and at least one started.
 *
 * @param {string[]} urls The URL of each worker.
 * @param {string} pageOrigin
 * @returns {string[]}
 */
export function blobWorkerProblems(urls, pageOrigin) {
  if (urls.length === 0) {
    return ["no worker started, so the engine drew nothing under the policy"];
  }
  return urls
    .filter((url) => !url.startsWith(`blob:${pageOrigin}/`))
    .map(
      (url) =>
        `the worker ${url} is not a blob made by the page's own origin, which the policy allows`,
    );
}

/** The engine's lazy chunk and the chunk that holds its worker's text, each named with a hash. */
const ENGINE_CHUNK = /\/browser-engine-[\w-]+\.js$/;
const WORKER_CHUNK = /\/browser-worker-[\w-]+\.js$/;

/**
 * The problems with how the bundle's own files were fetched: the module,
 * then the engine's chunk and the worker's text by an address beside it, and
 * no file for the worker.
 *
 * @param {string[]} urls Every request the page made.
 * @param {string} folder The path the files are served from, with no trailing slash, such as `/mapcairn`.
 * @param {string} pageOrigin
 * @returns {string[]}
 */
export function fileRequestProblems(urls, folder, pageOrigin) {
  const beside = urls.filter((url) =>
    url.startsWith(`${pageOrigin}${folder}/`),
  );
  const problems = [];
  /** @type {[string, RegExp][]} */
  const expected = [
    ["the engine's chunk", ENGINE_CHUNK],
    ["the worker's text", WORKER_CHUNK],
  ];
  for (const [name, pattern] of expected) {
    if (!beside.some((url) => pattern.test(url))) {
      problems.push(
        `${name} was not fetched from beside the module, at ${pageOrigin}${folder}/`,
      );
    }
  }
  if (beside.some((url) => url.endsWith("/browser-worker.js"))) {
    problems.push(
      "the page asked for a worker file, which the bundle does not serve",
    );
  }
  return problems;
}

/**
 * What the page held at one moment of the two-map cycle.
 *
 * @typedef {object} Moment
 * @property {number} canvases `canvas` elements in the page.
 * @property {number} regions Live regions in the page.
 * @property {number} listeners Listeners that are on.
 * @property {{ made: number, ended: number }} workers
 */

/**
 * The attributes of the two containers.
 *
 * @typedef {{ first: string[], second: string[] }} Attributes
 */

/**
 * What one cycle of mounting two maps and destroying them saw.
 *
 * @typedef {object} Cycle
 * @property {Moment} both Both maps drawn.
 * @property {Moment & { firstChildren: number, firstAttributes: string[], secondCanvases: number, secondZoom: number | undefined }} afterFirst The first map destroyed, and the second asked to move to zoom 3: the zoom it reported, if it did.
 * @property {Moment & { containerAttributes: Attributes }} end Both destroyed.
 */

/**
 * The problems with a cycle: two maps drew with their own canvas and their own
 * live regions, destroying one left the other drawing, and destroying both
 * left no canvas, no live region, no marker on either container and no
 * worker running.
 *
 * @param {Cycle} cycle
 * @param {Attributes} attributes The attributes each container had before any map.
 * @returns {string[]}
 */
export function cycleProblems(cycle, attributes) {
  const { both, afterFirst, end } = cycle;
  const problems = [];
  if (both.canvases !== 2) {
    problems.push(`two maps drew ${both.canvases} canvases, not two`);
  }
  if (both.regions < 2) {
    problems.push("two maps did not each have a live region");
  }
  if (afterFirst.firstChildren !== 0) {
    problems.push("the destroyed map's container still holds markup");
  }
  if (afterFirst.secondCanvases !== 1) {
    problems.push(
      `the other map has ${afterFirst.secondCanvases} canvases after the first was destroyed, not one`,
    );
  }
  if (afterFirst.regions >= both.regions) {
    problems.push("destroying a map left its live regions in the page");
  }
  if (afterFirst.secondZoom !== MOVED_ZOOM) {
    problems.push(
      `the other map did not move when asked to, after the first was destroyed (zoom ${afterFirst.secondZoom})`,
    );
  }
  if (afterFirst.firstAttributes.join() !== attributes.first.join()) {
    problems.push(
      `the destroyed map's container has the attributes ${afterFirst.firstAttributes.join(", ")}, not the ${attributes.first.join(", ")} it had`,
    );
  }
  if (end.canvases !== 0 || end.regions !== 0) {
    problems.push(
      `after both maps were destroyed the page holds ${end.canvases} canvases and ${end.regions} live regions`,
    );
  }
  for (const name of /** @type {const} */ (["first", "second"])) {
    if (end.containerAttributes[name].join() !== attributes[name].join()) {
      problems.push(
        `the ${name} container has the attributes ${end.containerAttributes[name].join(", ")} after destroy, not the ${attributes[name].join(", ")} it had`,
      );
    }
  }
  return problems;
}

/**
 * The problems with what two cycles left behind: the second leaves no more
 * listeners than the first (the first may add the page-wide ones that load
 * once), and the engine's worker is ended when the last map is.
 *
 * @param {Cycle[]} cycles Two cycles, in order.
 * @returns {string[]}
 */
export function leakProblems(cycles) {
  const [first, second] = cycles;
  if (first === undefined || second === undefined) {
    return ["the leg needs two cycles to tell a leak from a one-time cost"];
  }
  const problems = [];
  if (second.end.listeners > first.end.listeners) {
    problems.push(
      `a second pair of maps left ${second.end.listeners - first.end.listeners} more listeners on after destroy`,
    );
  }
  for (const [number, { end }] of [first, second].entries()) {
    if (end.workers.made !== end.workers.ended) {
      problems.push(
        `after cycle ${number + 1} ${end.workers.made} workers had been made and ${end.workers.ended} ended`,
      );
    }
  }
  return problems;
}

/**
 * What the chrome's controls look like on a page: for each button, its name,
 * size, box model and colours, and the focus ring of the one with focus.
 *
 * @typedef {object} Chrome
 * @property {string} theme The `data-theme` of the map's container.
 * @property {{ name: string, width: number, height: number, boxSizing: string, margin: string, background: string, icon: { width: number, fill: string } | null }[]} buttons
 * @property {{ name: string, outlineStyle: string, outlineWidth: string } | undefined} focus
 */

/**
 * The problems with the chrome on a page with hostile rules, read against the
 * same chrome on a page with none: every button is at least 44 px each way,
 * the focus ring shows, the map keeps its own theme, and nothing else about
 * a button, its icon included, changed.
 *
 * @param {{ clean: Chrome, hostile: Chrome }} pages
 * @returns {string[]}
 */
export function hostilePageProblems({ clean, hostile }) {
  const problems = [];
  if (hostile.buttons.length === 0) {
    return ["the hostile page's map drew no buttons, so it proves nothing"];
  }
  for (const button of hostile.buttons) {
    if (button.width < TARGET_SIZE || button.height < TARGET_SIZE) {
      problems.push(
        `"${button.name}" is ${button.width} by ${button.height} px, under ${TARGET_SIZE} px, with the page's rules on it`,
      );
    }
  }
  const focus = hostile.focus;
  if (
    focus === undefined ||
    focus.outlineStyle === "none" ||
    Number.parseFloat(focus.outlineWidth) < 1
  ) {
    problems.push(
      "the control with keyboard focus shows no focus ring on the hostile page",
    );
  }
  if (hostile.theme !== clean.theme) {
    problems.push(
      `the map's theme is ${hostile.theme} on the hostile page and ${clean.theme} on the other`,
    );
  }
  if (
    JSON.stringify(hostile.buttons) !== JSON.stringify(clean.buttons) ||
    JSON.stringify(hostile.focus) !== JSON.stringify(clean.focus)
  ) {
    problems.push(
      `the chrome is not the same with the page's rules on it: ${JSON.stringify(hostile.buttons)} against ${JSON.stringify(clean.buttons)}`,
    );
  }
  return problems;
}

/** What a page downloads before the engine: the module, the shared runtime chunk and the stylesheet. */
const FIRST_LOAD = /^browser(?:-rolldown-runtime-[\w-]+\.js|\.js|\.css)$/;

/** What the first map brings in after: the engine's chunk and the worker's text. */
const LAZY = /^browser-(?:engine|worker)-[\w-]+\.js$/;

/** The names the two groups go by in `BUNDLE_CEILINGS` and in the report. */
export const FIRST_LOAD_BUILD = "browser first load";
export const ENGINE_BUILD = "browser engine and worker";

/**
 * The gzipped size of what a page downloads at first and of what the first
 * map then loads, from the files of the bundle, in the shape
 * `bundleSizeProblems` reads.
 *
 * @param {Record<string, Buffer>} files The bundle's files by name.
 * @returns {{ name: string, gzipBytes: number }[]}
 */
export function bundleLoadSizes(files) {
  /** @param {RegExp} pattern */
  const gzipped = (pattern) =>
    Object.entries(files)
      .filter(([name]) => pattern.test(name))
      .reduce((sum, [, bytes]) => sum + gzipSync(bytes).length, 0);
  return [
    { name: FIRST_LOAD_BUILD, gzipBytes: gzipped(FIRST_LOAD) },
    { name: ENGINE_BUILD, gzipBytes: gzipped(LAZY) },
  ];
}
