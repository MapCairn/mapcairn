import type { MarkerShape } from "@karta/core";
import { tokenValues } from "@karta/theme";

/**
 * The radius, in CSS pixels, a marker image is drawn at. The adapter scales
 * each point with `icon-size` (its radius over this), so one image serves
 * every size.
 */
export const MARKER_BASE_RADIUS = 12;

/** The dark edge and the white halo outside it, in CSS pixels at the base radius. */
const { edgeWidth: EDGE, haloWidth: HALO } = tokenValues.dataMarker;

/** Images are drawn at this many device pixels per CSS pixel. */
export const MARKER_PIXEL_RATIO = 2;

/** An RGBA bitmap in the shape MapLibre's `addImage` accepts. */
export interface MarkerBitmap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Reads `#rrggbb`. Palette colours are always six-digit hex. */
export function parseHexColour(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Not a six-digit hex colour: ${hex}`);
  }
  return [
    Number.parseInt(match[1] as string, 16),
    Number.parseInt(match[2] as string, 16),
    Number.parseInt(match[3] as string, 16),
  ];
}

/** The engine image name for a shape and colour. */
export function markerImageName(shape: MarkerShape, colour: string): string {
  return `karta-marker:${shape}:${colour.toLowerCase()}`;
}

/**
 * Signed distance in pixels from a point to a shape's edge, negative inside.
 * `r` is the shape's radius; `y` grows downwards, as in an image.
 */
function distance(shape: MarkerShape, x: number, y: number, r: number): number {
  switch (shape) {
    case "circle":
      return Math.hypot(x, y) - r;
    case "square": {
      const half = r * 0.86;
      return Math.max(Math.abs(x), Math.abs(y)) - half;
    }
    case "diamond":
      return (Math.abs(x) + Math.abs(y)) / Math.SQRT2 - r * 0.8;
    case "triangle": {
      // An upward equilateral triangle (Inigo Quilez's distance function),
      // nudged down so it sits centred by eye.
      const k = Math.sqrt(3);
      const side = r * 1.1;
      let px = Math.abs(x) - side;
      let py = -(y - r * 0.15) + side / k;
      if (px + k * py > 0) {
        [px, py] = [(px - k * py) / 2, (-k * px - py) / 2];
      }
      px -= Math.min(0, Math.max(-2 * side, px));
      return -Math.hypot(px, py) * Math.sign(py);
    }
  }
}

function coverage(signedDistance: number): number {
  return Math.min(1, Math.max(0, 0.5 - signedDistance));
}

/**
 * Draws one marker: the shape filled with `colour`, set off by a dark edge
 * and then a white halo, so it reads on a pale map (the edge shows yellow) and
 * over imagery or a dark map (the halo shows the darkest colours), antialiased,
 * at {@link MARKER_PIXEL_RATIO}. Pure, so it runs in tests without a canvas.
 */
export function markerImage(shape: MarkerShape, colour: string): MarkerBitmap {
  const fillColour = parseHexColour(colour);
  const edgeColour = parseHexColour(tokenValues.dataMarker.edge);
  const haloColour = parseHexColour(tokenValues.dataMarker.halo);
  const ratio = MARKER_PIXEL_RATIO;
  const radius = MARKER_BASE_RADIUS * ratio;
  const edge = EDGE * ratio;
  const halo = HALO * ratio;
  const size = (MARKER_BASE_RADIUS + EDGE + HALO) * 2 * ratio;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const d = distance(
        shape,
        column + 0.5 - size / 2,
        row + 0.5 - size / 2,
        radius - (edge + halo) / 2,
      );
      const fill = coverage(d);
      const edgeRing = coverage(d - edge);
      const outer = coverage(d - edge - halo);
      const offset = (row * size + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        // Fill over edge over halo, each antialiased into the next.
        const ring =
          (edgeColour[channel] as number) * edgeRing +
          (haloColour[channel] as number) * (1 - edgeRing);
        data[offset + channel] = Math.round(
          (fillColour[channel] as number) * fill + ring * (1 - fill),
        );
      }
      data[offset + 3] = Math.round(255 * outer);
    }
  }
  return { width: size, height: size, data };
}
