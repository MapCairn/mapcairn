// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { keyframes, style } from "@vanilla-extract/css";
import { NARROW_CROP } from "./surveyGeometry";

/*
 * The survey sheet's inks. Every colour is a token, so the art follows the
 * theme; lines keep their width at any size (`non-scaling-stroke`). The one
 * moment of motion is the pin dropping and the measured line appearing after
 * it; the motion tokens shrink to nothing under reduced motion.
 */

/** Line widths, in screen pixels. */
const HAIR = 1;
const FINE = 1.25;
const BOLD = 2;

/** How strongly the contours show: the ordinary ones faint, every fifth firmer. */
const CONTOUR_OPACITY = 0.3;
const INDEX_CONTOUR_OPACITY = 0.6;

/** The measured line's dash, in view box units. */
const DASH = "7 6";

/** Below this width the art is shown cropped round the measured line, so its labels stay legible. */
const NARROW = "screen and (max-width: 36rem)";

/** A share of the frame's width as a percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(4)}%`;

/**
 * The art's frame. On a narrow screen it has the crop's shape and hides what
 * falls outside it (`NARROW_CROP` in `surveyGeometry.ts`).
 */
export const frame = style({
  "@media": {
    [NARROW]: {
      aspectRatio: String(NARROW_CROP.aspect),
      overflow: "hidden",
    },
  },
});

/** The whole drawing: as wide as its frame, or `zoom` times as wide and offset onto the crop on a narrow screen. */
export const art = style({
  display: "block",
  width: "100%",
  height: "auto",
  "@media": {
    [NARROW]: {
      width: percent(NARROW_CROP.zoom),
      maxWidth: "none",
      marginInlineStart: percent(NARROW_CROP.marginInlineStart),
      marginBlockStart: percent(NARROW_CROP.marginBlockStart),
    },
  },
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontVariantNumeric: "tabular-nums",
  overflow: "visible",
});

const stroke = (width: number) =>
  ({
    fill: "none",
    strokeWidth: width,
    vectorEffect: "non-scaling-stroke",
  }) as const;

/** The grid ticks on the sheet's edges. */
export const tick = style({
  ...stroke(HAIR),
  stroke: tokens.color.controlBoundary,
});

/** An ordinary contour. */
export const contour = style({
  ...stroke(HAIR),
  stroke: tokens.color.textMuted,
  strokeOpacity: CONTOUR_OPACITY,
  strokeLinejoin: "round",
});

/** An index contour, every fifth. */
export const indexContour = style({
  ...stroke(FINE),
  stroke: tokens.color.textMuted,
  strokeOpacity: INDEX_CONTOUR_OPACITY,
  strokeLinejoin: "round",
});

/** The frame. */
export const neatline = style({
  ...stroke(FINE),
  stroke: tokens.color.controlBoundary,
});

/** The grid numbers in the collar. */
export const collarText = style({
  fill: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
});

/** A label on the sheet: the spot height, the scale and the north arrow's letter. */
export const label = style({
  fill: tokens.color.text,
  fontSize: tokens.type.small.size,
  fontWeight: tokens.type.weight.semibold,
  paintOrder: "stroke",
  stroke: tokens.color.mapHalo,
  strokeWidth: 3,
  strokeLinejoin: "round",
});

/** The line around each stone, in the halo colour, as the brand mark draws it. */
export const halo = style({
  fill: tokens.color.mapHalo,
  stroke: tokens.color.mapHalo,
});

/** A stone of the cairn. */
export const stone = style({
  fill: tokens.color.accent,
  stroke: tokens.color.accent,
});

const drop = keyframes({
  from: {
    opacity: 0,
    transform: `translateY(calc(-1 * ${tokens.space.lg}))`,
  },
  to: { opacity: 1, transform: "none" },
});

const appear = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

/** The pin, which drops into place once when the page opens. */
export const pin = style({
  transformBox: "fill-box",
  transformOrigin: "center",
  animationName: drop,
  animationDuration: tokens.motion.duration.slow,
  animationTimingFunction: tokens.motion.easing,
  animationFillMode: "both",
});

/** The pin's body. */
export const pinBody = style({
  fill: tokens.color.mapPin,
  stroke: tokens.color.mapHalo,
  strokeWidth: BOLD,
  vectorEffect: "non-scaling-stroke",
});

/** The dot in the pin's head. */
export const pinDot = style({
  fill: tokens.color.mapHalo,
});

/** The measured line and its length, which appear once the pin has landed. */
export const measure = style({
  animationName: appear,
  animationDuration: tokens.motion.duration.slow,
  animationDelay: tokens.motion.duration.slow,
  animationTimingFunction: tokens.motion.easing,
  animationFillMode: "both",
});

/** The measured line itself. */
export const measureLine = style({
  ...stroke(BOLD),
  stroke: tokens.color.mapMeasureLine,
  strokeDasharray: DASH,
  strokeLinecap: "round",
});

/** The measured length. */
export const measureLabel = style([
  label,
  {
    fill: tokens.color.accent,
  },
]);

/** The cross at the map's centre. */
export const crosshair = style({
  ...stroke(FINE),
  stroke: tokens.color.text,
});

/** The filled half of the north arrow, and the dark quarters of the scale bar. */
export const arrowDark = style({
  fill: tokens.color.text,
});

/** The outlined half of the north arrow. */
export const arrowLight = style({
  fill: tokens.color.mapHalo,
  stroke: tokens.color.text,
  strokeWidth: HAIR,
  vectorEffect: "non-scaling-stroke",
});

/** A dark quarter of the scale bar. */
export const barDark = arrowDark;

/** A light quarter of the scale bar. */
export const barLight = arrowLight;
