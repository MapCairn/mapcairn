// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  CONTOUR_INTERVAL_METRES,
  CONTOURS,
  INDEX_CONTOUR_METRES,
  SUMMIT,
} from "./contours";
import {
  type Box,
  CAIRN_BOX,
  CAIRN_FOOT,
  type Crop,
  EASTINGS,
  GRID_STEP,
  MEASURE,
  MEASURE_LABEL,
  MEASURE_METRES,
  MEASURE_UNITS,
  NARROW_CROP,
  NORTHINGS,
  PIN_BOX,
  PIN_PATH,
  PIN_TIP,
  placeIn,
  SHEET,
  SPOT_HEIGHT,
  UNITS_PER_KM,
  WIDE_CROP,
} from "./surveyGeometry";

/** Whether `inner` lies inside `outer`. */
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  );
}

describe("the relief strip's geometry", () => {
  it("starts the measured line exactly at the pin's tip and ends it at the cairn's foot", () => {
    expect(MEASURE.from).toEqual(PIN_TIP);
    expect(MEASURE.to).toEqual(CAIRN_FOOT);
    expect(CAIRN_FOOT).toEqual({ x: SUMMIT.x, y: SUMMIT.y });
    // The pin's outline starts and ends at its own origin, which is drawn at PIN_TIP.
    expect(PIN_PATH.startsWith("M0 0")).toBe(true);
    expect(PIN_PATH.endsWith("0 0Z")).toBe(true);
  });

  it("stands the cairn on its foot: its lowest point is the summit, centred", () => {
    expect(CAIRN_BOX.bottom).toBe(CAIRN_FOOT.y);
    expect((CAIRN_BOX.left + CAIRN_BOX.right) / 2).toBeCloseTo(CAIRN_FOOT.x, 6);
  });

  it("labels the line with its own length on the sheet's scale, at the line's middle", () => {
    const metres = (MEASURE_UNITS / UNITS_PER_KM) * 1000;
    expect(MEASURE_METRES).toBe(metres);
    const km = Number(MEASURE_LABEL.text.replace(" km", ""));
    expect(MEASURE_LABEL.text.endsWith(" km")).toBe(true);
    expect(Math.abs(km * 1000 - metres)).toBeLessThan(10);
    expect(MEASURE_LABEL.at.x).toBe((PIN_TIP.x + CAIRN_FOOT.x) / 2);
    expect(MEASURE_LABEL.at.y).toBe((PIN_TIP.y + CAIRN_FOOT.y) / 2);
  });

  it("rises the line away from its label's side, so the label sits on the empty side of the line", () => {
    // The label's box starts below and after the middle; the line there is
    // higher the further along it goes, so it never reaches the box.
    expect(MEASURE.to.y).toBeLessThan(MEASURE.from.y);
    expect(MEASURE.to.x).toBeGreaterThan(MEASURE.from.x);
  });

  it("puts the grid ticks on the grid's true positions, numbered with north the larger", () => {
    expect(EASTINGS.map((tick) => tick.at)).toEqual(
      Array.from({ length: EASTINGS.length }, (_, i) => (i + 1) * GRID_STEP),
    );
    const northings = NORTHINGS.map((tick) => Number(tick.label));
    expect([...northings].sort((a, b) => b - a)).toEqual(northings);
    const eastings = EASTINGS.map((tick) => Number(tick.label));
    expect([...eastings].sort((a, b) => a - b)).toEqual(eastings);
    expect(GRID_STEP).toBe(UNITS_PER_KM);
  });

  it("marks every fifth contour from the base as an index contour, and gives the summit a height just above the highest", () => {
    for (const level of CONTOURS) {
      expect(level.index).toBe(level.metres % INDEX_CONTOUR_METRES === 0);
    }
    const heights = CONTOURS.map((level) => level.metres);
    for (const [i, metres] of heights.entries()) {
      if (i > 0) {
        expect(metres - (heights[i - 1] ?? 0)).toBe(CONTOUR_INTERVAL_METRES);
      }
    }
    const highest = heights.at(-1) ?? 0;
    expect(SUMMIT.metres).toBeGreaterThanOrEqual(highest);
    expect(SUMMIT.metres).toBeLessThan(highest + CONTOUR_INTERVAL_METRES);
    expect(SPOT_HEIGHT.text).toBe(SUMMIT.metres.toLocaleString("en-GB"));
  });

  it("sets the spot height at the cairn's side, in the middle of its height", () => {
    expect(SPOT_HEIGHT.at.x).toBe(CAIRN_BOX.right);
    expect(SPOT_HEIGHT.at.y).toBeGreaterThan(CAIRN_BOX.top);
    expect(SPOT_HEIGHT.at.y).toBeLessThan(CAIRN_BOX.bottom);
  });
});

describe("the two crops", () => {
  const crops: readonly [string, Crop][] = [
    ["wide", WIDE_CROP],
    ["narrow", NARROW_CROP],
  ];

  it.each(crops)(
    "keeps the pin, the cairn, the line and both label anchors in the %s crop, inside the sheet",
    (_name, crop) => {
      for (const mark of [PIN_BOX, CAIRN_BOX]) {
        expect(inside(mark, crop.box)).toBe(true);
      }
      for (const point of [SPOT_HEIGHT.at, MEASURE_LABEL.at]) {
        const { inline, block } = placeIn(crop, point);
        expect(inline).toBeGreaterThan(0);
        expect(inline).toBeLessThan(1);
        expect(block).toBeGreaterThan(0);
        expect(block).toBeLessThan(1);
      }
      expect(crop.box.left).toBeGreaterThanOrEqual(0);
      expect(crop.box.right).toBeLessThanOrEqual(SHEET.width);
      expect(crop.box.top).toBeGreaterThanOrEqual(0);
      expect(crop.box.bottom).toBeLessThanOrEqual(SHEET.height);
    },
  );

  it.each(crops)(
    "puts the %s crop's top start corner on its frame's, with the frame the crop's shape",
    (_name, crop) => {
      const width = crop.box.right - crop.box.left;
      // The drawing is `zoom` times the frame's width, so a frame width is `width` units.
      expect(crop.zoom).toBeCloseTo(SHEET.width / width, 9);
      expect(0 - crop.marginInlineStart * width).toBeCloseTo(crop.box.left, 9);
      expect(0 - crop.marginBlockStart * width).toBeCloseTo(crop.box.top, 9);
      expect(width / (crop.box.bottom - crop.box.top)).toBeCloseTo(
        crop.aspect,
        9,
      );
    },
  );

  it("shows the whole width of the sheet in the wide crop, and enlarges the marks in the narrow one", () => {
    expect(WIDE_CROP.zoom).toBe(1);
    expect(NARROW_CROP.zoom).toBeGreaterThan(1.5);
  });

  it("places a point at its share of the crop", () => {
    const { box } = WIDE_CROP;
    expect(placeIn(WIDE_CROP, { x: box.left, y: box.top })).toEqual({
      inline: 0,
      block: 0,
    });
    expect(placeIn(WIDE_CROP, { x: box.right, y: box.bottom })).toEqual({
      inline: 1,
      block: 1,
    });
  });
});
