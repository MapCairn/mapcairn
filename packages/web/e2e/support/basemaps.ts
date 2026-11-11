/*
 * The basemaps the suite names. Specs use these constants and never spell a
 * basemap id or name themselves, so a change to the basemaps the site offers is a
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
 * Liberty, the default before Bright. The SDK defines it and the site does not
 * offer it, so a saved or linked "liberty" opens on the default. Its style
 * lists a shaded-relief layer to leave out in Save data mode, which no basemap
 * the site offers does, so the Save data specs reach it through a host that
 * offers the SDK's whole list (`scriptBasemaps`).
 */
export const LIBERTY_BASEMAP_ID = "liberty";

/** Its name in the picker of a host that offers it. */
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

/** VersaTiles Colorful, which the SDK defines and the site does not offer. */
export const COLORFUL_BASEMAP_ID = "colorful";

/** OpenFreeMap Fiord, which the SDK defines and the site does not offer. */
export const FIORD_BASEMAP_ID = "fiord";

/**
 * The SDK's basemaps that the site does not offer. A saved or linked one
 * opens on the default basemap.
 */
export const UNOFFERED_BASEMAP_IDS: readonly string[] = [
  LIBERTY_BASEMAP_ID,
  COLORFUL_BASEMAP_ID,
  FIORD_BASEMAP_ID,
];

/** OpenFreeMap Dark, the dark basemap. A saved or linked "dark" opens on it. */
export const DARK_BASEMAP_ID = "dark";

/** Its name in the picker. */
export const DARK_BASEMAP_NAME = "Dark";

/** CyclOSM, a second raster basemap, from a different host than OpenStreetMap's own. */
export const TOPOGRAPHIC_BASEMAP_ID = "topographic";

/** Its name in the picker. */
export const TOPOGRAPHIC_BASEMAP_NAME = "Topographic";

/** How many basemaps the site's picker offers. */
export const BASEMAP_COUNT = 5;

/** The picker's columns. */
export const BASEMAP_COLUMNS = 3;

/** The picker's rows: the last one is short. */
export const BASEMAP_ROWS = Math.ceil(BASEMAP_COUNT / BASEMAP_COLUMNS);

/** How many tiles sit in the picker's last, short row. */
export const BASEMAP_LAST_ROW_COUNT =
  BASEMAP_COUNT - BASEMAP_COLUMNS * (BASEMAP_ROWS - 1);
