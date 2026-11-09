import type { FillPattern } from "@karta/core";
import { tokenValues } from "@karta/theme";
import { type MarkerBitmap, parseHexColour } from "./markerImages";

/** The engine image name of a fill pattern, as a data-driven `fill-pattern` builds it. */
export const PATTERN_IMAGE_PREFIX = "karta-pattern:";

/** Patterns are drawn at this many device pixels per CSS pixel. */
export const PATTERN_PIXEL_RATIO = 2;

/**
 * The side of every pattern bitmap, in device pixels. A power of two, as
 * MapLibre needs for an image that repeats.
 */
export const PATTERN_SIZE = 16;

/** The fill patterns that draw something: every one except `solid`. */
export const PATTERN_NAMES: readonly Exclude<FillPattern, "solid">[] = [
  "stripes",
  "dots",
  "crosshatch",
];

/** The engine image name for a pattern. */
export function patternImageName(pattern: FillPattern): string {
  return `${PATTERN_IMAGE_PREFIX}${pattern}`;
}

/** Spacing of the diagonal lines, in device pixels. It divides {@link PATTERN_SIZE}, so the lines meet across tiles. */
const LINE_SPACING = 8;
/** Thickness of a diagonal line, in device pixels. */
const LINE_THICKNESS = 2;
/** Radius of a dot, in device pixels. */
const DOT_RADIUS = 1.6;

/** Distance from `value` to the nearest multiple of `period`, wrapping. */
function wrapped(value: number, period: number): number {
  const rest = ((value % period) + period) % period;
  return Math.min(rest, period - rest);
}

/** How much of the pixel at (x, y) the pattern covers, from 0 to 1. */
function coverage(
  pattern: Exclude<FillPattern, "solid">,
  x: number,
  y: number,
) {
  // Pixel centres sit half a pixel in, so a diagonal's offset is x + y + 1 or x - y.
  const diagonal = (offset: number) =>
    Math.min(
      1,
      Math.max(0, LINE_THICKNESS / 2 + 0.5 - wrapped(offset, LINE_SPACING)),
    );
  const stripes = diagonal(x + y + 1);
  switch (pattern) {
    case "stripes":
      return stripes;
    case "crosshatch":
      return Math.max(stripes, diagonal(x - y));
    case "dots": {
      // Two dots per tile, offset so they read as a grid of dots.
      const half = PATTERN_SIZE / 2;
      const near = (cx: number, cy: number) =>
        Math.hypot(
          wrapped(x + 0.5 - cx, PATTERN_SIZE),
          wrapped(y + 0.5 - cy, PATTERN_SIZE),
        );
      const distance = Math.min(
        near(half / 2, half / 2),
        near(half * 1.5, half * 1.5),
      );
      return Math.min(1, Math.max(0, DOT_RADIUS + 0.5 - distance));
    }
  }
}

/**
 * Draws one fill pattern as a small tile of the palette's ink on a
 * transparent background, so it hatches over any fill colour. Pure, so it
 * runs in tests without a canvas. The tile repeats without a seam.
 */
export function patternImage(
  pattern: Exclude<FillPattern, "solid">,
): MarkerBitmap {
  const [red, green, blue] = parseHexColour(tokenValues.dataMarker.edge);
  const data = new Uint8Array(PATTERN_SIZE * PATTERN_SIZE * 4);
  for (let y = 0; y < PATTERN_SIZE; y += 1) {
    for (let x = 0; x < PATTERN_SIZE; x += 1) {
      const offset = (y * PATTERN_SIZE + x) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = Math.round(255 * coverage(pattern, x, y));
    }
  }
  return { width: PATTERN_SIZE, height: PATTERN_SIZE, data };
}
