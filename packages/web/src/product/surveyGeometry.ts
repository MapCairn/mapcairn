// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatDistance, formatNumber } from "@mapcairn/core";
import { STONES } from "../app/cairnStones";
import { CONTOUR_VIEW_BOX, SUMMIT } from "./contours";

/*
 * Where every mark of the product page's survey sheet goes, worked out once
 * from a few constants, so the marks agree by construction: the measured line
 * starts at the pin's tip and ends at the cairn's foot; its label is its own
 * length on the scale bar's scale; the scale bar's ticks are that scale's
 * quarters; the crosshair's lines meet on its centre; the north arrow points
 * up the grid. `SurveyArt.tsx` draws only what this module returns, the link
 * preview image reuses it, and `surveyGeometry.test.ts` checks the relations
 * and that no two marks overlap.
 */

/** A point in the art's view box. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box in the art's view box. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The size of the sheet, in view box units. */
export const SHEET = CONTOUR_VIEW_BOX;

/** The room around the sheet for the grid numbers. */
export const COLLAR = 26;

/** The art's whole view box: the sheet and its collar. */
export const VIEW_BOX = {
  x: -COLLAR,
  y: -COLLAR,
  width: SHEET.width + COLLAR * 2,
  height: SHEET.height + COLLAR * 2,
} as const;

/** The language the page's figures are written in. */
export const LANGUAGE = "en-GB";

/** The size of the art's labels, in view box units (the type scale's small step at the sheet's own scale). */
export const LABEL_SIZE = 13;

/** View box units in one kilometre on the ground. */
export const UNITS_PER_KM = 160;

/** Metres in a kilometre. */
const METRES_PER_KM = 1000;

/** The grid's spacing in view box units: one kilometre, so each grid number is a kilometre. */
export const GRID_STEP = UNITS_PER_KM;

/** How far a grid tick reaches into the sheet. */
export const TICK_LENGTH = 6;

/** The first easting along the top and the first northing down the side, as on a sheet's grid references. */
const FIRST_EASTING = 41;
const FIRST_NORTHING = 12;

/** The grid lines' positions along each axis, inside the sheet. */
function gridPositions(extent: number): number[] {
  const positions: number[] = [];
  for (let at = GRID_STEP; at < extent; at += GRID_STEP) {
    positions.push(at);
  }
  return positions;
}

/** A grid tick and its number, centred on the tick. */
export interface GridTick {
  readonly at: number;
  readonly label: string;
}

/** Two figures, padded, as grid numbers are written. */
function gridNumber(value: number): string {
  return String(value).padStart(2, "0");
}

/** The eastings: ticks along the top edge, numbered left to right. */
export const EASTINGS: readonly GridTick[] = gridPositions(SHEET.width).map(
  (at) => ({ at, label: gridNumber(FIRST_EASTING + at / GRID_STEP) }),
);

/** The northings: ticks down the left edge, numbered so north (up) is the larger. */
export const NORTHINGS: readonly GridTick[] = gridPositions(SHEET.height).map(
  (at) => ({ at, label: gridNumber(FIRST_NORTHING - at / GRID_STEP) }),
);

/** The cairn stands on the summit: its foot is the summit point. */
export const CAIRN_FOOT: Point = { x: SUMMIT.x, y: SUMMIT.y };

/** How much the brand's stones are scaled down for the art. */
export const CAIRN_SCALE = 0.075;

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
const STONE_POINTS = stonePoints();
const STONES_BOX = boxOf(STONE_POINTS);
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

