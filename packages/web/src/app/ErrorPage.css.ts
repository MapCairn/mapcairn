import { tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";

/** Fills the fixed page and centres the message. */
export const page = style({
  display: "grid",
  placeItems: "center",
  height: "100%",
  padding: tokens.space.inset,
  overflowY: "auto",
  backgroundColor: tokens.color.mapBackground,
});

/** The message card: opaque, so it reads the same over any background. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: tokens.space.md,
  maxWidth: "32rem",
  padding: tokens.space.lg,
  borderRadius: tokens.radius.sheet,
  backgroundColor: tokens.color.surfaceRaised,
  boxShadow: tokens.shadow.sheet,
  color: tokens.color.text,
});

export const title = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
});

export const message = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  color: tokens.color.textMuted,
});

export const link = style({
  color: tokens.color.accent,
  textUnderlineOffset: "0.2em",
});
