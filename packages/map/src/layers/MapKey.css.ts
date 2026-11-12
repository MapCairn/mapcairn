// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import { chromeVar, chromeVars } from "../chrome/MapChrome/chromeVars";

const small = {
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
} as const;

/**
 * The panel: a floating surface that is as wide as its widest row, up to the
 * width of the tour card, and as tall as `MapChrome` says there is room for.
 * The header stays put and the blocks scroll under it.
 */
export const panel = style({
  display: "flex",
  flexDirection: "column",
  maxWidth: `calc(${tokens.space.xl} * 10)`,
  maxHeight: chromeVar(chromeVars.mapKeyRoom, "none"),
  fontFamily: tokens.type.family,
});

/** The heading and the toggle, on one row. */
export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  paddingInlineStart: tokens.space.md,
  selectors: {
    '[data-minimised="true"] > &': { paddingInlineStart: 0 },
  },
});

/** The visible heading of the open key. */
export const heading = style({
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
  ...small,
});

/**
 * The one button that minimises and restores the key. Open, it is a square
 * icon; minimised, it grows into the chip with the strip of glyphs and the
 * count. Either way it is at least the minimum target size.
 */
export const toggle = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  minWidth: tokens.size.minTarget,
  minHeight: tokens.size.minTarget,
  margin: 0,
  padding: 0,
  border: "none",
  borderRadius: tokens.radius.pill,
  backgroundColor: "transparent",
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.semibold,
  cursor: "pointer",
  ...small,
  selectors: {
    '&[aria-expanded="false"]': { paddingInline: tokens.space.md },
    "&:focus-visible": focusRing,
  },
  "@media": {
    "(hover: hover)": {
      selectors: { "&:hover": { backgroundColor: tokens.color.hairline } },
    },
  },
});

/**
 * The first glyph of each layer's key, side by side. Each glyph's picture has
 * room around the marker, so the gap is small.
 */
export const strip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xxs,
});

/** "Key, 3 layers", on one line so the chip stays as narrow as it can be. */
export const chipText = style({
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

/**
 * What scrolls inside the panel. It has a tab stop, with the focus ring, only
 * while its content is taller than it is, so the keyboard can scroll it.
 */
export const body = style({
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: `0 ${tokens.space.md} ${tokens.space.md}`,
  selectors: { "&:focus-visible": focusRing },
});

/** The blocks, one under another. */
export const blocks = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
});

/** One layer: its name, the time it shows if it has one, and its rows. */
export const block = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** A layer's name. */
export const layerName = style({
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
  ...small,
});

/** The day or time a layer shows, in words. */
export const when = style({
  margin: 0,
  color: tokens.color.textMuted,
  ...small,
  fontVariantNumeric: "tabular-nums",
});