/** The summit's spot height, beside the cairn. */
export const SPOT_HEIGHT = {
  text: formatNumber(SUMMIT.metres, LANGUAGE),
  at: { x: CAIRN_BOX.right + 6, y: CAIRN_FOOT.y - 4 },
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

/** The measured line's length on the ground, in metres, on the scale bar's scale. */
export const MEASURE_METRES = (MEASURE_UNITS / UNITS_PER_KM) * METRES_PER_KM;

/** The clear space between the length label's box and the line. */
const LABEL_CLEARANCE = 4;

/** Where a label's box sits around its baseline anchor: its middle is this far above the baseline. */
const LABEL_MIDDLE_ABOVE_BASELINE = LABEL_SIZE * 0.375;

/**
 * The length label: the line's own length, written as the playground's
 * measure tool writes it, beside the line's middle on its lower side. Its box
 * is moved out along the line's normal just far enough that the line clears
 * it by {@link LABEL_CLEARANCE}.
 */
export const MEASURE_LABEL = (() => {
  const text = formatDistance(MEASURE_METRES, "metric", LANGUAGE);
  const dx = (MEASURE.to.x - MEASURE.from.x) / MEASURE_UNITS;
  const dy = (MEASURE.to.y - MEASURE.from.y) / MEASURE_UNITS;
  // One of the two unit normals points down the sheet; the label goes that way.
  const sign = dx >= 0 ? 1 : -1;
  const normal = { x: -dy * sign, y: dx * sign };
  const box = labelBox(text, { x: 0, y: 0 }, "middle");
  const halfWidth = (box.right - box.left) / 2;
  const halfHeight = (box.bottom - box.top) / 2;
  const reach =
    halfWidth * Math.abs(normal.x) +
    halfHeight * Math.abs(normal.y) +
    LABEL_CLEARANCE;
  const centre = {
    x: (MEASURE.from.x + MEASURE.to.x) / 2 + normal.x * reach,
    y: (MEASURE.from.y + MEASURE.to.y) / 2 + normal.y * reach,
  };
  return {
    text,
    at: { x: centre.x, y: centre.y + LABEL_MIDDLE_ABOVE_BASELINE },
  } as const;
})();

/** The crosshair: the map's centre, as the playground marks it while placing a point. */
export const CROSSHAIR = {
  centre: { x: 520, y: 340 },
  radius: 9,
  gap: 5,
  reach: 16,
} as const;

/** The crosshair's four arms, each a segment on a line through its centre. */
export const CROSSHAIR_ARMS: readonly (readonly [Point, Point])[] = (() => {
  const { centre, gap, reach } = CROSSHAIR;
  return [
    [
      { x: centre.x - reach, y: centre.y },
      { x: centre.x - gap, y: centre.y },
    ],
    [
      { x: centre.x + gap, y: centre.y },
      { x: centre.x + reach, y: centre.y },
    ],
    [
      { x: centre.x, y: centre.y - reach },
      { x: centre.x, y: centre.y - gap },
    ],
    [
      { x: centre.x, y: centre.y + gap },
      { x: centre.x, y: centre.y + reach },
    ],
  ];
})();

/** The north arrow: its tip is straight above the middle of its base, so it points up the grid. */
export const NORTH = {
  tip: { x: SHEET.width - 34, y: 18 },
  baseY: 48,
  notchY: 42,
  halfWidth: 9,
  labelY: 66,
} as const;

/** The north arrow's two halves: the filled one and the outlined one. */
export const NORTH_HALVES = {
  dark: `M${NORTH.tip.x} ${NORTH.tip.y}L${NORTH.tip.x + NORTH.halfWidth} ${NORTH.baseY}L${NORTH.tip.x} ${NORTH.notchY}Z`,
  light: `M${NORTH.tip.x} ${NORTH.tip.y}L${NORTH.tip.x - NORTH.halfWidth} ${NORTH.baseY}L${NORTH.tip.x} ${NORTH.notchY}Z`,
} as const;

/** The scale bar: one kilometre on {@link UNITS_PER_KM}, in alternate quarters, with its two ends labelled. */
export const SCALE_BAR = (() => {
  const origin = { x: 96, y: SHEET.height - 30 };
  const quarter = UNITS_PER_KM / 4;
  return {
    origin,
    height: 6,
    quarters: [0, 1, 2, 3].map((step) => ({
      x: origin.x + step * quarter,
      width: quarter,
      dark: step % 2 === 0,
    })),
    labels: [
      { x: origin.x, text: "0" },
      {
        x: origin.x + UNITS_PER_KM,
        text: formatDistance(METRES_PER_KM, "metric", LANGUAGE),
      },
    ],
    labelY: origin.y - 6,
  } as const;
})();

/** The clear space kept round the marks a narrow crop must show. */
const CROP_MARGIN = 12;

/**
 * How the art is cropped on a narrow screen, so its labels stay legible: the
 * same drawing, enlarged by {@link NARROW_CROP.zoom}, round the marks that
 * tell the story (the pin, the measured line and its length, the cairn and
 * its height, and the scale bar the length is read against), in a frame of
 * {@link NARROW_CROP.aspect}. The zoom is the largest that keeps all of them
 * in the frame. Nothing is redrawn, so every relation holds. `box` is the
 * part of the view box that shows; `marginInlineStart` and `marginBlockStart`
 * are the offsets, as shares of the frame's width, that put it in the frame.
 */
export const NARROW_CROP = (() => {
  const aspect = 4 / 3;
  const { pin, cairn, spotHeight, measureLabel, scaleBar } = markBoxes();
  const kept = [pin, cairn, spotHeight, measureLabel, scaleBar];
  const left = Math.min(...kept.map((box) => box.left)) - CROP_MARGIN;
  const right = Math.max(...kept.map((box) => box.right)) + CROP_MARGIN;
  const top = Math.min(...kept.map((box) => box.top)) - CROP_MARGIN;
  const bottom = Math.max(...kept.map((box) => box.bottom)) + CROP_MARGIN;
  const zoom = Math.min(
    VIEW_BOX.width / (right - left),
    VIEW_BOX.width / ((bottom - top) * aspect),
  );
  const focus = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const shownWidth = VIEW_BOX.width / zoom;
  const shownHeight = shownWidth / aspect;
  const fx = (focus.x - VIEW_BOX.x) / VIEW_BOX.width;
  const fy = (focus.y - VIEW_BOX.y) / VIEW_BOX.height;
  const heightPerWidth = (zoom * VIEW_BOX.height) / VIEW_BOX.width;
  return {
    zoom,
    aspect,
    focus,
    box: {
      left: focus.x - shownWidth / 2,
      right: focus.x + shownWidth / 2,
      top: focus.y - shownHeight / 2,
      bottom: focus.y + shownHeight / 2,
    },
    marginInlineStart: 0.5 - fx * zoom,
    marginBlockStart: 0.5 / aspect - fy * heightPerWidth,
  } as const;
})();

/** The box of a list of points. */
function boxOf(points: readonly Point[]): Box {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

/** The box a label of `text` takes, from its anchor, at {@link LABEL_SIZE}; an estimate wide enough for Plex's figures. */
export function labelBox(
  text: string,
  at: Point,
  anchor: "start" | "middle" | "end",
): Box {
  const width = text.length * LABEL_SIZE * 0.62;
  const shift = { start: 0, middle: width / 2, end: width }[anchor];
  return {
    left: at.x - shift,
    right: at.x - shift + width,
    top: at.y - LABEL_SIZE,
    bottom: at.y + LABEL_SIZE * 0.25,
  };
}

/** Every mark on the sheet and the box it takes, for the overlap test. */
export function markBoxes() {
  return {
    cairn: CAIRN_BOX,
    spotHeight: labelBox(SPOT_HEIGHT.text, SPOT_HEIGHT.at, "start"),
    pin: PIN_BOX,
    measureLabel: labelBox(MEASURE_LABEL.text, MEASURE_LABEL.at, "middle"),
    crosshair: {
      left: CROSSHAIR.centre.x - CROSSHAIR.reach,
      right: CROSSHAIR.centre.x + CROSSHAIR.reach,
      top: CROSSHAIR.centre.y - CROSSHAIR.reach,
      bottom: CROSSHAIR.centre.y + CROSSHAIR.reach,
    },
    north: {
      left: NORTH.tip.x - NORTH.halfWidth,
      right: NORTH.tip.x + NORTH.halfWidth,
      top: NORTH.tip.y,
      bottom: NORTH.labelY + LABEL_SIZE * 0.25,
    },
    scaleBar: {
      left: SCALE_BAR.origin.x - LABEL_SIZE,
      right: SCALE_BAR.origin.x + UNITS_PER_KM + LABEL_SIZE * 1.5,
      top: SCALE_BAR.labelY - LABEL_SIZE,
      bottom: SCALE_BAR.origin.y + SCALE_BAR.height,
    },
  };
}
