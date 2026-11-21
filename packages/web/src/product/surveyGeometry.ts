// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  formatDistance,
  formatNumber,
} from "@mapcairn/core";
import { STONES } from "../app/cairnStones";
import { CONTOUR_VIEW_BOX, SUMMIT } from "./contours";

/*
 * Where every mark of the product page's relief strip goes, worked out once
 * from a few constants, so the marks agree by construction: the measured line
 * starts at the pin's tip and ends at the cairn's foot, and its label is its
 * own length on the sheet's scale. `SurveyArt.tsx` draws only what this module
 * returns, its stylesheet places the two text labels with the same numbers,
 * the link preview image reuses the pin, the cairn and the grid, and
 * `surveyGeometry.test.ts` checks the relations. The drawing holds no text:
 * the two labels are HTML at a fixed size, set beside the marks they name, so
 * they never shrink with the drawing.
 */

/** A point in the sheet's view box. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box in the sheet's view box. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The size of the sheet, in view box units. */
export const SHEET = CONTOUR_VIEW_BOX;

/** The language the page's figures are written in. */
export const LANGUAGE = "en-GB";

/** The catalogue that writes the page's measured figures, in {@link LANGUAGE}. */
const FIGURE_MESSAGES = createMessageCatalogue(
  LANGUAGE,
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
);

/** View box units in one kilometre on the ground. */
export const UNITS_PER_KM = 160;

/** Metres in a kilometre. */
const METRES_PER_KM = 1000;

/** The grid's spacing in view box units: one kilometre. */
const GRID_STEP = UNITS_PER_KM;

/** How far a grid tick reaches into the sheet. The strip does not draw the grid; the link preview image does. */
export const TICK_LENGTH = 6;

/** A grid line's place along an axis. */
export interface GridTick {
  readonly at: number;
}

/** The grid lines' ticks along an axis, a kilometre apart, inside the sheet. */
function gridTicks(extent: number): GridTick[] {
  const ticks: GridTick[] = [];
  for (let at = GRID_STEP; at < extent; at += GRID_STEP) {
    ticks.push({ at });
  }
  return ticks;
}

/** The eastings: ticks along the top edge. */
export const EASTINGS: readonly GridTick[] = gridTicks(SHEET.width);

/** The northings: ticks down the left edge. */
export const NORTHINGS: readonly GridTick[] = gridTicks(SHEET.height);

/** The cairn stands on the summit: its foot is the summit point. */
export const CAIRN_FOOT: Point = { x: SUMMIT.x, y: SUMMIT.y };

/** How much the brand's stones are scaled down for the art. */
export const CAIRN_SCALE = 0.1;

/** The box of a list of points. */
function boxOf(points: readonly Point[]): Box {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

/** The brand's stones' points, in the master's coordinates. */
function stonePoints(): Point[] {
  return STONES.flatMap(({ points, offset }) => {
    const [dx, dy] = (offset?.match(/-?\d+(?:\.\d+)?/g) ?? ["0", "0"]).map(
      Number,
    );
    return points.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x: (x ?? 0) + (dx ?? 0), y: (y ?? 0) + (dy ?? 0) };
    });
  });
}

/** The master's stones' extent: their foot is the middle of the lowest edge. */
const STONES_BOX = boxOf(stonePoints());
const STONES_FOOT: Point = {
  x: (STONES_BOX.left + STONES_BOX.right) / 2,
  y: STONES_BOX.bottom,
};

/** The transform that stands the stones on {@link CAIRN_FOOT}. */
export const CAIRN_TRANSFORM = `translate(${CAIRN_FOOT.x} ${CAIRN_FOOT.y}) scale(${CAIRN_SCALE}) translate(${-STONES_FOOT.x} ${-STONES_FOOT.y})`;

/** Where the cairn is drawn, in view box units. */
export const CAIRN_BOX: Box = {
  left: CAIRN_FOOT.x + (STONES_BOX.left - STONES_FOOT.x) * CAIRN_SCALE,
  right: CAIRN_FOOT.x + (STONES_BOX.right - STONES_FOOT.x) * CAIRN_SCALE,
  top: CAIRN_FOOT.y + (STONES_BOX.top - STONES_FOOT.y) * CAIRN_SCALE,
  bottom: CAIRN_FOOT.y,
};

/**
 * The summit's spot height, set on the cairn's start side, so it has room at
 * any text size however near the strip's end edge the cairn is: `at` is the
 * middle of the cairn's start edge, and the label's end edge goes a gap before
 * it (the stylesheet adds the gap and shifts the label by its own width).
 */
