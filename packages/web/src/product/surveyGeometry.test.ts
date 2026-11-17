// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
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
  CROSSHAIR,
  CROSSHAIR_ARMS,
  EASTINGS,
  GRID_STEP,
  LABEL_SIZE,
  labelBox,
  MEASURE,
  MEASURE_LABEL,
  MEASURE_METRES,
  MEASURE_UNITS,
  markBoxes,
  NARROW_CROP,
  NORTH,
  NORTH_HALVES,
  NORTHINGS,
  PIN_PATH,
  PIN_TIP,
  SCALE_BAR,
  SHEET,
  SPOT_HEIGHT,
  UNITS_PER_KM,
  VIEW_BOX,
} from "./surveyGeometry";

/** Whether two boxes share any area. */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

/** The distance from a point to the infinite line through two points. */
function distanceToLine(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return (
    Math.abs(
      (to.x - from.x) * (from.y - point.y) -
        (from.x - point.x) * (to.y - from.y),
    ) / length
  );
}

describe("the survey sheet's geometry", () => {
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

  it("labels the line with its own length on the scale bar's scale", () => {
    const metres = (MEASURE_UNITS / UNITS_PER_KM) * 1000;
    expect(MEASURE_METRES).toBe(metres);
    const km = Number(MEASURE_LABEL.text.replace(" km", ""));
    expect(MEASURE_LABEL.text.endsWith(" km")).toBe(true);
    expect(Math.abs(km * 1000 - metres)).toBeLessThan(10);
  });

  it("keeps the length label off the line, beside its middle", () => {
    const box = labelBox(MEASURE_LABEL.text, MEASURE_LABEL.at, "middle");
    const corners = [
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.left, y: box.bottom },
      { x: box.right, y: box.bottom },
    ];
    const side = (point: { x: number; y: number }) =>
      Math.sign(
        (MEASURE.to.x - MEASURE.from.x) * (point.y - MEASURE.from.y) -
          (MEASURE.to.y - MEASURE.from.y) * (point.x - MEASURE.from.x),
      );
    // Every corner is on the same side, so the line does not cross the label.
    expect(new Set(corners.map(side)).size).toBe(1);
    const centre = {
      x: (box.left + box.right) / 2,
      y: (box.top + box.bottom) / 2,
    };
    const middle = {
      x: (MEASURE.from.x + MEASURE.to.x) / 2,
      y: (MEASURE.from.y + MEASURE.to.y) / 2,
    };
    expect(Math.hypot(centre.x - middle.x, centre.y - middle.y)).toBeLessThan(
      60,
    );
    expect(distanceToLine(centre, MEASURE.from, MEASURE.to)).toBeGreaterThan(4);
  });

  it("draws one kilometre on the scale bar in four equal quarters, labelled 0 and 1 km at its ends", () => {
    const { quarters, origin, labels } = SCALE_BAR;
    expect(quarters).toHaveLength(4);
    expect(quarters[0]?.x).toBe(origin.x);
    const end = (quarters[3]?.x ?? 0) + (quarters[3]?.width ?? 0);
    expect(end - origin.x).toBe(UNITS_PER_KM);
    for (const quarter of quarters) {
      expect(quarter.width).toBe(UNITS_PER_KM / 4);
    }
    expect(labels).toEqual([
      { x: origin.x, text: "0" },
      { x: origin.x + UNITS_PER_KM, text: "1 km" },
    ]);
  });

  it("meets the crosshair's arms on its centre", () => {
    const { centre } = CROSSHAIR;
    for (const [from, to] of CROSSHAIR_ARMS) {
      const horizontal = from.y === to.y;
      if (horizontal) {
        expect(from.y).toBe(centre.y);
      } else {
        expect(from.x).toBe(centre.x);
        expect(to.x).toBe(centre.x);
      }
    }
    expect(CROSSHAIR_ARMS).toHaveLength(4);
  });

  it("points the north arrow straight up the grid", () => {
    expect(NORTH.tip.y).toBeLessThan(NORTH.baseY);
    expect(NORTH_HALVES.dark).toContain(`M${NORTH.tip.x} ${NORTH.tip.y}`);
    expect(NORTH_HALVES.light).toContain(`M${NORTH.tip.x} ${NORTH.tip.y}`);
    // The two halves are mirror images about the tip's vertical.
    expect(NORTH_HALVES.dark).toContain(`L${NORTH.tip.x + NORTH.halfWidth} `);
    expect(NORTH_HALVES.light).toContain(`L${NORTH.tip.x - NORTH.halfWidth} `);
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

  it("keeps every mark inside the sheet and clear of every other mark", () => {
    const boxes = Object.entries(markBoxes());
    for (const [name, box] of boxes) {
      expect(box.left, name).toBeGreaterThanOrEqual(0);
      expect(box.top, name).toBeGreaterThanOrEqual(0);
      expect(box.right, name).toBeLessThanOrEqual(SHEET.width);
      expect(box.bottom, name).toBeLessThanOrEqual(SHEET.height);
    }
    for (const [i, [first, a]] of boxes.entries()) {
      for (const [second, b] of boxes.slice(i + 1)) {
        expect(overlaps(a, b), `${first} and ${second}`).toBe(false);
      }
    }
  });

  it("keeps the measured line clear of every mark but its two ends", () => {
    const { pin, cairn, ...others } = markBoxes();
    for (const [name, box] of Object.entries(others)) {
      const centre = {
        x: (box.left + box.right) / 2,
        y: (box.top + box.bottom) / 2,
      };
      const halfDiagonal = Math.hypot(
        (box.right - box.left) / 2,
        (box.bottom - box.top) / 2,
      );
      const t =
        ((centre.x - MEASURE.from.x) * (MEASURE.to.x - MEASURE.from.x) +
          (centre.y - MEASURE.from.y) * (MEASURE.to.y - MEASURE.from.y)) /
        MEASURE_UNITS ** 2;
      const onSegment = t > 0 && t < 1;
      if (onSegment && name !== "measureLabel") {
        expect(
          distanceToLine(centre, MEASURE.from, MEASURE.to),
          name,
        ).toBeGreaterThan(halfDiagonal);
      }
    }
    expect(pin.bottom).toBe(PIN_TIP.y);
    expect(cairn.bottom).toBe(CAIRN_FOOT.y);
  });

  it("measures its labels at the size they are drawn: the type scale's small step", () => {
    const rem = Number.parseFloat(tokenValues.typeScale.small.size);
    expect(rem * 16).toBe(LABEL_SIZE);
  });

  it("keeps the pin, the line, its label, the cairn and the scale bar in the narrow-screen crop", () => {
    const { box, zoom, aspect } = NARROW_CROP;
    const { pin, cairn, measureLabel, spotHeight, scaleBar } = markBoxes();
    for (const [name, mark] of Object.entries({
      pin,
      cairn,
      measureLabel,
      spotHeight,
      scaleBar,
    })) {
      expect(mark.left, name).toBeGreaterThanOrEqual(box.left);
      expect(mark.right, name).toBeLessThanOrEqual(box.right);
      expect(mark.top, name).toBeGreaterThanOrEqual(box.top);
      expect(mark.bottom, name).toBeLessThanOrEqual(box.bottom);
    }
    // With the drawing `zoom` times the frame's width, one view box unit is
    // zoom / VIEW_BOX.width of the frame's width; the offsets must put the
    // crop's top-left corner at the frame's top-left corner.
    const unitsPerFrameWidth = VIEW_BOX.width / zoom;
    expect(
      VIEW_BOX.x - NARROW_CROP.marginInlineStart * unitsPerFrameWidth,
    ).toBeCloseTo(box.left, 6);
    expect(
      VIEW_BOX.y - NARROW_CROP.marginBlockStart * unitsPerFrameWidth,
    ).toBeCloseTo(box.top, 6);
    // The frame shows exactly the crop's box.
    expect((box.right - box.left) / (box.bottom - box.top)).toBeCloseTo(
      aspect,
      6,
    );
  });

  it("leaves room in the collar for the grid numbers", () => {
    expect(VIEW_BOX.x).toBeLessThan(0);
    expect(VIEW_BOX.y).toBeLessThan(0);
    expect(VIEW_BOX.width).toBeGreaterThan(SHEET.width);
  });
});
