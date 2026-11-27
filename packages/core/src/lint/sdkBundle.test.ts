// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertBuilt,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/buildSdk.mjs";

/**
 * Reads the built bundle of `@mapcairn/sdk/browser` in `packages/sdk/dist`
 * (run `npm run build:sdk` first): what is in it and what is not, and that its
 * lazy chunk loads by its relative address.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const SDK = path.join(REPO, "packages", "sdk");
const DIST = path.join(SDK, "dist");
const LOAD_TIMEOUT_MS = 30_000;

function bundleFiles(): string[] {
  if (!existsSync(DIST)) {
    throw new Error(
      'packages/sdk/dist does not exist: run "npm run build:sdk" first.',
    );
  }
  return readdirSync(DIST).filter((file) => /^browser[-.]/.test(file));
}

function read(file: string): string {
  return readFileSync(path.join(DIST, file), "utf8");
}

const scripts = () => bundleFiles().filter((file) => file.endsWith(".js"));
const engineChunk = () =>
  bundleFiles().filter((file) => /^browser-engine-[\w-]+\.js$/.test(file));
/** What `browser.js` and `browser-element.js` share: the code of the module. */
const sharedChunk = () =>
  bundleFiles().filter((file) => /^browser-shared-[\w-]+\.js$/.test(file));
const workerChunk = () =>
  bundleFiles().filter((file) => /^browser-worker-[\w-]+\.js$/.test(file));

