import {
  BASEMAPS,
  type BasemapCatalogue,
  createBasemapCatalogue,
  DEFAULT_BASEMAP_ID,
} from "@mapcairn/core";
import { MAPTOOLKIT_DARK } from "./maptoolkit";

export { MAPTOOLKIT_DARK, MAPTOOLKIT_DARK_ID } from "./maptoolkit";

/**
 * The basemaps the reference host offers: the SDK's built-in basemaps, then
 * Maptoolkit Dark, whose licence the host accepts. Liberty stays the default,
 * and an id that names none of them (the removed "dark", the retired "auto")
 * still opens on Liberty. The composition root passes this as
 * `Services.basemaps`.
 */
export const BASEMAP_CATALOGUE: BasemapCatalogue = createBasemapCatalogue(
  [...BASEMAPS, MAPTOOLKIT_DARK],
  DEFAULT_BASEMAP_ID,
);
