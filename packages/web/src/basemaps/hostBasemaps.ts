// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  type BasemapDefinition,
  createBasemapCatalogue,
  DEFAULT_BASEMAP_ID,
  getBasemap,
} from "@mapcairn/core";
import { BASEMAP_THUMBNAILS } from "./basemapThumbnails";

/**
 * The ids of the basemaps the reference host offers, in picker order, Bright
 * first. All six come from the SDK (`BASEMAPS` also holds Colorful). Five of
 * them are OpenFreeMap styles and Streets is OpenStreetMap's standard tiles, so
 * the host asks two volunteer-run servers for tiles and its picker stays short.
 * The light basemaps come first, with Fiord and Dark, the two dark ones, last.
 */
export const HOST_BASEMAP_IDS: readonly string[] = [
  "bright",
  "liberty",
  "positron",
  "osm",
  "fiord",
  "dark",
];

/**
 * Picks basemaps by id from the SDK's list, in the order given.
 * @param ids - Ids of basemaps.
 * @returns The definitions themselves, not copies.
 * @throws When an id is not in the SDK's list, so a typo or a removed basemap
 *   fails at start-up instead of quietly shrinking the picker.
 */
export function selectBasemaps(
  ids: readonly string[],
): readonly BasemapDefinition[] {
  return ids.map((id) => {
    const basemap = getBasemap(id);
    if (basemap === undefined) {
      throw new Error(`There is no basemap "${id}" in the SDK.`);
    }
    return basemap;
  });
}

/**
 * Adds the preview the site serves for a basemap, from {@link BASEMAP_THUMBNAILS}.
 * The SDK's definitions name no preview, so this is where a host that serves
 * the files says so.
 * @returns A copy with `thumbnail` set. A test requires the table to name every
 *   basemap the host offers, so none is left without a preview.
 */
function withThumbnail(basemap: BasemapDefinition): BasemapDefinition {
  return { ...basemap, thumbnail: BASEMAP_THUMBNAILS[basemap.id] };
}

/**
 * The catalogue the reference host passes as `Services.basemaps`: the six
 * basemaps in {@link HOST_BASEMAP_IDS}, each with its preview, Bright the
 * default. A saved or linked id the host does not offer (such as `colorful`)
 * opens on Bright.
 */
export const HOST_BASEMAP_CATALOGUE: BasemapCatalogue = createBasemapCatalogue(
  selectBasemaps(HOST_BASEMAP_IDS).map(withThumbnail),
  DEFAULT_BASEMAP_ID,
);
