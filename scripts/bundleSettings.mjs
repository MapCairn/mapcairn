// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import path from "node:path";

/** The file the bundle build writes at the root of the package, and the manifest lists in `files`. */
export const NOTICES_FILE = "THIRD-PARTY-NOTICES.md";

/**
 * @typedef {object} BundleSettings
 * @property {string[]} entries The output names built as a bundle, such as `browser`.
 * @property {Record<string, string>} copy Files copied into `dist` as they are, by their name in `dist` and the path inside an installed package.
 */

/**
 * What a manifest says about its bundle (`mapcairn.bundle`): the entries that
 * are built as one self-contained module graph, and the files that are copied
 * beside them.
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
 * Where a copied file comes from: the installed package and the path inside it.
 *
 * @param {string} source `maplibre-gl/dist/maplibre-gl-worker.mjs`, or the same under a scope (`@scope/name/file.js`).
 * @param {{ resolve: (request: string) => string }} require Resolves a module request from the package that builds the bundle.
 * @returns {{ packageFolder: string, file: string }} The package folder and the file's absolute path.
 * @throws {Error} When the source names no file inside a package.
 */
export function copySourceOf(source, require) {
  const parts = source.split("/");
  const length = parts[0].startsWith("@") ? 2 : 1;
  const inside = parts.slice(length);
  if (parts.length <= length || inside.some((part) => part === "..")) {
    throw new Error(`"${source}" does not name a file inside a package.`);
  }
  const packageName = parts.slice(0, length).join("/");
  const packageFolder = path.dirname(
    require.resolve(`${packageName}/package.json`),
  );
  return { packageFolder, file: path.join(packageFolder, ...inside) };
}
