// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { wrapLongitude } from "../globe/longitude";
import type { Bounds } from "../ports/geometry";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { queryBoxes, queryWindow } from "./query";

/** Degrees in a turn of longitude. */
const TURN = 360;

/** Longitudes and widths are quarter degrees, so adding whole turns is exact and a shifted view is the same view to the last digit. */
const QUARTER = 0.25;

/** How many quarter degrees a view reaches at most: well under a turn, so a view has a short way. */
const MAX_WIDTH_STEPS = 300 / QUARTER;

/** The westmost longitude a map reports, in quarter degrees: a few turns either side of the world. */
const MAX_WEST_STEPS = (3 * TURN) / QUARTER;

/** A view anywhere on the circle of longitude, written with its west anywhere within a few turns of the world. */
const views = fc
  .record({
    west: fc.integer({ min: -MAX_WEST_STEPS, max: MAX_WEST_STEPS }),
    width: fc.integer({ min: 1, max: MAX_WIDTH_STEPS }),
    south: fc.integer({ min: -80, max: 70 }),
    height: fc.integer({ min: 1, max: 10 }),
  })
  .map(
    ({ west, width, south, height }): Bounds => ({
      west: west * QUARTER,
      east: (west + width) * QUARTER,
      south,
      north: south + height,
    }),
  );

/** How many whole turns a map may report a view away from where it first drew it. */
const turns = fc.integer({ min: -2, max: 2 });

/** `view` reported `count` whole turns of longitude away. */
function shifted(view: Bounds, count: number): Bounds {
  return {
    ...view,
    west: view.west + count * TURN,
    east: view.east + count * TURN,
  };
}

/** The run of longitude, from `west` going east, a box covers, as a length. */
function length(box: Bounds): number {
  return box.east - box.west;
}

/** The longitude of the antimeridian, which is both -180 and 180. */
const ANTIMERIDIAN = 180;

/**
 * Whether the longitudes `box` covers include `lng`, on any copy of the
 * world. The antimeridian is one line with two names, so a point on it is
 * covered by a box that reaches it as -180 or as 180.
 */
function covers(boxes: readonly Bounds[], lng: number): boolean {
  const wrapped = wrapLongitude(lng);
  const names = wrapped === -ANTIMERIDIAN ? [wrapped, ANTIMERIDIAN] : [wrapped];
  return boxes.some((box) =>
    names.some((name) => box.west <= name && name <= box.east),
  );
}

describe("queryWindow and queryBoxes, for views across the antimeridian", () => {
  it("asks for the same boxes wherever the view is reported, on any copy of the world", () => {
    fc.assert(
      fc.property(views, turns, (view, count) => {
        expect(queryBoxes(queryWindow(shifted(view, count)))).toEqual(
          queryBoxes(queryWindow(view)),
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("asks only for boxes inside the world, one or two", () => {
    fc.assert(
      fc.property(views, (view) => {
        const boxes = queryBoxes(queryWindow(view));
        expect(boxes.length).toBeGreaterThanOrEqual(1);
        expect(boxes.length).toBeLessThanOrEqual(2);
        for (const box of boxes) {
          expect(box.west).toBeGreaterThanOrEqual(-180);
          expect(box.east).toBeLessThanOrEqual(180);
          expect(box.west).toBeLessThan(box.east);
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("covers a longitude on the antimeridian from a view that ends on it, however it is named", () => {
    // fast-check found this: the view ends at -540, one more name for 180, and its last point wraps to -180.
    const view = { west: -541.5, east: -540, south: 0, north: 1 };
    expect(covers(queryBoxes(queryWindow(view)), view.east)).toBe(true);
  });

  it("covers every longitude of the view, with no gap", () => {
    fc.assert(
      fc.property(
        views,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (view, at) => {
          const lng = view.west + at * (view.east - view.west);
          expect(covers(queryBoxes(queryWindow(view)), lng)).toBe(true);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("asks for no longitude twice beyond the line they share, and as much as the window is wide", () => {
    fc.assert(
      fc.property(views, (view) => {
        const window = queryWindow(view);
        const boxes = queryBoxes(window);
        const total = boxes.reduce((sum, box) => sum + length(box), 0);
        expect(total).toBeCloseTo(
          window.east - window.west >= TURN ? TURN : length(window),
          4,
        );
        const [first, second] = boxes;
        if (first && second) {
          // The two parts meet at the line and share nothing else.
          expect(first.east).toBe(180);
          expect(second.west).toBe(-180);
          expect(second.east).toBeLessThanOrEqual(first.west);
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("splits at the line exactly when the view crosses it", () => {
    fc.assert(
      fc.property(views, (view) => {
        const crosses =
          wrapLongitude(view.west) + (view.east - view.west) > 180;
        const boxes = queryBoxes(queryWindow(view));
        if (crosses) {
          // Two boxes, or one holding the whole circle when the margin reaches round it.
          expect(boxes.length === 2 || length(boxes[0] as Bounds) === 360).toBe(
            true,
          );
        } else {
          expect(boxes).toHaveLength(1);
        }
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("asks for a view inside the world as before: one box that holds it", () => {
    const inside = fc
      .record({
        west: fc.integer({ min: -170 / QUARTER, max: 140 / QUARTER }),
        width: fc.integer({ min: 1, max: 40 / QUARTER }),
      })
      .map(({ west, width }) => ({
        west: west * QUARTER,
        east: (west + width) * QUARTER,
        south: 0,
        north: 10,
      }));
    fc.assert(
      fc.property(inside, (view) => {
        const boxes = queryBoxes(queryWindow(view));
        expect(boxes).toHaveLength(1);
        expect(boxes[0]?.west).toBeLessThanOrEqual(view.west);
        expect(boxes[0]?.east).toBeGreaterThanOrEqual(view.east);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
