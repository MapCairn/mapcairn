// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../../../../examples/embed/src/contentSecurityPolicy";
import {
  BUNDLE_POLICY,
  blobWorkerProblems,
  bundleLoadSizes,
  COUNT_PAGE_ACTIVITY,
  createdElementProblems,
  cycleProblems,
  ENGINE_BUILD,
  elementProblems,
  FIRST_LOAD_BUILD,
  fileRequestProblems,
  hostilePageProblems,
  hostParityProblems,
  leakProblems,
  MOVED_ZOOM,
  plantedStyleProblems,
  privateElementProblems,
  twoCopiesProblems,
  workerRefusalProblems,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/bundleLeg.mjs";
import { BUILT_IN_BASEMAP_CATALOGUE } from "../basemaps";

const PAGE = "http://127.0.0.1:4196";

describe("the bundle leg's policy", () => {
  it("is the policy the embed example builds for a host with the built-in basemaps, and no inline source", () => {
    expect(BUNDLE_POLICY).toBe(
      buildContentSecurityPolicy({
        basemaps: [BUILT_IN_BASEMAP_CATALOGUE.basemaps[0]].filter(
          (basemap) => basemap !== undefined,
        ),
        layers: [],
      }),
    );
    expect(BUNDLE_POLICY).not.toContain("unsafe-inline");
    expect(BUNDLE_POLICY).toContain("worker-src 'self' blob:");
  });
});

describe("the documented policy of the browser route", () => {
  const read = (file: string) =>
    readFileSync(
      path.resolve(import.meta.dirname, "../../../..", file),
      "utf8",
    );

  it("is, directive by directive, the one the consumer check serves the example under", () => {
    const section = read("sites/docs/docs/guides/content-security-policy.md")
      .split("## The browser route\n")[1]
      ?.split("\n## ")[0];
    const block = /```text\n([\s\S]*?)\n```/.exec(section ?? "")?.[1];
    expect(block?.split("\n")).toEqual(
      (BUNDLE_POLICY as string).split("; ").map((directive) => `${directive};`),
    );
  });

  it("is the policy line of the example's README", () => {
    expect(read("examples/browser/README.md")).toContain(
      `\`\`\`text\n${BUNDLE_POLICY}\n\`\`\``,
    );
  });
});

describe("createdElementProblems", () => {
  it("names each stylesheet, style or script element a script created, and passes the rest", () => {
    expect(createdElementProblems(["div", "canvas", "button"])).toEqual([]);
    expect(createdElementProblems(["div", "style", "link"])).toEqual([
      "a script created a <link> element at run time",
      "a script created a <style> element at run time",
    ]);
  });
});

describe("blobWorkerProblems", () => {
  it("passes a blob the page's origin made", () => {
    expect(blobWorkerProblems([`blob:${PAGE}/abc`], PAGE)).toEqual([]);
  });

  it("fails when no worker started, or one is a file or a blob of another origin", () => {
    expect(blobWorkerProblems([], PAGE)).toHaveLength(1);
    expect(
      blobWorkerProblems(
        [`${PAGE}/mapcairn/browser-worker.js`, "blob:https://cdn.example/x"],
        PAGE,
      ),
    ).toHaveLength(2);
  });
});

describe("fileRequestProblems", () => {
  const fetched = [
    `${PAGE}/mapcairn/browser.js`,
    `${PAGE}/mapcairn/browser-engine-AbC_1.js`,
    `${PAGE}/mapcairn/browser-worker-De-F2.js`,
  ];

  it("passes when the engine's chunk and the worker's text came from beside the module", () => {
    expect(fileRequestProblems(fetched, "/mapcairn", PAGE)).toEqual([]);
  });

  it("names a chunk that was not fetched from there", () => {
    expect(fileRequestProblems(fetched.slice(0, 2), "/mapcairn", PAGE)).toEqual(
      [
        `the worker's text was not fetched from beside the module, at ${PAGE}/mapcairn/`,
      ],
    );
    expect(fileRequestProblems([], "/mapcairn", PAGE)).toHaveLength(2);
  });

  it("fails a request for a worker file", () => {
    expect(
      fileRequestProblems(
        [...fetched, `${PAGE}/mapcairn/browser-worker.js`],
        "/mapcairn",
        PAGE,
      ),
    ).toEqual([
      "the page asked for a worker file, which the bundle does not serve",
    ]);
  });
});

const moment = (overrides = {}) => ({
  canvases: 0,
  regions: 0,
  listeners: 15,
  workers: { made: 1, ended: 1 },
  ...overrides,
});

const cycle = (overrides = {}) => ({
  both: moment({ canvases: 2, regions: 4 }),
  afterFirst: {
    ...moment({ canvases: 1, regions: 2 }),
    firstChildren: 0,
    firstAttributes: ["id"],
    secondCanvases: 1,
    secondZoom: 3,
  },
  end: { ...moment(), containerAttributes: { first: ["id"], second: ["id"] } },
  ...overrides,
});

const BASELINE = { first: ["id"], second: ["id"] };

describe("cycleProblems", () => {
  it("passes two maps that drew, one destroyed and the other left drawing, then both gone", () => {
    expect(cycleProblems(cycle(), BASELINE)).toEqual([]);
  });

  it.each([
    ["one canvas", { both: moment({ canvases: 1, regions: 4 }) }, /not two/],
    [
      "no live region of its own",
      { both: moment({ canvases: 2, regions: 1 }) },
      /live region/,
    ],
    [
      "markup left in the destroyed map's container",
      {
        afterFirst: {
          ...cycle().afterFirst,
          firstChildren: 1,
        },
      },
      /still holds markup/,
    ],
    [
      "the other map lost its canvas",
      {
        afterFirst: {
          ...cycle().afterFirst,
          secondCanvases: 0,
        },
      },
      /other map has 0 canvases/,
    ],
    [
      "live regions of the destroyed map left",
      { afterFirst: { ...cycle().afterFirst, regions: 4 } },
      /left its live regions/,
    ],
    [
      "a marker left on the destroyed map's container",
      {
        afterFirst: {
          ...cycle().afterFirst,
          firstAttributes: ["id", "data-mapcairn"],
        },
      },
      /data-mapcairn/,
    ],
    [
      "a canvas left after both",
      { end: { ...cycle().end, canvases: 1 } },
      /1 canvases/,
    ],
    [
      "an attribute left on the first container after both",
      {
        end: {
          ...cycle().end,
          containerAttributes: { first: ["id", "data-theme"], second: ["id"] },
        },
      },
      /first container has the attributes id, data-theme/,
    ],
    [
      "an attribute left on the second container after both",
      {
        end: {
          ...cycle().end,
          containerAttributes: {
            first: ["id"],
            second: ["id", "data-mapcairn"],
          },
        },
      },
      /second container has the attributes id, data-mapcairn/,
    ],
    [
      "the other map not moving when asked",
      { afterFirst: { ...cycle().afterFirst, secondZoom: undefined } },
      /did not move when asked/,
    ],
  ])("names %s", (_name, overrides, pattern) => {
    expect(cycleProblems(cycle(overrides), BASELINE).join("\n")).toMatch(
      pattern,
    );
  });
});

describe("leakProblems", () => {
  it("passes a second cycle that leaves what the first left, with the worker ended each time", () => {
    expect(leakProblems([cycle(), cycle()])).toEqual([]);
  });

  it("names listeners that grow from one cycle to the next", () => {
    const grown = cycle({
      end: {
        ...moment({ listeners: 18 }),
        containerAttributes: { first: ["id"], second: ["id"] },
      },
    });
    expect(leakProblems([cycle(), grown])).toEqual([
      "a second pair of maps left 3 more listeners on after destroy",
    ]);
  });

  it("names a worker that was not ended", () => {
    const running = cycle({
      end: {
        ...moment({ workers: { made: 2, ended: 1 } }),
        containerAttributes: { first: ["id"], second: ["id"] },
      },
    });
    expect(leakProblems([cycle(), running]).join()).toMatch(
      /after cycle 2 2 workers had been made and 1 ended/,
    );
  });

  it("needs two cycles to tell a leak from a one-time cost", () => {
    expect(leakProblems([cycle()])).toHaveLength(1);
  });
});

describe("hostilePageProblems", () => {
  const chrome = {
    theme: "light",
    buttons: [
      {
        name: "Zoom in",
        width: 48,
        height: 48,
        boxSizing: "border-box",
        margin: "0px",
        background: "rgba(0, 0, 0, 0)",
      },
    ],
    focus: { name: "Zoom in", outlineStyle: "solid", outlineWidth: "2px" },
  };

  it("passes a hostile page whose chrome is as it is on a page with no rules", () => {
    expect(hostilePageProblems({ clean: chrome, hostile: chrome })).toEqual([]);
  });

  it("names a button under 44 px, a missing focus ring, another theme and any other change", () => {
    const small = {
      ...chrome,
      buttons: [{ ...chrome.buttons[0], width: 54, height: 16 }],
    };
    const noRing = {
      ...chrome,
      focus: { name: "Zoom in", outlineStyle: "none", outlineWidth: "0px" },
    };
    const dark = { ...chrome, theme: "dark" };
    expect(
      hostilePageProblems({ clean: chrome, hostile: small }).join("\n"),
    ).toMatch(/"Zoom in" is 54 by 16 px, under 44 px/);
    expect(
      hostilePageProblems({ clean: chrome, hostile: noRing }).join("\n"),
    ).toMatch(/no focus ring/);
    expect(
      hostilePageProblems({ clean: chrome, hostile: dark }).join("\n"),
    ).toMatch(/theme is dark on the hostile page and light/);
    expect(
      hostilePageProblems({
        clean: chrome,
        hostile: {
          ...chrome,
          buttons: [{ ...chrome.buttons[0], margin: "7px" }],
        },
      }).join("\n"),
    ).toMatch(/not the same/);
  });

  it("fails a page that drew no buttons, which would pass for nothing", () => {
    expect(
      hostilePageProblems({
        clean: chrome,
        hostile: { ...chrome, buttons: [] },
      }),
    ).toHaveLength(1);
  });
});

describe("bundleLoadSizes", () => {
  const bytes = (text: string) => Buffer.from(text.repeat(400));

  it("adds the first load's three files and the lazy chunks, each gzipped alone", () => {
    const sizes = bundleLoadSizes({
      "browser.js": bytes("a"),
      "browser.css": bytes("b"),
      "browser-rolldown-runtime-AbC.js": bytes("c"),
      "browser-engine-AbC.js": bytes("d"),
      "browser-worker-AbC.js": bytes("e"),
    });
    expect(sizes.map((size: { name: string }) => size.name)).toEqual([
      FIRST_LOAD_BUILD,
      ENGINE_BUILD,
    ]);
    const [first, lazy] = sizes;
    expect(first.gzipBytes).toBeGreaterThan(0);
    expect(lazy.gzipBytes).toBeGreaterThan(0);
    expect(bundleLoadSizes({ "browser.js": bytes("a") })[1].gzipBytes).toBe(0);
  });

  it("counts the module's shared chunk and the element's file in the first load, and says when it cannot place a file", () => {
    const [first] = bundleLoadSizes({
      "browser-shared-AbC.js": bytes("a"),
      "browser-element.js": bytes("b"),
    });
    expect(first.gzipBytes).toBe(
      bundleLoadSizes({ "browser-shared-AbC.js": bytes("a") })[0].gzipBytes +
        bundleLoadSizes({ "browser-element.js": bytes("b") })[0].gzipBytes,
    );
    expect(() =>
      bundleLoadSizes({ "browser-other-AbC.js": bytes("a") }),
    ).toThrow(/neither first load nor a lazy chunk/);
  });

  it("counts the private elements' chunk, which the first map loads, in the first load", () => {
    const [first, lazy] = bundleLoadSizes({
      "browser-elements-AbC.js": bytes("a"),
    });
    expect(first.gzipBytes).toBeGreaterThan(0);
    expect(lazy.gzipBytes).toBe(0);
  });
});

describe("privateElementProblems", () => {
  const good = {
    groups: [
      { tag: "mapcairn-segmented-1", shadow: false },
      { tag: "mapcairn-segmented-1", shadow: false },
    ],
    writers: ["mapcairn-announcement-1", "mapcairn-announcement-1"],
    keyboard: {
      entered: "System",
      afterArrow: "Light",
      checkedAfterArrow: "System",
      checkedAfterSpace: "Light",
    },
    announced: "Globe view.",
  };

  it("passes when the elements drew in the light DOM, took the keys and spoke", () => {
    expect(privateElementProblems(good)).toEqual([]);
  });

  it.each([
    ["no segmented control was drawn", { groups: [] }],
    [
      "a control is not the private element",
      { groups: [{ tag: "div", shadow: false }] },
    ],
    [
      "a control has a shadow root",
      { groups: [{ tag: "mapcairn-segmented-1", shadow: true }] },
    ],
    ["the announcer's writer is missing", { writers: [] }],
    [
      "an arrow key chose",
      { keyboard: { ...good.keyboard, checkedAfterArrow: "Light" } },
    ],
    [
      "an arrow key did not move focus",
      { keyboard: { ...good.keyboard, afterArrow: "System" } },
    ],
    [
      "focus did not enter on the chosen item",
      { keyboard: { ...good.keyboard, entered: "" } },
    ],
    [
      "Space did not choose",
      { keyboard: { ...good.keyboard, checkedAfterSpace: "System" } },
    ],
    ["nothing was announced", { announced: "" }],
  ])("fails when %s", (_case, change) => {
    expect(privateElementProblems({ ...good, ...change })).not.toEqual([]);
  });
});

describe("plantedStyleProblems", () => {
  it("passes when the policy reported the planted style binding", () => {
    expect(
      plantedStyleProblems([
        { violatedDirective: "style-src-attr", blockedURI: "inline" },
      ]),
    ).toEqual([]);
  });

  it.each([
    ["nothing was reported", []],
    [
      "only another directive was",
      [{ violatedDirective: "script-src-elem", blockedURI: "inline" }],
    ],
  ])(
    "fails when %s, since the clean pages would then prove nothing",
    (_case, violations) => {
      expect(plantedStyleProblems(violations).join()).toContain("planted");
    },
  );
});

describe("twoCopiesProblems", () => {
  const copy = (n: number) => ({
    tags: [`mapcairn-segmented-${n}`, `mapcairn-announcement-${n}`],
    chosen: "Light",
  });
  const good = { copies: [copy(1), copy(2)], classesShared: false };

  it("passes when each copy defined and ran its own elements", () => {
    expect(twoCopiesProblems(good)).toEqual([]);
  });

  it.each([
    ["only one copy drew", { copies: [copy(1)] }],
    ["both copies used one name", { copies: [copy(1), copy(1)] }],
    ["both names run one class", { classesShared: true }],
    [
      "a copy's control did not answer",
      { copies: [copy(1), { ...copy(2), chosen: "System" }] },
    ],
    ["a copy drew no element", { copies: [copy(1), { ...copy(2), tags: [] }] }],
  ])("fails when %s", (_case, change) => {
    expect(twoCopiesProblems({ ...good, ...change })).not.toEqual([]);
  });
});

describe("elementProblems", () => {
  const good = {
    display: "block",
    startZoom: 4,
    both: { canvases: 2, regions: 2 },
    movedZoom: MOVED_ZOOM,
    writtenBack: [],
    afterFirst: {
      canvases: 1,
      regions: 1,
      firstChildren: 0,
      firstMarked: false,
    },
    keptMap: true,
    end: { canvases: 0, regions: 0, marked: 0, workers: { made: 1, ended: 1 } },
    errorKind: "invalid-option",
    errorMessage: "tools: nope",
    logged: ["tools: nope"],
  };

  it("passes a run that did everything the element promises", () => {
    expect(elementProblems(good)).toEqual([]);
  });

  it.each([
    ["an inline element", { display: "inline" }, /display is inline/],
    ["a start from the wrong zoom", { startZoom: 2 }, /not 4/],
    [
      "one canvas for two elements",
      { both: { canvases: 1, regions: 2 } },
      /1 canvases/,
    ],
    ["a view that never arrived", { movedZoom: undefined }, /zoom undefined/],
    ["a write back", { writtenBack: ["zoom"] }, /wrote zoom back/],
    ["a rebuilt map", { keptMap: false }, /rebuilt its map/],
    [
      "markup left by the first",
      {
        afterFirst: {
          canvases: 1,
          regions: 1,
          firstChildren: 3,
          firstMarked: false,
        },
      },
      /3 children/,
    ],
    [
      "a canvas left at the end",
      {
        end: {
          canvases: 1,
          regions: 0,
          marked: 0,
          workers: { made: 1, ended: 1 },
        },
      },
      /1 canvases/,
    ],
    [
      "a worker left running",
      {
        end: {
          canvases: 0,
          regions: 0,
          marked: 0,
          workers: { made: 2, ended: 1 },
        },
      },
      /2 workers were made and 1 ended/,
    ],
    ["the wrong error kind", { errorKind: "server" }, /not invalid-option/],
    ["a message that was not logged", { logged: [] }, /logs the message once/],
  ])("fails %s", (_name, change, message) => {
    expect(elementProblems({ ...good, ...change }).join("\n")).toMatch(message);
  });
});

describe("the page activity counter", () => {
  it("is a script that keeps listeners, workers and created tags on window", () => {
    expect(COUNT_PAGE_ACTIVITY).toContain("window.__activity");
    for (const name of ["listeners", "workers", "created"]) {
      expect(COUNT_PAGE_ACTIVITY).toContain(`${name}:`);
    }
  });
});

describe("hostParityProblems", () => {
  const button = (
    name: string,
    width: number,
    height: number,
    boxSizing: string,
  ) => ({
    name,
    width,
    height,
    boxSizing,
    margin: "0px",
    background: "x",
    icon: null,
  });
  const chrome = (zoomOutHeight = 49, zoomOutBox = "content-box") => ({
    theme: "light",
    focus: undefined,
    buttons: [
      button("Zoom in", 48, 48, "border-box"),
      button("Zoom out", 48, zoomOutHeight, zoomOutBox),
      button("Map credits", 44, 44, "border-box"),
    ],
  });

  it("passes the boxes the reference host gives, Zoom out's hairline included", () => {
    expect(hostParityProblems(chrome())).toEqual([]);
  });

  it("names a box that differs, and a button that is missing", () => {
    expect(hostParityProblems(chrome(48, "border-box")).join("\n")).toMatch(
      /"Zoom out" has height 48 in the bundle and 49 in the reference host/,
    );
    expect(hostParityProblems({ ...chrome(), buttons: [] })).toHaveLength(3);
  });
});

describe("bundleLoadSizes with a file it cannot place", () => {
  it("throws, so a file left out of both groups cannot escape every ceiling", () => {
    expect(() =>
      bundleLoadSizes({
        "browser.js": Buffer.from("a"),
        "browser-extra.js": Buffer.from("b"),
      }),
    ).toThrow(
      /browser-extra\.js is a file of the bundle that is neither first load nor a lazy chunk/,
    );
    expect(() => bundleLoadSizes({ "browser.d.ts": Buffer.from("a") })).toThrow(
      /browser\.d\.ts/,
    );
  });
});

describe("workerRefusalProblems", () => {
  it("passes a worker-src refusal of a blob, reported by scheme or by address", () => {
    expect(
      workerRefusalProblems([
        { violatedDirective: "worker-src", blockedURI: "blob" },
      ]),
    ).toEqual([]);
    expect(
      workerRefusalProblems([
        { violatedDirective: "worker-src-elem", blockedURI: "blob:http://x/1" },
      ]),
    ).toEqual([]);
  });

  it("fails no violation, and any other violation, naming what was seen", () => {
    expect(workerRefusalProblems([])[0]).toContain("no violation");
    const other = workerRefusalProblems([
      { violatedDirective: "style-src-elem", blockedURI: "inline" },
      { violatedDirective: "worker-src", blockedURI: "http://x/w.js" },
    ]);
    expect(other[0]).toContain(
      "only style-src-elem on inline, worker-src on http://x/w.js",
    );
  });
});
