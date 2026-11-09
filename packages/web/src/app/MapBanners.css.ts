import { tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";

/** Banners stack in flow, newest last, with the standard gap. */
export const stack = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  selectors: {
    "&:empty": {
      display: "none",
    },
  },
});

/** The bottom-centre slot's contents: the measure toolbar above the banners. */
export const bottomCentre = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: tokens.space.xs,
});
