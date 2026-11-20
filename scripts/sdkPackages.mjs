// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The public SDK packages, by folder name under `packages/`, in release and
 * build order: a package comes after every SDK package it depends on. This is
 * the one list; the scripts read it, the tests check the workflows against it,
 * and a test fails when a public workspace is missing from it or a listed one
 * does not exist. Adding a package means adding it here, once, in its place.
 */
export const SDK_PACKAGES = Object.freeze([
  "core",
  "react",
  "theme",
  "map",
  "adapter-maplibre",
  "sdk",
]);

/**
 * The umbrella package, which re-exports every other SDK package so an app
 * installs one name (the MapLibre adapter at the subpath
 * `@mapcairn/sdk/adapter-maplibre`, the others at its root). It is the last of `SDK_PACKAGES`, and the consumer check
 * tests an app that lists only it.
 */
export const UMBRELLA_PACKAGE = "sdk";

/**
 * The SDK packages the umbrella re-exports at a subpath of its own
 * (`@mapcairn/sdk/<name>`) and not at its root, because they need a peer the
 * root must stay free of: the MapLibre adapter needs the map engine.
 */
export const SUBPATH_ONLY_PACKAGES = Object.freeze(["adapter-maplibre"]);

/**
 * Packages that are built, cruised and given API reports like the SDK packages
 * but are private and not in the release set yet. They come after every SDK
 * package, because they depend on them. A package moves from here into
 * `SDK_PACKAGES` when it joins the release. None at present: the umbrella,
 * `sdk`, joined the release after `0.1.0-rc.2`, and the MapLibre adapter joins
 * it with the release after that.
 */
export const UNRELEASED_SDK_PACKAGES = Object.freeze([]);

/** Every package that builds to `dist`, in build order: the release set, then the unreleased ones. */
export const BUILT_SDK_PACKAGES = Object.freeze([
  ...SDK_PACKAGES,
  ...UNRELEASED_SDK_PACKAGES,
]);
