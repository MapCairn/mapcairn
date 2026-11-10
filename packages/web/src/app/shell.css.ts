import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * The server-rendered stand-in for the map: the map's own background colour,
 * filling the page, so nothing shifts or flashes when the map mounts.
 */
export const mapPlaceholder = style({
  display: "block",
  width: "100%",
  height: "100%",
  backgroundColor: tokens.color.mapBackground,
});
