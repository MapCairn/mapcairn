// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  bundledPackagesOf,
  judgeBundledPackages,
  noticesOf,
} from "./bundleLicences.mjs";
import { ALLOWLIST_FILE } from "./sdkLicences.mjs";

/** The file `buildBundle` writes at the root of the package, and the manifest lists in `files`. */
export const NOTICES_FILE = "THIRD-PARTY-NOTICES.md";

/** The stylesheet the engine's loader imports on demand, which the bundle merges into its own. */
const ENGINE_STYLESHEET = "maplibre-gl/dist/maplibre-gl.css";

/** The id of the empty module the engine's stylesheet import is given. */
const EMPTY_STYLESHEET_MODULE = "\0mapcairn-engine-stylesheet";

/**
 * @typedef {object} BundleSettings
 * @property {string[]} entries The output names built as a bundle, such as `browser`.
 * @property {Record<string, string>} copy Files copied into `dist` as they are, by their name in `dist` and the path inside an installed package.
 */

/**
 * What a manifest says about its bundle: the entries that are built as one
 * self-contained module graph, and the files that are copied beside them.
 *
 * @param {Record<string, any>} manifest
 * @returns {BundleSettings | undefined} `undefined` for a package that builds no bundle.
 */
export function bundleOf(manifest) {
  const bundle = manifest.mapcairn?.bundle;
  if (bundle === undefined) {
    return undefined;
  }
  return { entries: bundle.entries ?? [], copy: bundle.copy ?? {} };
}

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
 * @returns {Promise<string[]>} The ids of the modules that reached the output.
 */
async function bundleModules({ folder, entries, stylesheet }) {
  const { build } = await import("vite");
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
          return id === EMPTY_STYLESHEET_MODULE ? "export {};" : null;
        },
        enforce: "post",
        generateBundle: {
          order: "post",
          handler(_options, bundle) {
            for (const file of Object.values(bundle)) {
              if (file.type === "chunk") {
                for (const id of Object.keys(file.modules ?? {})) {
                  moduleIds.add(id);
                }
              }
            }
            const sheet = bundle[`${stylesheet}.css`];
            if (sheet === undefined || sheet.type !== "asset") {
              throw new Error(
                `The bundle has no ${stylesheet}.css to merge the engine's stylesheet into.`,
              );
            }
            sheet.source = `${readFileSync(engineStylesheet, "utf8")}\n${sheet.source}`;
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
              { name: "engine", test: /node_modules[\\/]maplibre-gl[\\/]/ },
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
 * the files that are copied, and `THIRD-PARTY-NOTICES.md` at the package root.
 * The build fails when a package that reached the bundle has a licence that is
 * not on `scripts/sdkLicences.allowlist.json`.
 *
 * @param {object} input
 * @param {string} input.folder The package folder.
 * @param {BundleSettings} input.bundle
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
  const moduleIds = await bundleModules({ folder, entries, stylesheet });
  const require = createRequire(path.join(folder, "package.json"));
  for (const [name, source] of Object.entries(bundle.copy)) {
    const [packageName, ...inside] = source.split("/");
    const scoped = packageName.startsWith("@");
    const installed = path.dirname(
      require.resolve(
        `${scoped ? `${packageName}/${inside.shift()}` : packageName}/package.json`,
      ),
    );
    copyFileSync(
      path.join(installed, ...inside),
      path.join(folder, "dist", name),
    );
  }
  const allowlist = JSON.parse(
    readFileSync(path.join(root, ALLOWLIST_FILE), "utf8"),
  );
  const packages = bundledPackagesOf(moduleIds);
  const failures = judgeBundledPackages(packages, allowlist);
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  writeFileSync(
    path.join(folder, NOTICES_FILE),
    noticesOf(packages, allowlist),
  );
}
