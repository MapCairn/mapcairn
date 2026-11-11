import { describe, expect, it } from "vitest";
import { mapMetresPerPixel } from "./resolution";

/** 156,543.034 m/px at the equator at normalised zoom 0, over 2 ** 4. */
const EQUATOR_AT_ZOOM_4 = 9783.939_620_502_561;

describe("mapMetresPerPixel", () => {
  it("gives the same scale at the view centre on both shapes", () => {
    for (const projection of ["flat", "globe"] as const) {
      expect(mapMetresPerPixel(projection, 0, 0, 4)).toBeCloseTo(
        EQUATOR_AT_ZOOM_4,
        6,
      );
      expect(mapMetresPerPixel(projection, -60, -60, 4)).toBeCloseTo(
        EQUATOR_AT_ZOOM_4 / 2,
        6,
      );
    }
  });

  it("shrinks with latitude away from the centre on a flat map", () => {
    expect(mapMetresPerPixel("flat", -60, 0, 4)).toBeCloseTo(
      EQUATOR_AT_ZOOM_4 / 2,
      6,
    );
  });

  it("keeps the centre's scale everywhere on a globe", () => {
    expect(mapMetresPerPixel("globe", -60, 0, 4)).toBeCloseTo(
      EQUATOR_AT_ZOOM_4,
      6,
    );
    expect(mapMetresPerPixel("globe", 0, -60, 4)).toBeCloseTo(
      EQUATOR_AT_ZOOM_4 / 2,
      6,
    );
  });

  it("halves with every zoom level on both shapes", () => {
    expect(mapMetresPerPixel("globe", 10, 0, 10)).toBeCloseTo(
      152.874_056_570_352_5,
      9,
    );
    expect(mapMetresPerPixel("flat", 0, 10, 10)).toBeCloseTo(
      152.874_056_570_352_5,
      9,
    );
  });
});
