import {
  type BasemapCatalogue,
  type BasemapDefinition,
  createBasemapCatalogue,
  DEFAULT_BASEMAP_ID,
  getBasemap,
} from "@mapcairn/core";
import { OPEN_TOPO_MAP_BASEMAP } from "./openTopoMapBasemap";

/**
 * The basemaps the host defines itself, which the SDK does not ship. Topographic
 * is here because OpenTopoMap is a volunteer-run server whose terms ask for
 * light use and a note about it: the host takes that on, and the SDK does not
 * send every app built on it there.
 */
export const HOST_OWN_BASEMAPS: readonly BasemapDefinition[] = [
  OPEN_TOPO_MAP_BASEMAP,
];

/**
 * The ids of the basemaps the reference host offers, in picker order, Bright
 * first. Four come from the SDK (`BASEMAPS` also holds Liberty, Colorful and
 * Fiord) and Topographic from {@link HOST_OWN_BASEMAPS}; the host offers fewer
 * than the SDK holds, so it asks fewer volunteer-run servers for tiles and its
 * picker stays short.
 */
export const HOST_BASEMAP_IDS: readonly string[] = [
  "bright",
  "positron",
  "osm",
  "topographic",
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
 * The catalogue the reference host passes as `Services.basemaps`: the five
 * basemaps in {@link HOST_BASEMAP_IDS}, Bright the default. A saved or linked
 * id the host does not offer (such as `liberty`) opens on Bright.
 */
export const HOST_BASEMAP_CATALOGUE: BasemapCatalogue = createBasemapCatalogue(
  selectBasemaps(HOST_BASEMAP_IDS, HOST_OWN_BASEMAPS),
  DEFAULT_BASEMAP_ID,
);
