import { tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";

/** The sections, stacked with room between them. */
export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xl,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
});
