// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** The waiting line: an icon and a few words, on a floating surface, as wide as its words. */
export const line = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.sm,
  paddingBlock: tokens.space.xs,
  paddingInline: tokens.space.md,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  color: tokens.color.text,
  overflowWrap: "anywhere",
});

/** The hourglass, in the accent colour as the status icons are. */
export const icon = style({
  flexShrink: 0,
  color: tokens.color.accent,
});
