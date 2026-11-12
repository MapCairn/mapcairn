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
});
