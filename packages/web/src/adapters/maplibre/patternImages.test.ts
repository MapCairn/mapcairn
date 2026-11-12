// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { parseHexColour } from "./markerImages";
import {
  PATTERN_NAMES,
  PATTERN_PIXEL_RATIO,
  PATTERN_SIZE,
  patternImage,
  patternImageName,
} from "./patternImages";

const alphaAt = (data: Uint8Array, x: number, y: number) =>
  data[(y * PATTERN_SIZE + x) * 4 + 3] as number;

/** The share of pixels that draw anything. */
function inked(data: Uint8Array): number {
  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] as number) > 0) {
      count += 1;
    }
  }
  return count / (PATTERN_SIZE * PATTERN_SIZE);
}

describe("patternImages", () => {
  it("names images by pattern and sizes them as a power of two", () => {
    expect(patternImageName("stripes")).toBe("mapcairn-pattern:stripes");
    expect(PATTERN_NAMES).toEqual(["stripes", "dots", "crosshatch"]);
    expect(Math.log2(PATTERN_SIZE) % 1).toBe(0);
    expect(PATTERN_PIXEL_RATIO).toBe(2);
  });

  it("draws every pattern in the ink colour on a transparent background", () => {
    const [red, green, blue] = parseHexColour(tokenValues.dataMarker.edge);
    for (const name of PATTERN_NAMES) {
      const { width, height, data } = patternImage(name);
      expect([width, height]).toEqual([PATTERN_SIZE, PATTERN_SIZE]);
      expect(data).toHaveLength(PATTERN_SIZE * PATTERN_SIZE * 4);
      expect([data[0], data[1], data[2]]).toEqual([red, green, blue]);
      expect(inked(data)).toBeGreaterThan(0.05);
      expect(inked(data)).toBeLessThan(0.7);
      expect(data.some((value, index) => index % 4 === 3 && value === 0)).toBe(
        true,
      );
    }
  });

  it("draws diagonal stripes, with crosshatch adding the other diagonal", () => {
    const stripes = patternImage("stripes").data;
    const hatch = patternImage("crosshatch").data;
    // x + y + 1 is a multiple of 8 along the stripe; x - y is along the crossing one.
    expect(alphaAt(stripes, 7, 0)).toBe(255);
    expect(alphaAt(stripes, 3, 4)).toBe(255);
    expect(alphaAt(stripes, 4, 0)).toBe(0);
    expect(alphaAt(stripes, 0, 0)).toBeLessThan(255);
    expect(alphaAt(hatch, 7, 0)).toBe(255);
    expect(alphaAt(hatch, 0, 0)).toBe(255);
    expect(alphaAt(stripes, 0, 0)).toBeLessThan(alphaAt(hatch, 0, 0));
    expect(inked(hatch)).toBeGreaterThan(inked(stripes));
  });

  it("draws dots that are solid at their centre and clear between", () => {
    const dots = patternImage("dots").data;
    expect(alphaAt(dots, 4, 4)).toBe(255);
    expect(alphaAt(dots, 12, 12)).toBe(255);
    expect(alphaAt(dots, 8, 0)).toBe(0);
  });

  it("repeats without a seam: opposite edges carry the same pattern", () => {
    for (const name of PATTERN_NAMES) {
      const { data } = patternImage(name);
      // The tile's period divides its size, so shifting by one period matches.
      for (let y = 0; y < PATTERN_SIZE; y += 1) {
        for (let x = 0; x < PATTERN_SIZE; x += 1) {
          expect(alphaAt(data, x, y)).toBe(
            alphaAt(data, (x + 8) % PATTERN_SIZE, (y + 8) % PATTERN_SIZE),
          );
        }
      }
    }
  });
});
