// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MAP_SHAPE_ATTRIBUTE } from "@mapcairn/core";
import { tokens, zLayer } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

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
    "(scripting: none)": { gridArea: "1 / 1" },
  },
});

/**
 * The page's header. Where scripts do not run it holds the notice that the
 * map needs them, which this centres over the placeholder: header and
 * placeholder share the page's one grid cell, the header on top. Everywhere
 * else it is an ordinary block.
 */
export const mapHeader = style({
  "@media": {
    "(scripting: none)": {
      gridArea: "1 / 1",
      placeSelf: "center",
      zIndex: zLayer("mapOverlay"),
      maxWidth: "100%",
    },
  },
});

globalStyle(`body:has(> ${mapHeader})`, {
  "@media": {
    "(scripting: none)": {
      display: "grid",
      gridTemplate: "minmax(0, 1fr) / minmax(0, 1fr)",
    },
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
