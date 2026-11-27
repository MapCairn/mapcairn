// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeNotices } from "./bundleLicences.mjs";
import {
  mergedStylesheet,
  moduleIdsOf,
  pageReset,
  withoutSourceMapComment,
} from "./bundleOutput.mjs";
import { NOTICES_FILE, packageFileOf } from "./bundleSettings.mjs";
import { ALLOWLIST_FILE } from "./sdkLicences.mjs";

/** The stylesheet the engine's loader imports on demand, which the bundle merges into its own. */
const ENGINE_STYLESHEET = "maplibre-gl/dist/maplibre-gl.css";

/** The id of the empty module the engine's stylesheet import is given. */
const EMPTY_STYLESHEET_MODULE = "\0mapcairn-engine-stylesheet";

/**
 * Vite's `build` for a bundle: every import is bundled, React and the engine
 * included, with the engine in a lazy chunk. The engine's stylesheet is
 * emptied where it is imported and added to the bundle's own stylesheet, so no
 * chunk adds a `link` or a `style` element when it loads.
 *
 * @param {object} input
 * @param {string} input.folder The package folder.
 * @param {Record<string, string>} input.entries Output name to source path.
 * @param {string} input.stylesheet The name of the merged stylesheet, without its extension.
 * @param {Map<string, string>} input.embedded The text of each embedded file, by the absolute path of the module that stands in for it.
 * @returns {Promise<string[]>} The ids of the modules that reached the output.
 */
async function bundleModules({ folder, entries, stylesheet, embedded }) {
  const { build } = await import("vite");
  // The theme is built before the umbrella, and its token values are the custom properties the stylesheet uses.
  const theme = await import(
    pathToFileURL(
      createRequire(path.join(folder, "package.json")).resolve(
        "@mapcairn/theme",
      ),
    ).href
  );
  const reset = pageReset(theme);
  const engineStylesheet = path.join(
    path.dirname(
      createRequire(path.join(folder, "package.json")).resolve(
        "maplibre-gl/package.json",
      ),
    ),
    "dist",
    "maplibre-gl.css",
  );
  /** @type {Set<string>} */
  const moduleIds = new Set();
  await build({
    root: folder,
    configFile: false,
    logLevel: "warn",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "mapcairn-engine-stylesheet",
        resolveId(source) {
          return source === ENGINE_STYLESHEET ? EMPTY_STYLESHEET_MODULE : null;
        },
        load(id) {
          if (id === EMPTY_STYLESHEET_MODULE) {
            return "export {};";
          }
          const text = embedded.get(id);
          return text === undefined
            ? null
            : `export default ${JSON.stringify(text)};`;
        },
        // Before Vite's own resolver, which would otherwise find the file first.
        enforce: "pre",
        generateBundle: {
          order: "post",
          handler(_options, bundle) {
            for (const id of moduleIdsOf(bundle)) {
              moduleIds.add(id);
            }
            const name = `${stylesheet}.css`;
            const sheet = bundle[name];
            const merged = mergedStylesheet(
              readFileSync(engineStylesheet, "utf8"),
              sheet,
              name,
              reset,
            );
            if (sheet?.type === "asset") {
              sheet.source = merged;
            }
          },
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      cssCodeSplit: false,
      modulePreload: false,
      lib: {
        formats: ["es"],
        cssFileName: stylesheet,
        entry: Object.fromEntries(
          Object.entries(entries).map(([name, source]) => [
            name,
            path.resolve(folder, source),
          ]),
        ),
      },
      rolldownOptions: {
        // The module level "use client" notes in the interface's dependencies
        // mean nothing in a bundle for a page.
        onwarn(warning, defaultHandler) {
          if (warning.code !== "MODULE_LEVEL_DIRECTIVE") {
            defaultHandler(warning);
          }
        },
        output: {
          codeSplitting: {
            groups: [
              {
                name: "engine",
                test: /node_modules[\\/]maplibre-gl[\\/]|\0mapcairn-engine-stylesheet/,
              },
              { name: "worker", test: (id) => embedded.has(id) },
              // What both entries load, so the element's file is a few lines over the module's.
              { name: "shared", minShareCount: 2 },
            ],
          },
          entryFileNames: "[name].js",
          chunkFileNames: "browser-[name]-[hash].js",
          assetFileNames: "[name][extname]",
        },
      },
    },
  });
  return [...moduleIds];
}

/**
 * Builds the bundle of a package into `dist`: the modules and the stylesheet,
 * and `THIRD-PARTY-NOTICES.md` at the package root.
 * The build fails when a package that reached the bundle has a licence that is
 * not on `scripts/sdkLicences.allowlist.json`.
 *
 * @param {object} input
 * @param {string} input.folder The package folder.
 * @param {import("./bundleSettings.mjs").BundleSettings} input.bundle
 * @param {Record<string, string>} input.entries Output name to source path, for the bundle's entries only.
 * @param {string} [input.root] The repository root, where the allowlist is.
 * @returns {Promise<void>}
 */
export async function buildBundle({
  folder,
  bundle,
  entries,
  root = path.resolve(folder, "../.."),
}) {
  const [stylesheet] = bundle.entries;
  const require = createRequire(path.join(folder, "package.json"));
  const embedded = new Map();
  const embeddedFolders = [];
  for (const [module, source] of Object.entries(bundle.embed)) {
    const { packageFolder, file } = packageFileOf(source, require);
    embeddedFolders.push(packageFolder);
    embedded.set(
      path.resolve(folder, module),
      withoutSourceMapComment(readFileSync(file, "utf8")),
    );
  }
  const moduleIds = await bundleModules({
    folder,
    entries,
    stylesheet,
    embedded,
  });
  writeNotices({
    moduleIds,
    embeddedFolders,
    allowlist: JSON.parse(
      readFileSync(path.join(root, ALLOWLIST_FILE), "utf8"),
    ),
    file: path.join(folder, NOTICES_FILE),
  });
}
