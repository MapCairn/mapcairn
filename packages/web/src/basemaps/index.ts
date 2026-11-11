import {
  type BasemapCatalogue,
  BUILT_IN_BASEMAP_CATALOGUE,
} from "@mapcairn/core";

/**
 * The basemaps the reference host offers: the SDK's built-in basemaps (Bright,
 * Liberty, Positron, Streets and Fiord), with Bright the default. An id that
 * names none of them (the removed "dark", the retired "auto" and
 * "maptoolkit-dark") opens on Bright. The composition root passes this as
 * `Services.basemaps`. A basemap added here instead of in the SDK would need
 * the host's own review of its provider's terms, its origins in the Content
 * Security Policy, and its credit in `ATTRIBUTIONS.md` and the privacy page.
 */
export const BASEMAP_CATALOGUE: BasemapCatalogue = BUILT_IN_BASEMAP_CATALOGUE;
