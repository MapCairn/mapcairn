import { focusRing, tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";

/** The card body. The sheet or peek that holds it provides the surface. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** Heading and the optional close button. */
export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
});

/** The heading. It is focusable by script only, so a host can move focus here. */
export const heading = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  fontWeight: tokens.type.weight.semibold,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  selectors: { "&:focus-visible": focusRing },
});

/** The coordinates, selectable so they can be copied by hand. */
export const coordinates = style({
  margin: 0,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontVariantNumeric: "tabular-nums",
  userSelect: "text",
  WebkitUserSelect: "text",
  overflowWrap: "anywhere",
});

/** The address line, when there is one. */
export const address = style({
  margin: 0,
  color: tokens.color.textMuted,
  overflowWrap: "anywhere",
});

/** The two buttons. They wrap on a narrow card. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xs,
});

/** The inline result of a copy: an icon and text. */
export const feedback = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.xs,
  margin: 0,
});

/** The icon in front of a successful copy. */
export const feedbackOk = style({ color: tokens.color.accent });

/** The icon in front of a failed copy. */
export const feedbackError = style({ color: tokens.color.danger });
