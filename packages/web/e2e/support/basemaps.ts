/*
 * The basemaps the suite names. Specs use these constants and never spell a
 * basemap id or name themselves, so a change to the built-in basemaps is a
 * change to this file only.
 */

/** The raster basemap: OpenStreetMap tiles drawn as a raster style in MapLibre. */
export const RASTER_BASEMAP_ID = "osm";

/** Its name in the basemap picker and in announcements. */
export const RASTER_BASEMAP_NAME = "Streets";

/** Matches its provider credit (the first link in the credits, before "MapLibre"). */
export const RASTER_BASEMAP_CREDIT = /OpenStreetMap/;

/** The default vector basemap, which "Auto" shows in a light theme. */
export const DEFAULT_VECTOR_BASEMAP_ID = "positron";

/** Another light vector basemap, for choosing one explicitly. */
export const OTHER_VECTOR_BASEMAP_ID = "liberty";

/** Its name in the picker. */
export const OTHER_VECTOR_BASEMAP_NAME = "Liberty";

/** The dark vector basemap, which "Auto" shows in a dark theme. */
export const DARK_VECTOR_BASEMAP_NAME = "Dark";

/** How many basemaps the picker offers. */
export const BASEMAP_COUNT = 4;