export const SPOT_HEIGHT = {
  text: formatNumber(SUMMIT.metres, LANGUAGE),
  at: { x: CAIRN_BOX.left, y: (CAIRN_BOX.top + CAIRN_BOX.bottom) / 2 },
} as const;

/** The dropped pin: its tip is the point it marks. */
export const PIN_TIP: Point = { x: 240, y: 310 };

/** The pin's outline, drawn with its tip at the origin. */
export const PIN_PATH =
  "M0 0C-3 -8 -12 -14 -12 -24A12 12 0 0 1 12 -24C12 -14 3 -8 0 0Z";

/** The pin's head, the dot inside it. */
export const PIN_HEAD = { cx: 0, cy: -24, r: 4.5 } as const;

/** Where the pin is drawn, in view box units. */
export const PIN_BOX: Box = {
  left: PIN_TIP.x - 12,
  right: PIN_TIP.x + 12,
  top: PIN_TIP.y - 36,
  bottom: PIN_TIP.y,
};

/** The measured line: from the pin's tip to the cairn's foot. */
export const MEASURE = {
  from: PIN_TIP,
  to: CAIRN_FOOT,
} as const;

/** The measured line's length in view box units. */
export const MEASURE_UNITS = Math.hypot(
  MEASURE.to.x - MEASURE.from.x,
  MEASURE.to.y - MEASURE.from.y,
);

/** The measured line's length on the ground, in metres, on the sheet's scale. */
export const MEASURE_METRES = (MEASURE_UNITS / UNITS_PER_KM) * METRES_PER_KM;

/**
 * The length label, written as the playground's measure tool writes it. `at`
 * is the line's middle: the stylesheet sets the label's top start corner a
 * fixed distance down and along from it, on the side of the line the line
 * rises away from, so the line never crosses the label at any scale.
 */
export const MEASURE_LABEL = {
  text: formatDistance(MEASURE_METRES, "metric", FIGURE_MESSAGES),
  at: {
    x: (MEASURE.from.x + MEASURE.to.x) / 2,
    y: (MEASURE.from.y + MEASURE.to.y) / 2,
  },
} as const;

/** The clear space kept round the marks a crop must show. */
const CROP_MARGIN = 24;

/** The part of the sheet the strip shows, top to bottom: the marks and a margin. */
const BAND = {
  top: Math.min(CAIRN_BOX.top, PIN_BOX.top) - CROP_MARGIN,
  bottom: Math.max(CAIRN_BOX.bottom, PIN_BOX.bottom) + CROP_MARGIN,
} as const;

/**
 * A crop: which part of the sheet a frame shows. The frame has the crop's
 * shape (`aspect`, as width over height); the drawing inside it is `zoom`
 * times the frame's width and is moved by `marginInlineStart` and
 * `marginBlockStart`, which are shares of the frame's width (a percentage
 * margin is always one), so the crop's top start corner lands on the frame's.
 */
export interface Crop {
  readonly box: Box;
  readonly zoom: number;
  readonly aspect: number;
  readonly marginInlineStart: number;
  readonly marginBlockStart: number;
}

/** The crop that shows `box` of the sheet. */
function cropOf(box: Box): Crop {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return {
    box,
    zoom: SHEET.width / width,
    aspect: width / height,
    marginInlineStart: -box.left / width,
    marginBlockStart: -box.top / width,
  };
}

/** The strip at its widest: the sheet's whole width, cut to the band the marks stand in. */
export const WIDE_CROP: Crop = cropOf({
  left: 0,
  right: SHEET.width,
  top: BAND.top,
  bottom: BAND.bottom,
});

/** The strip on a narrow screen: the same band, enlarged round the marks, so they stay big enough. */
export const NARROW_CROP: Crop = cropOf({
  left: PIN_BOX.left - CROP_MARGIN,
  right: CAIRN_BOX.right + CROP_MARGIN,
  top: BAND.top,
  bottom: BAND.bottom,
});

/** Where a point of the sheet falls in a crop's frame, as shares of the frame's width and height. */
export function placeIn(
  crop: Crop,
  point: Point,
): { inline: number; block: number } {
  return {
    inline: (point.x - crop.box.left) / (crop.box.right - crop.box.left),
    block: (point.y - crop.box.top) / (crop.box.bottom - crop.box.top),
  };
}
