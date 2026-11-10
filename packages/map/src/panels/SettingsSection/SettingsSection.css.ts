import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** A labelled control: the visible label, then the control. */
export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** The visible label above a segmented control. */
export const fieldLabel = style({
  margin: 0,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});
