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

/** The default basemap, in both interface themes. */
export const DEFAULT_VECTOR_BASEMAP_ID = "bright";

/** Its name in the picker. */
export const DEFAULT_VECTOR_BASEMAP_NAME = "Bright";

/**
 * The default basemap's land colour as computed CSS, which the map region
 * shows before the map draws, in both themes.
 */
export const DEFAULT_VECTOR_BASEMAP_BACKGROUND = "rgb(248, 244, 240)";

/**
 * Liberty, the default before Bright. It stays in the picker, a saved or
 * linked "liberty" still opens on it, and its style lists a shaded-relief
 * layer to leave out in Save data mode, which Bright does not.
 */
export const LIBERTY_BASEMAP_ID = "liberty";

/** Its name in the picker. */
export const LIBERTY_BASEMAP_NAME = "Liberty";

/** Another light vector basemap, for choosing one explicitly. */
export const OTHER_VECTOR_BASEMAP_ID = "positron";

/** Its name in the picker. */
export const OTHER_VECTOR_BASEMAP_NAME = "Positron";

/**
 * The id of Maptoolkit Dark, which has been removed. A saved or linked value
 * from an earlier visit must open on the default basemap.
 */
export const REMOVED_MAPTOOLKIT_BASEMAP_ID = "maptoolkit-dark";

/** VersaTiles Colorful, a light vector basemap from another provider than OpenFreeMap. */
export const COLORFUL_BASEMAP_ID = "colorful";

/** Its name in the picker. */
export const COLORFUL_BASEMAP_NAME = "Colorful";

/** The dark basemap, OpenFreeMap Fiord, which is in the SDK's built-in set. */
export const DARK_VECTOR_BASEMAP_ID = "fiord";

/** Its name in the picker. */
export const DARK_VECTOR_BASEMAP_NAME = "Fiord";

/** OpenFreeMap Dark, the second dark basemap. A saved or linked "dark" opens on it. */
export const NEUTRAL_DARK_BASEMAP_ID = "dark";

/** Its name in the picker. */
export const NEUTRAL_DARK_BASEMAP_NAME = "Dark";

/** How many basemaps the picker offers. */
export const BASEMAP_COUNT = 7;

/** The picker's columns. */
export const BASEMAP_COLUMNS = 3;

/** The picker's rows: the last one may be short. */
export const BASEMAP_ROWS = Math.ceil(BASEMAP_COUNT / BASEMAP_COLUMNS);
