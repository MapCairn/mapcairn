// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** A labelled control: the visible label, then the control. */
export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** The visible label above a segmented control. */
export const fieldLabel = style({
  margin: 0,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The failed language load: the words, then Try again, wrapping as the room needs. */
export const languageStatus = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xs,
  margin: 0,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The words of the failure, in the danger colour beside their icon. */
export const languageStatusError = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xxs,
  color: tokens.color.danger,
});
