import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** A centred block for a list or panel that has nothing to show yet. */
export const emptyState = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: tokens.space.sm,
  padding: tokens.space.lg,
  textAlign: "center",
  color: tokens.color.text,
  fontFamily: tokens.type.family,
});

/** The icon above the heading. */
export const emptyIcon = style({ color: tokens.color.textMuted });

/** The heading. Its level is the caller's choice; its look is fixed. */
export const heading = style({
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
});

/** The explanation under the heading. */
export const body = style({
  margin: 0,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** Space above the optional action. */
export const action = style({ marginBlockStart: tokens.space.xs });
