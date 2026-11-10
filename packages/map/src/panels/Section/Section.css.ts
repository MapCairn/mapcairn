import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** One titled block of the sheet: a heading, then its content, stacked. */
export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  margin: 0,
  padding: 0,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
});

/**
 * The section heading. It takes focus from script when the sheet opens on a
 * section, so it has no focus ring unless the keyboard put focus there.
 */
export const heading = style({
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  selectors: {
    "&:focus-visible": focusRing,
    "&:focus:not(:focus-visible)": { outline: "none" },
  },
});

/** A heading inside a section, one level below it. */
export const subheading = style({
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** A group inside a section, such as Privacy or Keyboard. */
export const subsection = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** Running text. */
export const prose = style({
  margin: 0,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** A short status line with a leading icon. The text is always visible. */
export const note = style({
  display: "flex",
  alignItems: "flex-start",
  gap: tokens.space.xs,
  margin: 0,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The icon at the start of a {@link note}, kept from shrinking. */
export const noteIcon = style({ flexShrink: 0 });

/** An inline link. Always underlined so it never relies on colour alone. */
export const link = style({
  color: tokens.color.accent,
  textDecoration: "underline",
  borderRadius: tokens.radius.inner,
  selectors: { "&:focus-visible": focusRing },
});
