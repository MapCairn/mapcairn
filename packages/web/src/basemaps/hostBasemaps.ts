import {
  type BasemapCatalogue,
  type BasemapDefinition,
  createBasemapCatalogue,
  DEFAULT_BASEMAP_ID,
  getBasemap,
} from "@mapcairn/core";

/**
 * The basemaps the reference host offers, in picker order, Bright first. The
 * SDK defines more (`BASEMAPS` also holds Liberty, Colorful and Fiord); the
 * host offers fewer, so it asks fewer volunteer-run servers for tiles and its
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
 * Picks basemaps from the SDK's list by id, in the order given.
 * @param ids - Ids of built-in basemaps.
 * @returns The SDK's own definitions, not copies.
 * @throws When an id is not in the SDK's list, so a typo or a removed basemap
 *   fails at start-up instead of quietly shrinking the picker.
 */
export function selectBasemaps(
  ids: readonly string[],
): readonly BasemapDefinition[] {
  return ids.map((id) => {
    const basemap = getBasemap(id);
    if (basemap === undefined) {
      throw new Error(`The SDK has no built-in basemap "${id}".`);
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
  selectBasemaps(HOST_BASEMAP_IDS),
  DEFAULT_BASEMAP_ID,
);
