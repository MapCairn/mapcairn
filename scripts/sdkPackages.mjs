// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The public SDK packages, by folder name under `packages/`, in release and
 * build order: a package comes after every SDK package it depends on. This is
 * the one list; the scripts read it, the tests check the workflows against it,
 * and a test fails when a public workspace is missing from it or a listed one
 * does not exist. Adding a package means adding it here, once, in its place.
 */
export const SDK_PACKAGES = ["core", "react", "theme", "map"];
