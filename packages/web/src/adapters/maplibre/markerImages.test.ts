// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import {
  MARKER_PIXEL_RATIO,
  MARKER_SHAPE_REACH,
  markerImage,
  markerImageName,
  parseHexColour,
} from "./markerImages";

function pixel(image: ReturnType<typeof markerImage>, x: number, y: number) {
  const offset = (y * image.width + x) * 4;
  return [...image.data.slice(offset, offset + 4)];
}

describe("parseHexColour", () => {
  it("reads six-digit hex colours", () => {
    expect(parseHexColour("#e69f00")).toEqual([230, 159, 0]);
    expect(parseHexColour("#0072B2")).toEqual([0, 114, 178]);
  });

  it("refuses anything else", () => {
    expect(() => parseHexColour("orange")).toThrow();
    expect(() => parseHexColour("#fff")).toThrow();
  });
});

describe("markerImageName", () => {
  it("names one image per shape, colour and whole-pixel radius", () => {
    expect(markerImageName("circle", "#E69F00", 6)).toBe(
      "mapcairn-marker:circle:#e69f00:6",
    );
    expect(markerImageName("circle", "#E69F00", 6.4)).toBe(
      markerImageName("circle", "#e69f00", 6),
    );
    expect(markerImageName("circle", "#e69f00", 7)).not.toBe(
      markerImageName("circle", "#e69f00", 6),
    );
  });
});

describe("markerImage", () => {
  const { edgeWidth, haloWidth } = tokenValues.dataMarker;
  const ratio = MARKER_PIXEL_RATIO;
  /** The bitmap's side for a marker of this radius: fill, edge and halo each side. */
  const sideFor = (radius: number) =>
    2 *
    Math.ceil(
      radius * ratio * MARKER_SHAPE_REACH + (edgeWidth + haloWidth) * ratio,
    );
  const rgb = (hex: string) => [...parseHexColour(hex)];
  /** Equal to within the antialiasing, since the sampled row is half a pixel off the centre line. */
  const expectColour = (actual: number[], hex: string) => {
    rgb(hex).forEach((channel, index) => {
      expect(Math.abs((actual[index] as number) - channel)).toBeLessThanOrEqual(
        4,
      );
    });
  };

  it("is a square RGBA bitmap at twice the size, for sharp edges on dense screens", () => {
    const image = markerImage("circle", "#e69f00", 12);
    expect(image.width).toBe(sideFor(12));
    expect(image.height).toBe(sideFor(12));
    expect(image.data).toHaveLength(sideFor(12) ** 2 * 4);
  });

  it("fills the centre with the colour and leaves the corners clear", () => {
    const image = markerImage("circle", "#e69f00", 12);
    const middle = image.width / 2;
    expect(pixel(image, middle, middle)).toEqual([230, 159, 0, 255]);
    expect(pixel(image, 0, 0)[3]).toBe(0);
  });

  for (const radius of [4, 7, 12]) {
    it(`sets a radius-${radius} fill off with a dark edge, then a white halo, at the same width as any other`, () => {
      const image = markerImage("circle", "#fde725", radius);
      const middle = image.width / 2;
      const fillEdge = radius * ratio;
      // The edge and halo are fixed widths outside the fill, so they do not
      // shrink with a small marker (the pale yellow step needs its edge).
      const edge = pixel(
        image,
        Math.floor(middle + fillEdge + (edgeWidth * ratio) / 2),
        middle,
      );
      expectColour(edge, tokenValues.dataMarker.edge);
      expect(edge[3]).toBe(255);
      const halo = pixel(
        image,
        Math.floor(middle + fillEdge + (edgeWidth + haloWidth / 2) * ratio),
        middle,
      );
      expectColour(halo, tokenValues.dataMarker.halo);
      expect(halo[3]).toBe(255);
      expect(pixel(image, image.width - 1, Math.floor(middle))[3]).toBeLessThan(
        255,
      );
    });
  }

  it("draws different shapes differently", () => {
    const shapes = ["circle", "square", "triangle", "diamond"] as const;
    const size = sideFor(12);
    // Outside the circle's and diamond's halo, inside the square's.
    const corner = 8;
    const covered = shapes.map(
      (shape) => pixel(markerImage(shape, "#000000", 12), corner, corner)[3],
    );
    expect(covered[1]).toBeGreaterThan(0);
    expect(covered[0]).toBe(0);
    expect(covered[3]).toBe(0);
    const triangle = markerImage("triangle", "#000000", 12);
    expect(
      pixel(triangle, size / 2, Math.round(size * 0.2))[3],
    ).toBeGreaterThan(0);
    expect(
      pixel(triangle, Math.round(size * 0.2), Math.round(size * 0.2))[3],
    ).toBe(0);
  });
});
