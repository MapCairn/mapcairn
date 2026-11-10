import { focusRing, surfaceBlurStyle, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * The credit's content: the logo and the lines on one row that wraps, flush
 * to the end edge, so a narrow screen or a side panel beside it stacks them
 * rather than overflowing.
 */
export const root = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  columnGap: tokens.space.sm,
  rowGap: tokens.space.xs,
});

/**
 * The logo's link, which is also its chip. The provider draws the logo
 * white, so it sits on the scrim colour laid down twice (a dark translucent
 * layer, about two thirds opaque in the light theme), which keeps it above
 * 4.5:1 over any pale map or the pale placeholder before the map draws.
 * The `surface` colour cannot do this: in the light theme it is near white.
 * The link is a full touch target tall (the logo inside keeps the provider's
 * least height), so the row is that tall too, and the hit area is real
 * layout, not an overlap that could cover a neighbour. The focus ring
 * follows the link's own box.
 */
export const logoLink = style({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  minHeight: tokens.size.minTarget,
  paddingInline: tokens.space.xs,
  borderRadius: tokens.radius.inner,
  backgroundImage: [
    `linear-gradient(${tokens.color.scrim}, ${tokens.color.scrim})`,
    `linear-gradient(${tokens.color.scrim}, ${tokens.color.scrim})`,
  ].join(", "),
  selectors: { "&:focus-visible": focusRing },
});

/**
 * The provider's logo, unchanged in colour and at the height the provider
 * asks for (a `height` attribute, because production CSP allows no inline
 * style). Width follows the height and the image's own proportions, and never
 * shrinks.
 */
export const logo = style({
  display: "block",
  width: "auto",
  maxWidth: "none",
  flexShrink: 0,
});

/** The credit lines, on a chrome surface so their text has its theme contrast. */
export const lines = style({
  ...surfaceBlurStyle,
  display: "flex",
  flexWrap: "wrap",
  columnGap: tokens.space.xs,
  margin: 0,
  paddingInline: tokens.space.sm,
  borderRadius: tokens.radius.inner,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontWeight: tokens.type.weight.regular,
});

/**
 * One credit line, linked or not. Each is a full touch target tall, so a link
 * is never a thin strip of text, and the chip around them is that tall too.
 */
export const line = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
});

/** A credit link: underlined, so it is not told apart by colour alone. */
export const link = style({
  color: tokens.color.accent,
  textDecorationLine: "underline",
  borderRadius: tokens.radius.inner,
  selectors: { "&:focus-visible": focusRing },
});
