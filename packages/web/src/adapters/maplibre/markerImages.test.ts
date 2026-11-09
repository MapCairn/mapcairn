import { tokenValues } from "@karta/theme";
import { describe, expect, it } from "vitest";
import {
  MARKER_BASE_RADIUS,
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
  it("names one image per shape and colour", () => {
    expect(markerImageName("circle", "#E69F00")).toBe(
      "karta-marker:circle:#e69f00",
    );
  });
});

describe("markerImage", () => {
  // The dark edge (1px) and white halo (1.5px) add 2.5px to the base radius.
  const size = (MARKER_BASE_RADIUS + 2.5) * 2 * 2;
  const rgb = (hex: string) => [...parseHexColour(hex)];

  it("is a square RGBA bitmap at twice the base size, for sharp edges on dense screens", () => {
    const image = markerImage("circle", "#e69f00");
    expect(image.width).toBe(size);
    expect(image.height).toBe(size);
    expect(image.data).toHaveLength(size * size * 4);
  });

  it("fills the centre with the colour and leaves the corners clear", () => {
    const image = markerImage("circle", "#e69f00");
    const middle = size / 2;
    expect(pixel(image, middle, middle)).toEqual([230, 159, 0, 255]);
    expect(pixel(image, 0, 0)[3]).toBe(0);
  });

  it("sets the fill off with a dark edge, then a white halo, so it reads on a light map or a dark surface", () => {
    const image = markerImage("circle", "#fde725");
    const middle = size / 2;
    // The fill ends 21.5 device pixels from the centre; the edge is 2 wide, the halo 3.
    const edge = pixel(image, middle + 22, middle);
    expect(edge.slice(0, 3)).toEqual(rgb(tokenValues.dataMarker.edge));
    expect(edge[3]).toBe(255);
    const halo = pixel(image, middle + 24, middle);
    expect(halo.slice(0, 3)).toEqual(rgb(tokenValues.dataMarker.halo));
    expect(halo[3]).toBe(255);
    expect(pixel(image, middle + 27, middle)[3]).toBe(0);
  });

  it("draws different shapes differently", () => {
    const shapes = ["circle", "square", "triangle", "diamond"] as const;
    // Outside the circle's and diamond's halo, inside the square's.
    const corner = 8;
    const covered = shapes.map(
      (shape) => pixel(markerImage(shape, "#000000"), corner, corner)[3],
    );
    expect(covered[1]).toBeGreaterThan(0);
    expect(covered[0]).toBe(0);
    expect(covered[3]).toBe(0);
    const triangle = markerImage("triangle", "#000000");
    expect(
      pixel(triangle, size / 2, Math.round(size * 0.2))[3],
    ).toBeGreaterThan(0);
    expect(
      pixel(triangle, Math.round(size * 0.2), Math.round(size * 0.2))[3],
    ).toBe(0);
  });
});
