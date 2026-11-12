import {
  type BasemapCatalogue,
  type BasemapDefinition,
  createBasemapCatalogue,
  DEFAULT_BASEMAP_ID,
  getBasemap,
} from "@mapcairn/core";
import { BASEMAP_THUMBNAILS } from "./basemapThumbnails";
import { OPEN_TOPO_MAP_BASEMAP } from "./openTopoMapBasemap";
import { SATELLITE_BASEMAP } from "./satelliteBasemap";

/**
 * The basemaps the host defines itself, which the SDK does not ship. Topographic
 * is here because OpenTopoMap is a volunteer-run server whose terms ask for
 * light use and a note about it: the host takes that on, and the SDK does not
 * send every app built on it there. Satellite is here because its imagery's
 * licence is non-commercial, which the SDK must never carry.
 */
export const HOST_OWN_BASEMAPS: readonly BasemapDefinition[] = [
  OPEN_TOPO_MAP_BASEMAP,
  SATELLITE_BASEMAP,
];

/**
 * The ids of the basemaps the reference host offers, in picker order, Bright
 * first. Four come from the SDK (`BASEMAPS` also holds Liberty, Colorful and
 * Fiord), and Topographic and Satellite from {@link HOST_OWN_BASEMAPS}. Six
 * fill the picker's two rows of three. The host offers fewer
 * than the SDK holds, so it asks fewer volunteer-run servers for tiles and its
 * picker stays short.
 */
export const HOST_BASEMAP_IDS: readonly string[] = [
  "bright",
  "positron",
  "osm",
  "topographic",
  "satellite",
  "dark",
];

/**
 * Picks basemaps by id, in the order given, from the host's own definitions
 * first and then from the SDK's list.
 * @param ids - Ids of basemaps.
 * @param own - Definitions the host owns, taken in preference to the SDK's.
 * @returns The definitions themselves, not copies.
 * @throws When an id is in neither list, so a typo or a removed basemap fails
 *   at start-up instead of quietly shrinking the picker.
 */
export function selectBasemaps(
  ids: readonly string[],
  own: readonly BasemapDefinition[] = [],
): readonly BasemapDefinition[] {
  return ids.map((id) => {
    const basemap =
      own.find((candidate) => candidate.id === id) ?? getBasemap(id);
    if (basemap === undefined) {
      throw new Error(`There is no basemap "${id}", in the host or the SDK.`);
    }
    return basemap;
  });
}

/**
 * Adds the preview the site serves for a basemap, from {@link BASEMAP_THUMBNAILS}.
 * The SDK's definitions name no preview, so this is where a host that serves
 * the files says so.
 * @returns A copy with `thumbnail` set, or the definition itself when the site
 *   serves no preview for it.
 */
function withThumbnail(basemap: BasemapDefinition): BasemapDefinition {
  const thumbnail = BASEMAP_THUMBNAILS[basemap.id];
  return thumbnail === undefined ? basemap : { ...basemap, thumbnail };
}

/**
 * The catalogue the reference host passes as `Services.basemaps`: the six
 * basemaps in {@link HOST_BASEMAP_IDS}, each with its preview, Bright the
 * default. A saved or linked id the host does not offer (such as `liberty`)
 * opens on Bright.
 */
export const HOST_BASEMAP_CATALOGUE: BasemapCatalogue = createBasemapCatalogue(
  selectBasemaps(HOST_BASEMAP_IDS, HOST_OWN_BASEMAPS).map(withThumbnail),
  DEFAULT_BASEMAP_ID,
);
