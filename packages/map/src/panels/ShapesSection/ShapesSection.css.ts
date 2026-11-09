import { tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";

/** The list of shapes: no bullets, rows separated by hairlines inside the rows themselves. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A row of buttons that wraps on a narrow sheet. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
});
