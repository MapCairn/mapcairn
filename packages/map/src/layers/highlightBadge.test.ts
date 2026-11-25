// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { PlacedPath } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { nearestVisibleVertex } from "./highlightBadge";

function path(
  pixels: readonly [number, number][],
  visible: readonly boolean[],
  vertices?: readonly number[],
): PlacedPath {
  return {
    pixels: pixels.map(([x, y]) => ({ x, y })),
    visible,
    whole: visible.every(Boolean),
    closed: true,
    vertices: vertices ?? pixels.map((_, index) => index),
  };
}

const CENTRE = { x: 0, y: 0 };

describe("nearestVisibleVertex", () => {
  it("picks the nearest vertex across every path", () => {
    const near = path([[9, 9]], [true]);
    const far = path(
      [
        [50, 50],
        [2, 1],
      ],
      [true, true],
    );
    expect(nearestVisibleVertex([near, far], CENTRE)).toEqual({ x: 2, y: 1 });
  });

  it("skips a vertex that is out of sight", () => {
    const partly = path(
      [
        [1, 1],
        [30, 30],
      ],
      [false, true],
    );
    expect(nearestVisibleVertex([partly], CENTRE)).toEqual({ x: 30, y: 30 });
  });

  it("skips the points a curve added between the vertices", () => {
    const curved = path(
      [
        [1, 1],
        [2, 2],
        [20, 20],
      ],
      [true, true, true],
      [0, 2],
    );
    expect(nearestVisibleVertex([curved], CENTRE)).toEqual({ x: 1, y: 1 });
    const added = path(
      [
        [1, 1],
        [20, 20],
      ],
      [true, true],
      [1],
    );
    expect(nearestVisibleVertex([added], CENTRE)).toEqual({ x: 20, y: 20 });
  });

  it("gives null when no vertex is in sight", () => {
    expect(
      nearestVisibleVertex(
        [
          path(
            [
              [1, 1],
              [5, 5],
            ],
            [false, false],
          ),
        ],
        CENTRE,
      ),
    ).toBeNull();
    expect(nearestVisibleVertex([], CENTRE)).toBeNull();
  });
});
