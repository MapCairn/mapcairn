// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";
import { scrollFade } from "../../chrome/scrollFade.css";

/** The outer box, measured for the edge it publishes. The slot places it. */
export const root = style({
  width: "100%",
  minWidth: 0,
});

/**
 * What the rest of the chrome needs on a screen with the toolbar open, in the
 * same units it is drawn in, so it grows with the text size: the screen inset
 * above and below, the search pill and one end stack button (a control each),
 * the credits button, the three gaps between the rows (search, end stack,
 * credits, toolbar) and the end stack's own padding. Whatever is left over is
 * the most the toolbar can have while the end stack keeps room for one button.
 */
const roomForRestOfChrome = [
  `2 * ${tokens.space.inset}`,
  `2 * ${tokens.size.control}`,
  tokens.size.minTarget,
  `3 * ${tokens.space.sm}`,
  `2 * ${tokens.space.xs}`,
].join(" + ");

/**
 * The toolbar's height cap: half the screen, or less on a screen so short, or
 * text so large, that the end stack would be left without room for a button.
 * Beyond it the toolbar scrolls inside itself, so at large text it never grows
 * over the map and the controls above it. The floor keeps one row of controls
 * showing whatever the screen.
 */
const maxBlockSize = `max(calc(${tokens.size.control} + ${tokens.space.xs} * 2), min(50dvh, calc(100dvh - (${roomForRestOfChrome}))))`;

/**
 * The toolbar surface. It holds the cap and the shadow; the controls scroll in
 * {@link scroller} inside it, because a fade mask on the surface would cut the
 * shadow away.
 */
export const toolbar = style({
  display: "flex",
  flexDirection: "column",
  maxBlockSize,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/**
 * The toolbar's rows, scrolling inside the surface when the cap is reached.
 * The scrollbar is hidden, as the end stack's is, and the fade at the end that
 * has more tells a person to scroll.
 */
export const scroller = style([
  scrollFade,
  {
    display: "flex",
    flexDirection: "column",
    gap: tokens.space.xs,
    padding: tokens.space.xs,
    minBlockSize: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarWidth: "none",
    selectors: {
      "&::-webkit-scrollbar": { display: "none" },
    },
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
  },
]);

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
  flexWrap: "wrap",
  minWidth: 0,
});

// Four options and their check mark have to fit a 320 px screen. An option
// never shrinks below its own word, so at a large text size, or in a longer
// language, the row wraps onto a second line instead of the words overlapping.
globalStyle(`${modes} [role="radio"]`, {
  flex: "1 1 auto",
  minInlineSize: "min-content",
  paddingInline: tokens.space.xs,
  gap: tokens.space.xxs,
});

/**
 * The shape's name, with its measures on the line below. Figures keep their
 * width as they change. The two lines are reserved from the start, so the
 * toolbar, and the bottom slots that ride above it, do not move when the
 * first measure appears, however wide the text is (a measure that cannot
 * wrap beside the name would otherwise drop to a second line of its own).
 */
export const readout = style({
  margin: 0,
  minBlockSize: `calc(${tokens.type.small.size} * ${tokens.type.small.lineHeight} + ${tokens.type.large.size} * ${tokens.type.large.lineHeight})`,
  "@media": {
    "(max-height: 520px) and (min-width: 640px)": { gridColumn: 1, gridRow: 2 },
  },
  paddingInline: tokens.space.xs,
  display: "flex",
  flexDirection: "column",
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
