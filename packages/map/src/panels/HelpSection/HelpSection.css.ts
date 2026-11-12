// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** The shortcut list, one entry per row. */
export const shortcuts = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  margin: 0,
});

/** One shortcut: the keys, then what they do. */
export const shortcut = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
});

/** The keys to press. */
export const keys = style({
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** What the keys do. */
export const action = style({
  margin: 0,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});
