// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The pure parts of the consumer check's headless leg (`checkHeadless` in
 * `consumerCheck.mjs`): an app that lists only `@mapcairn/core` and
 * `@mapcairn/adapter-maplibre`, built from `examples/headless`, which must
 * install without React or the interface packages. Kept apart so unit tests
 * can cover them without an install.
 */

/** The SDK packages the headless app lists, by folder name. */
export const HEADLESS_DIRECT = ["core", "adapter-maplibre"];

/**
 * The packages a headless install must not hold: React, and the SDK packages
 * that build on it or re-export it.
 */
export const HEADLESS_FORBIDDEN = [
  "react",
  "react-dom",
  "@mapcairn/map",
  "@mapcairn/react",
  "@mapcairn/sdk",
];

/** The tool and engine versions the headless app takes from the root lockfile. */
const HEADLESS_TOOLS = ["typescript", "vite"];
const HEADLESS_ENGINE = "maplibre-gl";

/**
 * The headless app's `package.json`: the two packages from their tarballs,
 * the engine, and the build tools. Every packed package is overridden, so the
 * adapter's own dependencies (`core` and `theme`) take the tarballs too.
 *
 * @param {{ tarballs: Record<string, string>, versions: Record<string, string>, published?: string | null }} input
 *   `tarballs` maps a folder name such as `core` to its file in `../tarballs`;
 *   `versions` holds the locked versions of the tools and of `maplibre-gl`.
 *   With `published`, the two packages are that version from the registry
 *   instead, and nothing is overridden.
 * @returns {{ name: string, version: string, private: boolean, type: string, dependencies: Record<string, string>, devDependencies: Record<string, string>, overrides: Record<string, string> }}
 * @throws When a listed package has no tarball or a tool has no version.
 */
export function headlessManifest({ tarballs, versions, published = null }) {
  const file = (/** @type {string} */ name) =>
    `file:../tarballs/${tarballs[name]}`;
  if (published === null) {
    for (const name of HEADLESS_DIRECT) {
      if (tarballs[name] === undefined) {
        throw new Error(
          `There is no tarball for ${name}, so the app cannot list it.`,
        );
      }
    }
  }
  const locked = (/** @type {string} */ name) => {
    const version = versions[name];
    if (version === undefined) {
      throw new Error(`The root lockfile gives no version of ${name}.`);
    }
    return version;
  };
  return {
    name: "mapcairn-throwaway-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: {
      ...Object.fromEntries(
        HEADLESS_DIRECT.map((name) => [
          `@mapcairn/${name}`,
          published ?? file(name),
        ]),
      ),
      [HEADLESS_ENGINE]: locked(HEADLESS_ENGINE),
    },
    devDependencies: Object.fromEntries(
      HEADLESS_TOOLS.map((name) => [name, locked(name)]),
    ),
    overrides: Object.fromEntries(
      Object.keys(tarballs).map((name) => [`@mapcairn/${name}`, file(name)]),
    ),
  };
}

/**
 * What is wrong with an installed tree: each forbidden package it holds, at
 * any depth. The lock's `packages` map is read, not the text of `npm ls`,
 * because a package may declare an optional `react` peer that nothing
 * installed, and that is not an install of React.
 *
 * @param {Record<string, unknown>} packages The `packages` map of the app's `node_modules/.package-lock.json`.
 * @returns {string[]} One line for each forbidden package found.
 */
export function headlessInstallProblems(packages) {
  return Object.keys(packages)
    .filter((key) =>
      HEADLESS_FORBIDDEN.some(
        (name) =>
          key === `node_modules/${name}` ||
          key.endsWith(`/node_modules/${name}`),
      ),
    )
    .map(
      (key) =>
        `the headless install holds ${key}, so the route is not headless`,
    );
}

/** Files of `examples/headless` that the consumer app does not take. */
const APP_EXCLUDED = [
  /^node_modules(?:\/|$)/,
  /^package\.json$/,
  /^vitest\.config\./,
  /\.test\.ts$/,
  /\.md$/,
];

/**
 * Whether a file of `examples/headless` belongs in the consumer app: the page,
 * its sources and its TypeScript settings, but not the example's own manifest
 * (the check writes one), its test setup, its tests or its README.
 *
 * @param {string} file Path from the example's folder, with forward slashes.
 * @returns {boolean}
 */
export function isHeadlessAppFile(file) {
  return !APP_EXCLUDED.some((pattern) => pattern.test(file));
}
