// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { boundsMeet } from "./boundsMeet";

const box = (west: number, south: number, east: number, north: number) => ({
  west,
  south,
  east,
  north,
});

describe("boundsMeet", () => {
  const view = box(10, 10, 20, 20);

  it("meets a box that overlaps or touches", () => {
    expect(boundsMeet(view, box(15, 15, 30, 30))).toBe(true);
    expect(boundsMeet(view, box(20, 20, 25, 25))).toBe(true);
    expect(boundsMeet(view, box(12, 12, 13, 13))).toBe(true);
  });

  it("misses a box beside, above or below", () => {
    expect(boundsMeet(view, box(21, 10, 30, 20))).toBe(false);
    expect(boundsMeet(view, box(0, 10, 9, 20))).toBe(false);
    expect(boundsMeet(view, box(10, 21, 20, 30))).toBe(false);
    expect(boundsMeet(view, box(10, 0, 20, 9))).toBe(false);
  });

  it("meets across the antimeridian from either side", () => {
    const east = box(178, -5, 182, 5);
    expect(boundsMeet(box(-181, -5, -178, 5), east)).toBe(true);
    expect(boundsMeet(box(179, -5, 180.1, 5), east)).toBe(true);
    expect(boundsMeet(box(-179, -5, -178, 5), box(179, -5, 181, 5))).toBe(true);
    expect(boundsMeet(box(100, -5, 120, 5), east)).toBe(false);
  });
});
