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

/**
 * What the page said when `blob:` was taken out of `worker-src`: a refusal of
 * a `blob:` worker by the `worker-src` directive (Chromium reports the scheme
 * alone, `blob`, and Firefox the address). Any other violation would
 * not show the directive is what lets the worker start.
 *
 * @param {{ violatedDirective: string, blockedURI: string }[]} violations
 * @returns {string[]}
 */
export function workerRefusalProblems(violations) {
  const refused = violations.some(
    ({ violatedDirective, blockedURI }) =>
      violatedDirective.startsWith("worker-src") &&
      (blockedURI === "blob" || blockedURI.startsWith("blob:")),
  );
  return refused
    ? []
    : [
        `without blob: in worker-src the page reported ${violations.length === 0 ? "no violation" : `only ${violations.map((each) => `${each.violatedDirective} on ${each.blockedURI || "inline"}`).join(", ")}`}, not a worker-src refusal of a blob: worker, so that is not what lets the worker start`,
      ];
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
 * What a page with two `<mapcairn-map>` elements held as they were used: the
 * first has a `zoom` attribute of 2 and a view of zoom 4 set before the element is defined, and the second is asked to zoom through its
 * attribute, moved in the page, and removed, after the first is removed.
 *
 * @typedef {object} ElementRun
 * @property {string} display The computed `display` of the first element.
 * @property {number} startZoom The zoom the first map started at.
 * @property {{ canvases: number, regions: number }} both Both drawn.
 * @property {number | undefined} movedZoom The zoom `mapcairn-view-change` carried after the second's `zoom` attribute changed, and whether it bubbled to the document: `undefined` when it did not arrive.
 * @property {string[]} writtenBack The view attributes the first element had after its map was moved by script and was not given them.
 * @property {{ canvases: number, regions: number, firstChildren: number, firstMarked: boolean }} afterFirst The first element removed.
 * @property {boolean} keptMap Whether the second element still held the same map after it was moved in the page.
 * @property {{ canvases: number, regions: number, marked: number, workers: { made: number, ended: number } }} end Both removed.
 * @property {string | undefined} errorKind The `kind` of the `MountMapError` a `mapcairn-error` event carried for a tool name that is not one.
 * @property {string | undefined} errorMessage Its message.
 * @property {string[]} logged What the element wrote to `console.error` meanwhile.
 */

/**
 * The problems with a run of two elements.
 *
 * @param {ElementRun} run
 * @returns {string[]}
 */
export function elementProblems(run) {
  const problems = [];
  if (run.display !== "block") {
    problems.push(
      `the element's display is ${run.display}, so the stylesheet did not make it a block`,
    );
  }
  if (run.startZoom !== 4) {
    problems.push(
      `a view set before the element was defined, after the zoom attribute of the markup, gave a map at zoom ${run.startZoom}, not 4`,
    );
  }
  if (run.both.canvases !== 2 || run.both.regions < 2) {
    problems.push(
      `two elements drew ${run.both.canvases} canvases and ${run.both.regions} live regions`,
    );
  }
  if (run.movedZoom !== MOVED_ZOOM) {
    problems.push(
      `changing the zoom attribute of the second element sent mapcairn-view-change with zoom ${run.movedZoom}, not ${MOVED_ZOOM}`,
    );
  }
  if (run.writtenBack.length > 0) {
    problems.push(
      `the element wrote ${run.writtenBack.join(", ")} back to its attributes`,
    );
  }
  if (!run.keptMap) {
    problems.push("moving an element in the page rebuilt its map");
  }
  const { afterFirst, end } = run;
  if (
    afterFirst.canvases !== 1 ||
    afterFirst.regions >= run.both.regions ||
    afterFirst.firstChildren !== 0 ||
    afterFirst.firstMarked
  ) {
    problems.push(
      `removing the first element left ${afterFirst.canvases} canvases, ${afterFirst.regions} live regions, ${afterFirst.firstChildren} children and ${afterFirst.firstMarked ? "its marker" : "no marker"}`,
    );
  }
  if (end.canvases !== 0 || end.regions !== 0 || end.marked !== 0) {
    problems.push(
      `after both elements were removed the page holds ${end.canvases} canvases, ${end.regions} live regions and ${end.marked} marked containers`,
    );
  }
  if (end.workers.made !== end.workers.ended) {
    problems.push(
      `${end.workers.made} workers were made and ${end.workers.ended} ended`,
    );
  }
  if (run.errorKind !== "invalid-option") {
    problems.push(
      `a tool name that is not one gave the error kind ${run.errorKind}, not invalid-option, through mapcairn-error`,
    );
  }
  if (
    run.errorMessage === undefined ||
    run.logged.join("\n") !== run.errorMessage
  ) {
    problems.push(
      `the element logged ${JSON.stringify(run.logged)} for an error whose message is ${JSON.stringify(run.errorMessage)}; it logs the message once`,
    );
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
 * @property {{ name: string, width: number, height: number, boxSizing: string, margin: string, background: string, icon: { width: number, fill: string, stroke: string } | null }[]} buttons
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

/**
 * @typedef {object} PrivateElementReading
 * @property {{ tag: string, shadow: boolean }[]} groups The element that is each `radiogroup`.
 * @property {{ entered: string, afterArrow: string, checkedAfterArrow: string, checkedAfterSpace: string }} keyboard The label of the focused or checked radio at each step on the Theme control.
 * @property {string} announced What the polite region said after the globe was chosen.
 */

/** What the announcer says when the globe is chosen (`announce.projection.globe`; a test keeps them equal). */
export const GLOBE_ANNOUNCEMENT = "Map shape: globe";

/** The private element a segmented control is: its stem and a copy's number. */
const SEGMENTED_TAG = /^mapcairn-segmented-\d+$/;

/** What the keyboard steps must give, on a Theme control that starts on System. */
const THEME_KEYS = {
  entered: "System",
  afterArrow: "Light",
  checkedAfterArrow: "System",
  checkedAfterSpace: "Light",
};

/**
 * The problems with the private elements as a page under the policy drew and
 * used them. The page's violations are judged beside this.
 *
 * @param {PrivateElementReading} reading
 * @returns {string[]}
 */
export function privateElementProblems({ groups, keyboard, announced }) {
  const problems = [];
  const isElement = (
    /** @type {{ tag: string, shadow: boolean }} */ { tag, shadow },
  ) => SEGMENTED_TAG.test(tag) && !shadow;
  if (groups.length === 0 || !groups.every(isElement)) {
    problems.push(
      `a segmented control is not the private element in the light DOM: ${JSON.stringify(groups)}`,
    );
  }
  if (JSON.stringify(keyboard) !== JSON.stringify(THEME_KEYS)) {
    problems.push(
      `the segmented control's keys gave ${JSON.stringify(keyboard)}, not ${JSON.stringify(THEME_KEYS)}`,
    );
  }
  if (announced !== GLOBE_ANNOUNCEMENT) {
    problems.push(
      `after the globe was chosen the announcer said ${JSON.stringify(announced)}, not "${GLOBE_ANNOUNCEMENT}"`,
    );
  }
  return problems;
}

/**
 * The problem when the policy did not report a `style` binding planted in a
 * Lit template: the violations the other pages collect would then show nothing
 * by being empty.
 *
 * @param {{ violatedDirective: string, blockedURI: string }[]} violations
 * @returns {string[]}
 */
export function plantedStyleProblems(violations) {
  return violations.some(({ violatedDirective }) =>
    violatedDirective.startsWith("style-src"),
  )
    ? []
    : [
        `the planted style binding was not reported by the policy (${JSON.stringify(violations)}), so an empty list of violations proves nothing`,
      ];
}

/**
 * @typedef {object} CopiesReading
 * @property {{ tags: string[], chosen: string }[]} copies For each copy of the bundle on the page, the tags of the private elements its map drew and the Theme choice after Light was clicked in it.
 * @property {boolean} classesShared Whether two of those tags run the same class.
 */

/**
 * The problems with two copies of the package on one page: each must define
 * its private elements under its own names and run its own classes.
 *
 * @param {CopiesReading} reading
 * @returns {string[]}
 */
export function twoCopiesProblems({ copies, classesShared }) {
  const tags = copies.flatMap((copy) => copy.tags);
  const problems = [];
  if (copies.length !== 2 || copies.some((copy) => copy.tags.length === 0)) {
    problems.push(
      `two copies of the bundle should each have drawn private elements: ${JSON.stringify(copies)}`,
    );
  }
  if (new Set(tags).size !== tags.length || classesShared) {
    problems.push(
      `a copy ran another copy's private element: ${JSON.stringify({ tags, classesShared })}`,
    );
  }
  if (copies.some((copy) => copy.chosen !== "Light")) {
    problems.push(
      `a copy's segmented control did not take a choice: ${JSON.stringify(copies)}`,
    );
  }
  return problems;
}

/**
 * What a page downloads before the engine: the module, the chunk the module
 * and the element's file share, the runtime chunk, the stylesheet, the
 * element's file (a few lines, which a page that uses the tag loads too) and
 * the chunk of the private elements and Lit, which every map loads before it draws.
 */
const FIRST_LOAD =
  /^browser(?:-(?:rolldown-runtime|shared|elements)-[\w-]+\.js|-element\.js|\.js|\.css)$/;

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
 * @throws {Error} For a file that is in neither group.
 *
 * @param {Record<string, Buffer>} files The bundle's files by name.
 * @returns {{ name: string, gzipBytes: number }[]}
 */
export function bundleLoadSizes(files) {
  for (const name of Object.keys(files)) {
    if (!FIRST_LOAD.test(name) && !LAZY.test(name)) {
      throw new Error(
        `${name} is a file of the bundle that is neither first load nor a lazy chunk, so no ceiling would count it`,
      );
    }
  }
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

/**
 * The boxes of the end stack's buttons as the reference host's `/map` has them
 * at 1440 by 900 px (read from the built host in Chromium, with the same
 * computed `box-sizing`, border, padding and margin): the zoom buttons are 48
 * px with a one pixel hairline above Zoom out, which is `content-box` on
 * purpose so the line does not eat into the 48 px target (`ControlGroup.css.ts`),
 * and the credits button is 44 px. The bundle has no host stylesheet behind
 * it, so its own rules must give the same boxes.
 */
export const HOST_BOXES = {
  "Zoom in": { width: 48, height: 48, boxSizing: "border-box" },
  "Zoom out": { width: 48, height: 49, boxSizing: "content-box" },
  "Map credits": { width: 44, height: 44, boxSizing: "border-box" },
};

/**
 * What the reference host's `/map` has, read from the built host in Chromium
 * at 1440 by 900 px, for what the host's base styles (`box-sizing: border-box`
 * on everything, the body's font) give and a plain page does not: the
 * container's font size and line height, the search input and the credits
 * list and links, and a Settings radio, each `border-box`, and the heights of a
 * credits link and a Settings radio (sizes that follow the viewport or the
 * font's own width are not held).
 */
export const HOST_STYLES = {
  containerFontSize: "15px",
  containerLineHeight: "21.75px",
  searchInputBoxSizing: "border-box",
  creditsListBoxSizing: "border-box",
  creditsLinkBoxSizing: "border-box",
  creditsLinkHeight: 26.2,
  radioBoxSizing: "border-box",
  radioHeight: 44,
};

/** How far a height may be from the host's, in CSS pixels, for the font's rounding. */
const HEIGHT_TOLERANCE = 0.5;

/**
 * The problems with the bundle's sheets, search input, list and credits read
 * against {@link HOST_STYLES}.
 *
 * @param {Record<keyof typeof HOST_STYLES, string | number>} readings The same keys, read from the bundle's page with every tool.
 * @returns {string[]}
 */
export function hostStyleProblems(readings) {
  return Object.entries(HOST_STYLES).flatMap(([name, expected]) => {
    const found = readings[/** @type {keyof typeof HOST_STYLES} */ (name)];
    const same =
      typeof expected === "number"
        ? typeof found === "number" &&
          Math.abs(found - expected) <= HEIGHT_TOLERANCE
        : found === expected;
    return same
      ? []
      : [
          `${name} is ${found} in the bundle and ${expected} in the reference host`,
        ];
  });
}

/**
 * How far the reset reaches, from a page with rules the reset does not stop
 * (`consumer-bundle/leaks.css`): an attribute selector (`[type="button"]`) and
 * a class and element (`.page button`) are as specific as the reset or more and
 * come later, so they still set a button's background and border; a rule on
 * the container by id (`#map`) still sets the inherited properties no component
 * names, here read from the keyboard help's text; and an `svg` rule's `stroke`
 * does not reach an icon. A change that lets a page rule through where it was
 * stopped, or stops one that was let through, fails until this table and the
 * documents that quote it (`DESIGN.md`, `docs/guides/releasing.md`) agree.
 */
export const REACH = {
  buttonBackgroundFromAttributeSelector: "rgb(255, 0, 0)",
  buttonBorderFromClassAndElement: "2px",
  iconStrokeFromSvgRule: "none",
  inheritedTextTransform: "uppercase",
  inheritedLetterSpacing: "6px",
  inheritedTextAlign: "right",
};

/**
 * The problems with how far a page's rules reached.
 *
 * @param {Record<keyof typeof REACH, string>} readings The same keys, read from the leaks page.
 * @returns {string[]}
 */
export function reachProblems(readings) {
  return Object.entries(REACH)
    .filter(
      ([name, expected]) =>
        readings[/** @type {keyof typeof REACH} */ (name)] !== expected,
    )
    .map(
      ([name, expected]) =>
        `${name} is ${readings[/** @type {keyof typeof REACH} */ (name)]}, not ${expected}: the reset reaches a different distance than the documents say`,
    );
}

/**
 * The problems with the bundle's buttons read against the host's boxes.
 *
 * @param {Chrome} chrome The bundle on a page with no rules of its own.
 * @returns {string[]}
 */
export function hostParityProblems(chrome) {
  return Object.entries(HOST_BOXES).flatMap(([name, expected]) => {
    const button = chrome.buttons.find((each) => each.name === name);
    if (button === undefined) {
      return [`the bundle has no "${name}" button to compare with the host's`];
    }
    return Object.entries(expected)
      .filter(([property, value]) => button[property] !== value)
      .map(
        ([property, value]) =>
          `"${name}" has ${property} ${button[property]} in the bundle and ${value} in the reference host`,
      );
  });
}
