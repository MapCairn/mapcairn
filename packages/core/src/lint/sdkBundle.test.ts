// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

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
  it("are the module, one lazy engine chunk, the stylesheet, the worker and their declarations, with no source map", () => {
    const files = bundleFiles();
    for (const file of [
      "browser.js",
      "browser.css",
      "browser.css.d.ts",
      "browser.d.ts",
      "browser-worker.js",
      "browser-worker.d.ts",
    ]) {
      expect(files, file).toContain(file);
    }
    expect(engineChunk()).toHaveLength(1);
    expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
    // The worker is the engine's own file, as published, and names its map.
    for (const file of files.filter(
      (name) => name.endsWith(".js") && name !== "browser-worker.js",
    )) {
      expect(read(file), file).not.toMatch(/\/\/# sourceMappingURL=\S+\s*$/);
    }
  });

  it("leave nothing external: every import is a relative file", () => {
    for (const file of scripts().filter((f) => f !== "browser-worker.js")) {
      for (const specifier of specifiersOf(read(file))) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\//);
      }
    }
  });

  it("look for the worker by the name the build copies it to", () => {
    const { copy } = JSON.parse(
      readFileSync(path.join(SDK, "package.json"), "utf8"),
    ).mapcairn.bundle;
    expect(Object.keys(copy)).toEqual(["browser-worker.js"]);
    for (const name of Object.keys(copy)) {
      expect(read("browser.js")).toContain(`"${name}"`);
    }
  });

  it("have process.env.NODE_ENV replaced", () => {
    for (const file of scripts()) {
      expect(read(file), file).not.toContain("process.env.NODE_ENV");
    }
  });

  it("load the engine from a chunk beside the module, with a plain import and no preload helper", () => {
    const [chunk] = engineChunk();
    const source = read("browser.js");
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

  it("serve the engine's worker as a copy of the installed file", () => {
    const installed = path.join(
      path.dirname(
        createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
      ),
      "dist",
      "maplibre-gl-worker.mjs",
    );
    expect(read("browser-worker.js")).toBe(readFileSync(installed, "utf8"));
  });

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
