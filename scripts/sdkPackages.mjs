// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The public SDK packages, by folder name under `packages/`, in release and
 * build order: a package comes after every SDK package it depends on. This is
 * the one list; the scripts read it, the tests check the workflows against it,
 * and a test fails when a public workspace is missing from it or a listed one
 * does not exist. Adding a package means adding it here, once, in its place.
 */
export const SDK_PACKAGES = Object.freeze(["core", "react", "theme", "map"]);

/**
 * Packages that are built, cruised and given API reports like the SDK packages
 * but are private and not in the release set yet. They come after every SDK
 * package, because they depend on them. A package moves from here into
 * `SDK_PACKAGES` when it joins the release (the umbrella, `sdk`: issue 541).
 */
export const UNRELEASED_SDK_PACKAGES = Object.freeze(["sdk"]);

/** Every package that builds to `dist`, in build order: the release set, then the unreleased ones. */
export const BUILT_SDK_PACKAGES = Object.freeze([
  ...SDK_PACKAGES,
  ...UNRELEASED_SDK_PACKAGES,
]);
