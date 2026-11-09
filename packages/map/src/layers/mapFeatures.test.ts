import {
  PALETTE_SLOTS,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  samplePoint,
} from "@karta/core";
import { tokenValues } from "@karta/theme";
import { describe, expect, it } from "vitest";
import { featurePosition, paletteColour, toMapFeatures } from "./mapFeatures";

describe("paletteColour", () => {
  it("has a theme value for every slot a definition may name, and nothing more", () => {
    for (const slot of PALETTE_SLOTS) {
      expect(paletteColour(slot)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(tokenValues.dataPalette).sort()).toEqual(
      [...PALETTE_SLOTS].sort(),
    );
  });

  it("refuses a slot the palette lacks", () => {
    expect(() => paletteColour("pink")).toThrow(/pink/);
  });
});

describe("featurePosition", () => {
  it("reads a point and ignores other shapes", () => {
    expect(featurePosition(samplePoint("a", {}, [18.4, -33.9]))).toEqual({
      lat: -33.9,
      lng: 18.4,
    });
    expect(
      featurePosition({
        id: "l",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        fields: {},
      }),
    ).toBeNull();
  });
});

describe("toMapFeatures", () => {
  it("draws each point with its style's colour, size and shape", () => {
    expect(
      toMapFeatures(SAMPLE_ALERT_LAYER.style, [
        samplePoint("a", { level: "Red" }, [10, 20]),
      ]),
    ).toEqual([
      {
        id: "a",
        position: { lat: 20, lng: 10 },
        colour: tokenValues.dataPalette.vermillion,
        radius: 6,
        shape: "triangle",
      },
    ]);
    expect(
      toMapFeatures(SAMPLE_FEED_LAYER.style, [
        samplePoint("b", { value: 6 }),
      ])[0]?.radius,
    ).toBe(11);
  });

  it("skips features that are not points", () => {
    expect(
      toMapFeatures(SAMPLE_FEED_LAYER.style, [
        {
          id: "l",
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          fields: {},
        },
      ]),
    ).toEqual([]);
  });
});
