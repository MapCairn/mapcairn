// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

/** The default basemap in the light theme, for a visitor who never chose one. */
export const DEFAULT_VECTOR_BASEMAP_ID = "bright";

/** Its name in the picker. */
export const DEFAULT_VECTOR_BASEMAP_NAME = "Bright";

/**
 * The light default basemap's land colour as computed CSS, which the map
 * region shows before the map draws, in the light theme.
 */
export const DEFAULT_VECTOR_BASEMAP_BACKGROUND = "rgb(248, 244, 240)";

/**
 * Liberty, the default before Bright.
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

/** VersaTiles Colorful, which the SDK defines and the site does not offer. */
export const COLORFUL_BASEMAP_ID = "colorful";

/** OpenFreeMap Fiord, a dark basemap and the default in the dark theme. */
export const FIORD_BASEMAP_ID = "fiord";

/** Its name in the picker. */
export const FIORD_BASEMAP_NAME = "Fiord";

/**
 * Fiord's land colour as computed CSS, which the map region shows before the
 * map draws, in the dark theme.
 */
export const FIORD_BASEMAP_BACKGROUND = "rgb(69, 81, 110)";

/**
 * The ids of Topographic and Satellite, which the site no longer offers and
 * the SDK never defined. A saved or linked one opens on the default basemap.
 */
export const REMOVED_HOST_BASEMAP_IDS: readonly string[] = [
  "topographic",
  "satellite",
];

/**
 * The basemaps the site does not offer: Colorful, which the SDK defines, and
 * the two it removed. A saved or linked one opens on the default basemap.
 */
export const UNOFFERED_BASEMAP_IDS: readonly string[] = [
  COLORFUL_BASEMAP_ID,
  ...REMOVED_HOST_BASEMAP_IDS,
];

/** OpenFreeMap Dark, the dark basemap. A saved or linked "dark" opens on it. */
export const DARK_BASEMAP_ID = "dark";

/** Its name in the picker. */
export const DARK_BASEMAP_NAME = "Dark";

/** The id of every basemap the site's picker offers, in picker order. */
export const OFFERED_BASEMAP_IDS: readonly string[] = [
  DEFAULT_VECTOR_BASEMAP_ID,
  LIBERTY_BASEMAP_ID,
  OTHER_VECTOR_BASEMAP_ID,
  RASTER_BASEMAP_ID,
  FIORD_BASEMAP_ID,
  DARK_BASEMAP_ID,
];

/** How many basemaps the site's picker offers. */
export const BASEMAP_COUNT = 6;

/** The picker's columns. */
export const BASEMAP_COLUMNS = 3;

/** The picker's rows. */
export const BASEMAP_ROWS = Math.ceil(BASEMAP_COUNT / BASEMAP_COLUMNS);

/** How many tiles sit in the picker's last row: a full row of three, with six basemaps. */
export const BASEMAP_LAST_ROW_COUNT =
  BASEMAP_COUNT - BASEMAP_COLUMNS * (BASEMAP_ROWS - 1);
