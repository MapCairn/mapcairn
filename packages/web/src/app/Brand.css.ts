// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * The brand mark. Its stones take the accent through `currentColor` and its
 * halo the map halo role, which is the panel's own surface tone, so the halo
 * draws the thin line between stones. It is as tall as the 24 px step of the
 * spacing scale; its width follows the artwork.
 */
export const mark = style({
  display: "block",
  flexShrink: 0,
  height: tokens.space.lg,
  width: "auto",
  color: tokens.color.accent,
});

/** One stone's fill and outline, in the stone colour. */
export const stone = style({
  fill: "currentColor",
  stroke: "currentColor",
});

/** The line that separates a stone from the ones around it. */
export const halo = style({
  fill: tokens.color.mapHalo,
  stroke: tokens.color.mapHalo,
});

/** The brand name, in the interface face. */
export const name = style({
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  color: tokens.color.text,
});
