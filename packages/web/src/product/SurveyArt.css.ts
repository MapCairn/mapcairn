// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import {
  type Crop,
  MEASURE_LABEL,
  NARROW_CROP,
  type Point,
  placeIn,
  SPOT_HEIGHT,
  WIDE_CROP,
} from "./surveyGeometry";

/*
 * The relief strip's inks. Every colour is a token, so the art follows the
 * theme: the survey marks (the cairn, the pin, the measured line) are the logo's
 * blue, which is a graphic colour and never text, the contours are the muted
 * ink and the two labels are the page's text colour. Lines keep their width at
 * any size (`non-scaling-stroke`). Nothing moves. In forced colours every mark
 * is drawn in the system's own colours.
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

/** Below this width the strip is shown enlarged round its marks, so they stay big enough. */
const NARROW = "screen and (max-width: 36rem)";

const FORCED = "(forced-colors: active)";

/** A share as a percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(4)}%`;

/**
 * The strip's frame: the crop's shape in a 1 px neatline, hiding what falls
 * outside it, as the pictures' neatline does. The drawing and the two labels
 * share its one grid cell, so the labels lie over the drawing without being
 * positioned out of flow.
 */
export const frame = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateRows: "minmax(0, 1fr)",
  overflow: "hidden",
  boxSizing: "content-box",
  border: `1px solid ${tokens.color.controlBoundary}`,
  aspectRatio: String(WIDE_CROP.aspect),
  "@media": {
    [NARROW]: {
      aspectRatio: String(NARROW_CROP.aspect),
    },
    [FORCED]: { borderColor: "CanvasText" },
  },
});

/** The drawing: `zoom` times as wide as its frame, offset onto the crop. */
const artSize = (crop: Crop) =>
  ({
    width: percent(crop.zoom),
    marginInlineStart: percent(crop.marginInlineStart),
    marginBlockStart: percent(crop.marginBlockStart),
  }) as const;

/** The whole drawing, enlarged and offset onto the frame's crop. */
export const art = style({
  gridArea: "1 / 1",
  minWidth: 0,
  display: "block",
  height: "auto",
  maxWidth: "none",
  ...artSize(WIDE_CROP),
  "@media": {
    [NARROW]: artSize(NARROW_CROP),
  },
});

const stroke = (width: number) =>
  ({
    fill: "none",
    strokeWidth: width,
    vectorEffect: "non-scaling-stroke",
  }) as const;

/** An ordinary contour. */
export const contour = style({
  ...stroke(HAIR),
  stroke: tokens.color.textMuted,
  strokeOpacity: CONTOUR_OPACITY,
  strokeLinejoin: "round",
  "@media": {
    [FORCED]: { stroke: "CanvasText" },
  },
});

/** An index contour, every fifth. */
export const indexContour = style({
  ...stroke(FINE),
  stroke: tokens.color.textMuted,
  strokeOpacity: INDEX_CONTOUR_OPACITY,
  strokeLinejoin: "round",
  "@media": {
    [FORCED]: { stroke: "CanvasText" },
  },
});

/** The line around each stone, in the halo colour, as the brand mark draws it. */
export const halo = style({
  fill: tokens.color.mapHalo,
  stroke: tokens.color.mapHalo,
  "@media": {
    [FORCED]: { fill: "Canvas", stroke: "Canvas" },
  },
});

/** A stone of the cairn, in the logo's blue. */
export const stone = style({
  fill: tokens.color.mapMeasureLine,
  stroke: tokens.color.mapMeasureLine,
  "@media": {
    [FORCED]: { fill: "CanvasText", stroke: "CanvasText" },
  },
});

/** The pin's body, in the blue of the playground's own pin. */
export const pinBody = style({
  fill: tokens.color.mapPin,
  stroke: tokens.color.mapHalo,
  strokeWidth: BOLD,
  vectorEffect: "non-scaling-stroke",
  "@media": {
    [FORCED]: { fill: "CanvasText", stroke: "Canvas" },
  },
});

/** The dot in the pin's head. */
export const pinDot = style({
  fill: tokens.color.mapHalo,
  "@media": {
    [FORCED]: { fill: "Canvas" },
  },
});

/** The measured line itself. */
export const measureLine = style({
  ...stroke(BOLD),
  stroke: tokens.color.mapMeasureLine,
  strokeDasharray: DASH,
  strokeLinecap: "round",
  "@media": {
    [FORCED]: { stroke: "CanvasText" },
  },
});

/**
 * A label: HTML at the small step, so it is 13 px at every width, in the
 * page's text colour on a plate of the page's own ground, which knocks the
 * contours out behind the figures.
 */
const label = style({
  gridArea: "1 / 1",
  justifySelf: "start",
  alignSelf: "start",
  paddingInline: tokens.space.xxs,
  color: tokens.color.text,
  backgroundColor: tokens.color.pageBackground,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  fontWeight: tokens.type.weight.semibold,
  fontVariantNumeric: "tabular-nums",
  lineHeight: tokens.type.small.lineHeight,
  whiteSpace: "nowrap",
  "@media": {
    [FORCED]: { color: "CanvasText", backgroundColor: "Canvas" },
  },
});

/**
 * Where a label's top start corner goes in a crop's frame, from a point of the
 * sheet and a gap along the inline axis: the start margin is a share of the
 * frame's width, and so is the block margin (a percentage margin always is), so
 * the point's share of the frame's height becomes that share over the frame's
 * `aspect`.
 */
const labelMargins = (crop: Crop, point: Point, gap: string, drop: string) => {
  const { inline, block } = placeIn(crop, point);
  return {
    marginInlineStart: `calc(${percent(inline)} + ${gap})`,
    marginBlockStart: `calc(${percent(block / crop.aspect)} + ${drop})`,
  } as const;
};

/**
 * Beside the cairn: its start edge a small step after the cairn's side, its
 * middle level with the middle of the cairn.
 */
export const spotHeight = style([
  label,
  {
    ...labelMargins(WIDE_CROP, SPOT_HEIGHT.at, tokens.space.xs, "0px"),
    transform: "translateY(-50%)",
    "@media": {
      [NARROW]: labelMargins(
        NARROW_CROP,
        SPOT_HEIGHT.at,
        tokens.space.xs,
        "0px",
      ),
    },
  },
]);

/**
 * The line's length: its top start corner a small step after and below the
 * line's middle. The line rises as it goes on, so it passes above the label
 * at every scale.
 */
export const length = style([
  label,
  {
    ...labelMargins(
      WIDE_CROP,
      MEASURE_LABEL.at,
      tokens.space.sm,
      tokens.space.xxs,
    ),
    "@media": {
      [NARROW]: labelMargins(
        NARROW_CROP,
        MEASURE_LABEL.at,
        tokens.space.sm,
        tokens.space.xxs,
      ),
    },
  },
]);
