// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// This file imports nothing, so `scripts/generateBasemapThumbnails.mjs` can
// load it with plain Node and render exactly the previews the site serves.

/**
 * The picker preview of each basemap the reference host offers: the
 * root-relative path of an image in `packages/web/public/basemaps`, which the
 * site serves. The SDK's basemap definitions name no preview, because only
 * a host that serves the files can; `hostBasemaps.ts` adds these paths to the
 * definitions it offers, and a basemap with no entry here shows the picker's
 * plain swatch.
 */
export const BASEMAP_THUMBNAILS: Readonly<Record<string, string>> = {
  bright: "/basemaps/bright.jpg",
  positron: "/basemaps/positron.jpg",
  osm: "/basemaps/osm.jpg",
  topographic: "/basemaps/topographic.jpg",
  satellite: "/basemaps/satellite.jpg",
  dark: "/basemaps/dark.jpg",
};
