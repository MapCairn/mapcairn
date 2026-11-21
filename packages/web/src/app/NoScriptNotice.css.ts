// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** Gives the card room from the page's edge; the header it sits in is centred over the page (`mapHeader`). */
export const cell = style({
  padding: tokens.space.inset,
});

/** The message card, opaque like the card for a missing WebGL, so it reads the same in either theme. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  maxWidth: "32rem",
  // The card scrolls on a very short screen, so its shadow is not clipped by a scroller around it.
  maxHeight: `calc(100dvh - 2 * ${tokens.space.inset})`,
  overflowY: "auto",
  padding: tokens.space.lg,
  borderRadius: tokens.radius.sheet,
  backgroundColor: tokens.color.surfaceRaised,
  boxShadow: tokens.shadow.sheet,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
});

/** The sentence that says what is needed, in the title size and weight. */
export const message = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** The links, one a row with room between them. */
export const links = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A link: underlined so colour is not the only cue, and at least a target tall. */
export const link = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
  color: tokens.color.accent,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  textDecoration: "underline",
  borderRadius: tokens.radius.inner,
  selectors: { "&:focus-visible": focusRing },
});
