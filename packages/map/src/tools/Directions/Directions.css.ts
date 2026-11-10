import { focusRing, mapOverlayTokens, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** A stop's disc on the map. */
export const stopDisc = style({
  fill: tokens.color.accent,
  stroke: mapOverlayTokens.halo,
  strokeWidth: tokens.focus.outerWidth,
});

/** The letter inside a stop's disc, so the stops are told apart without colour. */
export const stopLetter = style({
  fill: tokens.color.accentContrast,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  fontWeight: tokens.type.weight.semibold,
  textAnchor: "middle",
  dominantBaseline: "central",
});

/** The panel: stacked groups with a gap between them. */
export const panel = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** A titled group inside the panel. */
export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  margin: 0,
  padding: 0,
});

/** A group's heading. */
export const groupHeading = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  fontWeight: tokens.type.weight.semibold,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  selectors: { "&:focus-visible": focusRing },
});

/** Quiet explanatory text. */
export const hint = style({
  margin: 0,
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The list of stops. */
export const stopList = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One stop: its letter, its name and its buttons. */
export const stopRow = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.sm,
  minHeight: tokens.size.minTarget,
  borderBottom: `1px solid ${tokens.color.hairline}`,
  selectors: { "&:last-child": { borderBottom: "none" } },
});

/** The letter badge at the start of a stop row. */
export const badge = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: tokens.space.lg,
  height: tokens.space.lg,
  borderRadius: tokens.radius.round,
  background: tokens.color.accent,
  color: tokens.color.accentContrast,
  fontWeight: tokens.type.weight.semibold,
  fontVariantNumeric: "tabular-nums",
});

/** A stop's name or coordinates. It wraps rather than overflow. */
export const stopName = style({
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontVariantNumeric: "tabular-nums",
});

/** A stop's reorder and remove buttons. */
export const stopActions = style({
  display: "flex",
  flexShrink: 0,
  gap: tokens.space.xxs,
});

/** A row of buttons that wraps on a narrow panel. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.sm,
});

/** The place search: a text field and its button. */
export const searchRow = style({
  display: "flex",
  gap: tokens.space.sm,
  alignItems: "stretch",
});

/** The text field of the place search. */
export const searchInput = style({
  flex: 1,
  minWidth: 0,
  minHeight: tokens.size.control,
  boxSizing: "border-box",
  padding: `0 ${tokens.space.md}`,
  border: `1px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.control,
  background: tokens.color.surface,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  selectors: { "&:focus-visible": focusRing },
});

/** The results of a place search, as a list of buttons. */
export const resultList = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** The result card: the figures, then the details. */
export const result = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  padding: tokens.space.md,
  borderRadius: tokens.radius.control,
  background: tokens.color.accentTint,
});

/** The headline figures of a route or area. */
export const figures = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  fontWeight: tokens.type.weight.semibold,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontVariantNumeric: "tabular-nums",
});

/** The legs of a route with more than two stops. */
export const legList = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  margin: 0,
  padding: 0,
  listStyle: "none",
  fontVariantNumeric: "tabular-nums",
});

/** An error or status line with a leading icon. */
export const statusLine = style({
  display: "flex",
  alignItems: "flex-start",
  gap: tokens.space.xs,
  margin: 0,
});

/** The icon of an error line. */
export const errorIcon = style({
  flexShrink: 0,
  color: tokens.color.danger,
});
