// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

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
