import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** The scrolling page: the document is fixed for the map, so this scrolls itself. */
export const scroller = style({
  height: "100%",
  overflowY: "auto",
  overscrollBehavior: "contain",
  backgroundColor: tokens.color.pageBackground,
});

/** The reading column. */
export const page = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  maxWidth: "42rem",
  margin: "0 auto",
  padding: `${tokens.space.xl} ${tokens.space.inset}`,
  color: tokens.color.text,
});

/** The page's `h1`, in the title size. */
export const heading = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** Each section's `h2`, one size down from the heading, with a little space above to set the sections apart. */
export const sectionTitle = style({
  margin: 0,
  paddingTop: tokens.space.sm,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** A paragraph of the policy. {@link updated} builds on it. */
export const body = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** The "Last updated" line: a muted paragraph whose date figures keep a fixed width. */
export const updated = style([
  body,
  {
    color: tokens.color.textMuted,
    fontVariantNumeric: "tabular-nums",
  },
]);

/** A standalone link: a full-size target (WCAG 2.5.8), its text centred in it. */
export const link = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
  color: tokens.color.accent,
  textUnderlineOffset: "0.2em",
});
