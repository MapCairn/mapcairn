// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/** The card: heading, progress, text and a row of buttons, stacked. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  padding: tokens.space.md,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
});

/** The heading takes focus from script, so it rings only for the keyboard. */
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

/** "Step 1 of 3". */
export const progress = style({
  margin: 0,
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontVariantNumeric: "tabular-nums",
});

/** The step's one or two sentences. */
export const text = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** The buttons, wrapping on a narrow card, with the 8 px gap between targets. */
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.sm,
});

/**
 * The control the current step points at. It uses the focus ring itself,
 * because the end stack leaves exactly that ring's room around its buttons.
 */
globalStyle('[data-tour-highlight="true"]', focusRing);
