import { style } from "@vanilla-extract/css";

/** The layer list, with the browser's list spacing removed. */
export const layerList = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
});