/** The module specifiers a script imports, re-exports or loads. */
function specifiersOf(source: string): string[] {
  const patterns = [
    /(?:^|[;}\s])(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
    /(?:^|[;}\s])import\s*["']([^"']+)["']/g,
    /(?<![\w.$])import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

describe("the files of @mapcairn/sdk/browser", () => {
  beforeAll(() => assertBuilt("sdk"));

  it("are the module, its lazy chunks, the stylesheet and their declarations, with no source map and no file for the worker", () => {
    const files = bundleFiles();
    for (const file of [
      "browser.js",
      "browser-element.js",
      "browser.css",
      "browser.css.d.ts",
      "browser.d.ts",
      "browser-element.d.ts",
    ]) {
      expect(files, file).toContain(file);
    }
    expect(sharedChunk()).toHaveLength(1);
    expect(engineChunk()).toHaveLength(1);
    expect(workerChunk()).toHaveLength(1);
    // A page that serves the bundle's files serves no worker file: the worker
    // is a string in a chunk, started from a blob.
    expect(files).not.toContain("browser-worker.js");
    expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
    for (const file of files.filter((name) => name.endsWith(".js"))) {
      expect(read(file), file).not.toMatch(/\/\/# sourceMappingURL=\S+\s*$/);
    }
  });

  it("leave nothing external: every import is a relative file", () => {
    for (const file of scripts()) {
      for (const specifier of specifiersOf(read(file))) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\//);
      }
    }
  });

  it("load the worker's text from a chunk of its own beside the module, never from the first load", () => {
    const [chunk] = workerChunk();
    const [shared = ""] = sharedChunk();
    expect(read(shared)).toContain(`import("./${chunk}")`);
    expect(read(shared)).not.toContain("maplibre-gl-worker");
    expect(read("browser.js")).not.toContain("import(");
  });

  it("make the element's file a call of the module's own function, so a page that loads the tag loads the module once", () => {
    const [shared = ""] = sharedChunk();
    expect(read("browser-element.js")).toContain(`from "./${shared}"`);
    expect(read("browser-element.js").length).toBeLessThan(200);
    expect(read("browser.js")).toContain(`from "./${shared}"`);
    expect(read("browser.js")).toMatch(
      /\bdefineMapElement\b|\bt as defineMapElement\b/,
    );
  });

  it("have process.env.NODE_ENV replaced", () => {
    for (const file of scripts()) {
      expect(read(file), file).not.toContain("process.env.NODE_ENV");
    }
  });

  it("load the engine from a chunk beside the module, with a plain import and no preload helper", () => {
    const [chunk] = engineChunk();
    const [shared = ""] = sharedChunk();
    const source = read(shared);
    expect(source).toContain(`import("./${chunk}")`);
    expect(source).not.toMatch(/__vitePreload|vite\/preload-helper/);
    expect(source).not.toMatch(new RegExp(`from\\s*"\\./${chunk}"`));
  });

  it("add no stylesheet or script element of their own through the engine, and import no stylesheet", () => {
    const [chunk] = engineChunk();
    expect(read(chunk ?? ""), "the engine chunk").not.toMatch(
      /createElement\(\s*["'](?:link|style)["']/,
    );
    for (const file of scripts()) {
      expect(read(file), file).not.toMatch(/import\s*["'][^"']*\.css["']/);
    }
  });

  it("carry the tokens, the interface's, the adapter's and the engine's rules in one stylesheet", () => {
    const sheet = read("browser.css");
    expect(sheet).toContain(".maplibregl-");
    expect(sheet).toContain("[data-map-host]");
    expect(sheet).toContain("--");
    expect(sheet).not.toMatch(/@import/);
  });

  it("hold the engine's rules once, ahead of the adapter's overrides", () => {
    const sheet = read("browser.css");
    const installed = path.join(
      path.dirname(
        createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
      ),
      "dist",
      "maplibre-gl.css",
    );
    const engine = readFileSync(installed, "utf8");
    const adapter = readFileSync(
      path.join(REPO, "packages", "adapter-maplibre", "dist", "styles.css"),
      "utf8",
    );
    const count = (text: string) =>
      text.split(".maplibregl-canvas-container").length - 1;
    // One copy of MapLibre's rules and one of the adapter's, and no second copy of either.
    expect(count(sheet)).toBe(count(engine) + count(adapter));
    const reset = sheet.slice(0, sheet.indexOf("\n"));
    expect(reset).toMatch(
      /^mapcairn-map\{display:block\}\[data-mapcairn\] \*:where\(:not\(svg,svg \*\)\)\{all:revert\}/,
    );
    expect(sheet.startsWith(`${reset}\n${engine}`)).toBe(true);
    expect(sheet.indexOf("[data-map-host]")).toBeGreaterThan(engine.length);
  });

  it("start with the reset that gives a page's element rules no hold on the interface, and hold no cascade layer", () => {
    const sheet = read("browser.css");
    expect(sheet).toContain(
      "[data-mapcairn],[data-mapcairn] *,[data-mapcairn] *::before",
    );
    expect(sheet).toContain("box-sizing:border-box}");
    expect(sheet).not.toMatch(/@layer/);
    // The primitives' rules are still there, now outside any layer.
    expect(sheet).toContain("min-height:var(");
  });

  it(
    "hold the engine's worker as the installed file's text, as the one thing the worker chunk exports",
    async () => {
      const installed = path.join(
        path.dirname(
          createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
        ),
        "dist",
        "maplibre-gl-worker.mjs",
      );
      const original = readFileSync(installed, "utf8");
      const [chunk] = workerChunk();
      const exported = await import(
        /* @vite-ignore */ pathToFileURL(path.join(DIST, chunk ?? "")).href
      );
      // The bundler gives the module's namespace a short name, so it is read by position.
      const [namespace] = Object.values(exported) as [{ default: string }];
      const text = namespace.default;
      expect(Object.keys(exported)).toHaveLength(1);
      expect(Object.keys(namespace)).toEqual(["default"]);
      expect(original.startsWith(text.trimEnd())).toBe(true);
      expect(text).not.toMatch(/\/\/# sourceMappingURL=\S+\s*$/);
      expect(original.length - text.length).toBeLessThan(200);
    },
    LOAD_TIMEOUT_MS,
  );

  it("declare their types in one file that imports no @mapcairn package and no react", () => {
    for (const specifier of specifiersOf(read("browser.d.ts"))) {
      expect(specifier).not.toMatch(/^(?:@mapcairn\/|react)/);
    }
    expect(read("browser.d.ts")).toContain("export declare function mountMap");
  });

  it(
    "load in plain Node, and so does the lazy chunk by its relative address",
    () => {
      const [chunk] = engineChunk();
      const code = `
      const module = await import(${JSON.stringify(pathToFileURL(path.join(DIST, "browser.js")).href)});
      if (typeof module.mountMap !== "function") throw new Error("no mountMap");
      await import(new URL(${JSON.stringify(`./${chunk}`)}, ${JSON.stringify(pathToFileURL(path.join(DIST, "browser.js")).href)}).href);
    `;
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "--eval", code],
        { encoding: "utf8" },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
    LOAD_TIMEOUT_MS,
  );
});

describe("THIRD-PARTY-NOTICES.md", () => {
  beforeAll(() => assertBuilt("sdk"));

  const notices = () =>
    readFileSync(path.join(SDK, "THIRD-PARTY-NOTICES.md"), "utf8");

  it("names what the bundle holds, each with its licence and text, and nothing it does not hold", () => {
    const text = notices();
    for (const name of [
      "react",
      "react-dom",
      "maplibre-gl",
      "@phosphor-icons/react",
    ]) {
      expect(text, name).toMatch(
        new RegExp(`^## ${name.replace("/", "\\/")} \\d`, "m"),
      );
    }
    expect(text).toMatch(/Licence: MIT/);
    expect(text).not.toMatch(/^## @mapcairn\//m);
    expect(text).not.toMatch(/^## vite /m);
  });

  it("is generated at the build and left out of git", () => {
    const ignored = readFileSync(path.join(REPO, ".gitignore"), "utf8");
    expect(ignored).toContain("packages/sdk/THIRD-PARTY-NOTICES.md");
    expect(
      JSON.parse(readFileSync(path.join(SDK, "package.json"), "utf8")).files,
    ).toContain("THIRD-PARTY-NOTICES.md");
  });
});
