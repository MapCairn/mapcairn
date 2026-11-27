// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertBuilt,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildSdk.mjs";

/**
 * `examples/browser` is the page an adopter reads first, so it is held to a
 * few lines, to no option, and to the files it serves being exactly what the
 * bundle needs.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const EXAMPLE = path.join(REPO, "examples", "browser");
const SERVED = path.join(EXAMPLE, "mapcairn");

/** "About ten lines or fewer", in the issue's words: a page and its script each. */
const MOST_LINES = 10;

function lines(file: string): string[] {
  return readFileSync(path.join(EXAMPLE, file), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("//"));
}

describe("the plain page example", () => {
  it("is a page and a script of about ten lines or fewer each", () => {
    expect(lines("index.html").length).toBeLessThanOrEqual(MOST_LINES);
    expect(lines("main.js").length).toBeLessThanOrEqual(MOST_LINES);
  });

  it("links the stylesheet and the module from one folder, and draws a map with no option passed", () => {
    const html = readFileSync(path.join(EXAMPLE, "index.html"), "utf8");
    const script = readFileSync(path.join(EXAMPLE, "main.js"), "utf8");
    expect(html).toContain('href="./mapcairn/browser.css"');
    expect(html).toContain('<script type="module" src="./main.js">');
    // No inline style or script, whatever the case or attributes: every script has a `src`.
    expect(html).not.toMatch(/<style|\sstyle=|<script(?![^>]*\ssrc=)/i);
    expect(script).toContain('from "./mapcairn/browser.js"');
    expect(script).toMatch(
      /mountMap\(document\.getElementById\("map"\)\);\s*$/,
    );
  });

  it("has a second page that draws the map with the tag alone: a module that registers it, no script of its own and no option passed", () => {
    const html = readFileSync(path.join(EXAMPLE, "element.html"), "utf8");
    expect(lines("element.html").length).toBeLessThanOrEqual(MOST_LINES);
    expect(html).toContain('href="./mapcairn/browser.css"');
    expect(html).toContain(
      '<script type="module" src="./mapcairn/browser-element.js"></script>',
    );
    expect(html).toContain("<mapcairn-map></mapcairn-map>");
    expect(html).not.toMatch(/<style|\sstyle=|<script(?![^>]*\ssrc=)/i);
  });

  it("is a workspace that depends on the umbrella alone", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(EXAMPLE, "package.json"), "utf8"),
    );
    expect(Object.keys(manifest.dependencies)).toEqual(["@mapcairn/sdk"]);
  });
});

describe("the files the example copies", () => {
  beforeAll(() => {
    assertBuilt("sdk");
    rmSync(SERVED, { recursive: true, force: true });
    const result = spawnSync(
      process.execPath,
      [path.join(EXAMPLE, "copyFiles.mjs")],
      { encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
  afterAll(() => {
    rmSync(SERVED, { recursive: true, force: true });
  });

  /** The relative files a copied script loads, statically or on demand. */
  function loadedBy(file: string): string[] {
    const source = readFileSync(path.join(SERVED, file), "utf8");
    return [...source.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)].map(
      (match) => match[1] ?? "",
    );
  }

  it("are the stylesheet, the module, the element's file and every file they load, and nothing else", () => {
    const needed = new Set(["browser.js", "browser-element.js", "browser.css"]);
    const queue = ["browser.js", "browser-element.js"];
    for (const file of queue) {
      for (const next of loadedBy(file)) {
        if (!needed.has(next)) {
          needed.add(next);
          queue.push(next);
        }
      }
    }
    expect(readdirSync(SERVED).sort()).toEqual([...needed].sort());
  });

  it("include no declaration file and no file for the worker", () => {
    const names = readdirSync(SERVED);
    expect(names.filter((name) => name.endsWith(".d.ts"))).toEqual([]);
    expect(names).not.toContain("browser-worker.js");
    expect(existsSync(path.join(SERVED, "browser.js"))).toBe(true);
  });
});
