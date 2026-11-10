import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** The outer box, measured for the edge it publishes. The slot places it. */
export const root = style({
  width: "100%",
  minWidth: 0,
});

/** The toolbar surface: rows of controls and a hint. */
export const toolbar = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  padding: tokens.space.xs,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** A row of controls that wraps on a narrow screen. */
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.xs,
});

/** The mode switch takes the free width on its row. */
export const modes = style({
  flex: "1 1 auto",
  minWidth: 0,
});

/** The running total. Figures keep their width as they change. */
export const readout = style({
  margin: 0,
  paddingInline: tokens.space.xs,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontWeight: tokens.type.weight.semibold,
  fontVariantNumeric: "tabular-nums",
});

/** The icon buttons and Done. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xxs,
});

/** The instruction line. */
export const hint = style({
  margin: 0,
  paddingInline: tokens.space.xs,
  paddingBlockEnd: tokens.space.xxs,
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});
