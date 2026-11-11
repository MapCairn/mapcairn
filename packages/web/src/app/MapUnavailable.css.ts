import { tokens, zLayer } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** Fills the map region's one grid cell, above the empty engine slot, and centres the card. */
export const cell = style({
  gridArea: "1 / 1",
  zIndex: zLayer("mapOverlay"),
  display: "grid",
  placeItems: "center",
  padding: tokens.space.inset,
  overflowY: "auto",
  userSelect: "text",
  WebkitUserSelect: "text",
});

/** The message card: opaque, so it reads the same in either theme. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  maxWidth: "32rem",
  padding: tokens.space.lg,
  borderRadius: tokens.radius.sheet,
  backgroundColor: tokens.color.surfaceRaised,
  boxShadow: tokens.shadow.sheet,
  color: tokens.color.text,
});

/** The message's first line, a paragraph set in the title size and weight. */
export const title = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** The advice under the title, in muted text so the title leads. */
export const message = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  color: tokens.color.textMuted,
});
