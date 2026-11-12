// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/** The outer box, measured for the edge it publishes. The slot places it. */
export const root = style({
  width: "100%",
  minWidth: 0,
});

/** The toolbar surface: rows of controls, a readout and a hint. */
export const toolbar = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  padding: tokens.space.xs,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  "@media": {
    // A landscape phone has width to spare and little height, so the shape
    // switch and its readout sit beside the buttons.
    "(max-height: 520px) and (min-width: 640px)": {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      columnGap: tokens.space.sm,
      alignItems: "center",
    },
  },
});

/** The shape switch row. On a landscape phone it takes the first column. */
export const modesRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xs,
  "@media": {
    "(max-height: 520px) and (min-width: 640px)": { gridColumn: 1, gridRow: 1 },
  },
});

/** The buttons row. On a landscape phone it takes the second column, beside the shape switch. */
export const actionsRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.xs,
  "@media": {
    "(max-height: 520px) and (min-width: 640px)": {
      gridColumn: 2,
      gridRow: "1 / span 2",
      flexWrap: "nowrap",
    },
  },
});

/** The mode switch takes the free width of its row. */
export const modes = style({
  flex: "1 1 auto",
  minWidth: 0,
});

// Four options and their check mark have to fit a 320 px screen.
globalStyle(`${modes} [role="radio"]`, {
  flex: "1 1 auto",
  paddingInline: tokens.space.xs,
  gap: tokens.space.xxs,
});

/** The shape's name, then its measures. Figures keep their width as they change. */
export const readout = style({
  margin: 0,
  "@media": {
    "(max-height: 520px) and (min-width: 640px)": { gridColumn: 1, gridRow: 2 },
  },
  paddingInline: tokens.space.xs,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: tokens.space.xs,
  fontVariantNumeric: "tabular-nums",
});

/** The shape's name. */
export const status = style({
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The measures of the shape, larger than its name. */
export const measure = style({
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** The icon buttons, and the primary button at the end. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xxs,
});

/** The group of controls for the selected shape. */
export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  margin: 0,
  minWidth: 0,
  padding: 0,
  paddingBlockStart: tokens.space.xs,
  border: 0,
  borderBlockStart: `1px solid ${tokens.color.hairline}`,
  "@media": {
    "(max-height: 520px) and (min-width: 640px)": { gridColumn: "1 / -1" },
  },
});

/** The name of the group: which shape and which point. */
export const groupLabel = style({
  margin: 0,
  padding: 0,
  paddingInline: tokens.space.xs,
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** What is wrong with the selected shape, with an icon so it never rests on colour. */
export const issue = style({
  "@media": {
    "(max-height: 520px) and (min-width: 640px)": { gridColumn: 1 },
  },
  display: "flex",
  alignItems: "flex-start",
  gap: tokens.space.xs,
  margin: 0,
  paddingInline: tokens.space.xs,
  color: tokens.color.danger,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The instruction line. It gives way on a short screen, where the toolbar must stay small. */
export const hint = style({
  margin: 0,
  paddingInline: tokens.space.xs,
  paddingBlockEnd: tokens.space.xxs,
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  "@media": {
    "(max-height: 640px)": { display: "none" },
  },
});
