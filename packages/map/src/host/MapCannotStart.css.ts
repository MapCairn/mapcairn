// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, mapOverlayTokens, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** Takes the map's place, in the map's background colour, and centres the notice. */
export const root = style({
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  padding: tokens.space.md,
  overflowY: "auto",
  backgroundColor: mapOverlayTokens.background,
  selectors: { "&:focus-visible": focusRing },
});

/** The notice: opaque, so it reads the same in either theme. */
export const notice = style({
  boxSizing: "border-box",
  maxWidth: "32rem",
  margin: 0,
  padding: tokens.space.lg,
  borderRadius: tokens.radius.sheet,
  backgroundColor: tokens.color.surfaceRaised,
  boxShadow: tokens.shadow.sheet,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
});
