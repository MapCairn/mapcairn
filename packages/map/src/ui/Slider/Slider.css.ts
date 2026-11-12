// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** The whole control: header line with label and value, then the slider. */
export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
});

/** Label on the start side, value readout on the end side. */
export const header = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: tokens.space.md,
});

/** The visible label. */
export const label = style({
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** The visible value readout. */
export const value = style({
  color: tokens.color.textMuted,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  fontVariantNumeric: "tabular-nums",
});

/** The Radix slider root. As tall as the minimum target so the track can be tapped anywhere. */
export const control = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: tokens.size.minTarget,
  touchAction: "none",
  userSelect: "none",
  selectors: {
    "&[data-disabled]": { opacity: 0.5 },
  },
});

/**
 * The track. The filled part is a hard-stop gradient driven by `--slider-fill`
 * rather than the absolutely positioned Radix range, so no layout code depends
 * on absolute positioning. The edge is `controlBoundary` for 3:1 contrast.
 */
export const track = style({
  boxSizing: "border-box",
  flex: 1,
  height: tokens.space.xs,
  border: `1px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.pill,
  backgroundColor: tokens.color.surfaceRaised,
  backgroundImage: `linear-gradient(to right, ${tokens.color.accent} var(--slider-fill, 0%), transparent var(--slider-fill, 0%))`,
  forcedColorAdjust: "none",
});

/**
 * The thumb box is the hit area (at least 44px); the visible thumb is the
 * 24px circle inside it, which carries the focus ring.
 */
export const thumb = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: tokens.size.minTarget,
  height: tokens.size.minTarget,
  cursor: "grab",
  selectors: {
    "&:focus-visible": { outline: "none" },
    "&[data-disabled]": { cursor: "not-allowed" },
  },
});

/** The visible thumb circle. */
export const thumbVisual = style({
  display: "block",
  boxSizing: "border-box",
  width: tokens.size.icon,
  height: tokens.size.icon,
  border: `2px solid ${tokens.color.accentContrast}`,
  borderRadius: tokens.radius.round,
  backgroundColor: tokens.color.accent,
  boxShadow: tokens.shadow.floating,
  forcedColorAdjust: "none",
  transitionProperty: "transform",
  transitionDuration: tokens.motion.duration.fast,
  transitionTimingFunction: tokens.motion.easing,
  selectors: {
    [`${thumb}:focus-visible > &`]: focusRing,
  },
  "@media": {
    "(hover: hover)": {
      selectors: {
        [`${thumb}:hover > &`]: { transform: "scale(1.1)" },
      },
    },
  },
});
