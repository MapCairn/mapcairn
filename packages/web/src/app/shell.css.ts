// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MAP_SHAPE_ATTRIBUTE } from "@mapcairn/core";
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * The server-rendered stand-in for the map: the map's own background colour,
 * filling the page, so nothing shifts or flashes when the map mounts. When
 * the pre-paint script has found a stored globe, it is the colour of the
 * space around the globe instead, as the map region will be.
 */
export const mapPlaceholder = style({
  display: "block",
  width: "100%",
  height: "100%",
  backgroundColor: tokens.color.mapBackground,
  selectors: {
    [`:root[${MAP_SHAPE_ATTRIBUTE}="globe"] &`]: {
      backgroundColor: tokens.color.mapGlobeSpace,
    },
  },
  "@media": {
    // The notice that the map needs scripts sits in the middle of the placeholder.
    "(scripting: none)": { display: "grid", placeItems: "center" },
  },
});

/**
 * Wraps the map view. It takes no box while the map is drawn, whose chrome has
 * the page's `main`. When the interface cannot load there is no chrome, so the
 * wrapper is made the `main` and fills the page as the map would.
 */
export const mapFrame = style({
  display: "contents",
  selectors: {
    '&[role="main"]': { display: "block", width: "100%", height: "100%" },
  },
});

/**
 * Wraps the placeholder's loading text and decorative chrome. It takes no box
 * of its own, so the skeleton lays out as if it were the placeholder's child.
 * Where scripts do not run the map never loads and the controls never come
 * alive, so neither the text nor the controls are drawn.
 */
export const placeholderChrome = style({
  display: "contents",
  "@media": {
    "(scripting: none)": { display: "none" },
  },
});

/**
 * Hides the skip link where scripts do not run: it leads to a map that will
 * not start. The doubled class outranks the link's own rules whatever order
 * the stylesheets load in.
 */
export const hiddenWithoutScripts = style({
  "@media": {
    "(scripting: none)": {
      selectors: { "&&": { display: "none" } },
    },
  },
});
