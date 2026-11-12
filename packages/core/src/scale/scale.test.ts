// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { computeScaleBar } from "./index";

describe("computeScaleBar (metric)", () => {
  it("picks the largest 1, 2 or 5 step that fits", () => {
    const bar = computeScaleBar({
      metresPerPixel: 2.5,
      maxWidthPx: 100,
      units: "metric",
    });
    expect(bar).toEqual({
      widthPx: 80,
      value: 200,
      unit: "m",
      label: "200 m",
      accessibleLabel: "Scale: 200 metres",
    });
  });

  it("covers every step in a decade", () => {
    const steps = [
      [1, 1],
      [1.9, 1],
      [2, 2],
      [4.9, 2],
      [5, 5],
      [9.9, 5],
      [10, 10],
      [49, 20],
      [50, 50],
      [99, 50],
    ] as const;
    for (const [metres, expected] of steps) {
      const bar = computeScaleBar({
        metresPerPixel: metres / 100,
        maxWidthPx: 100,
        units: "metric",
      });
      expect(bar.value).toBe(expected);
      expect(bar.unit).toBe("m");
    }
  });

  it("never exceeds the maximum width", () => {
    for (let zoom = 0; zoom <= 22; zoom += 0.5) {
      const metresPerPixel = 156_543.03 / 2 ** zoom;
      const bar = computeScaleBar({
        metresPerPixel,
        maxWidthPx: 120,
        units: "metric",
      });
      expect(bar.widthPx).toBeLessThanOrEqual(120);
      expect(bar.widthPx).toBeGreaterThan(0);
    }
  });

  it("switches to kilometres from 1,000 m", () => {
    const bar = computeScaleBar({
      metresPerPixel: 25,
      maxWidthPx: 100,
      units: "metric",
    });
    expect(bar).toEqual({
      widthPx: 80,
      value: 2,
      unit: "km",
      label: "2 km",
      accessibleLabel: "Scale: 2 kilometres",
    });
  });

  it("says one kilometre and one metre in the singular", () => {
    const km = computeScaleBar({
      metresPerPixel: 10,
      maxWidthPx: 100,
      units: "metric",
    });
    expect(km.accessibleLabel).toBe("Scale: 1 kilometre");
    const m = computeScaleBar({
      metresPerPixel: 0.01,
      maxWidthPx: 100,
      units: "metric",
    });
    expect(m.accessibleLabel).toBe("Scale: 1 metre");
  });

  it("groups large kilometre values", () => {
    const bar = computeScaleBar({
      metresPerPixel: 10_000,
      maxWidthPx: 100,
      units: "metric",
    });
    expect(bar.label).toBe("1,000 km");
    expect(bar.accessibleLabel).toBe("Scale: 1,000 kilometres");
  });

  it("handles fractions of a metre at the deepest zooms", () => {
    const bar = computeScaleBar({
      metresPerPixel: 0.0093,
      maxWidthPx: 100,
      units: "metric",
    });
    expect(bar.value).toBe(0.5);
    expect(bar.label).toBe("0.5 m");
    expect(bar.accessibleLabel).toBe("Scale: 0.5 metres");
  });
});

describe("computeScaleBar (imperial)", () => {
  it("uses feet below a mile", () => {
    const bar = computeScaleBar({
      metresPerPixel: 2,
      maxWidthPx: 100,
      units: "imperial",
    });
    expect(bar.unit).toBe("ft");
    expect(bar.value).toBe(500);
    expect(bar.label).toBe("500 ft");
    expect(bar.accessibleLabel).toBe("Scale: 500 feet");
    expect(bar.widthPx).toBeCloseTo((500 * 0.3048) / 2, 6);
  });

  it("uses miles from a mile", () => {
    const one = computeScaleBar({
      metresPerPixel: 20,
      maxWidthPx: 100,
      units: "imperial",
    });
    expect(one.unit).toBe("mi");
    expect(one.value).toBe(1);
    expect(one.label).toBe("1 mi");
    expect(one.accessibleLabel).toBe("Scale: 1 mile");
    const many = computeScaleBar({
      metresPerPixel: 200,
      maxWidthPx: 100,
      units: "imperial",
    });
    expect(many.value).toBe(10);
    expect(many.accessibleLabel).toBe("Scale: 10 miles");
  });

  it("says one foot in the singular", () => {
    const bar = computeScaleBar({
      metresPerPixel: 0.005,
      maxWidthPx: 100,
      units: "imperial",
    });
    expect(bar.value).toBe(1);
    expect(bar.accessibleLabel).toBe("Scale: 1 foot");
  });
});

describe("computeScaleBar (degenerate input)", () => {
  it("returns an empty bar rather than throwing", () => {
    for (const metresPerPixel of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const bar = computeScaleBar({
        metresPerPixel,
        maxWidthPx: 100,
        units: "metric",
      });
      expect(bar.widthPx).toBe(0);
      expect(bar.value).toBe(0);
      expect(bar.label).toBe("0 m");
    }
    const imperial = computeScaleBar({
      metresPerPixel: 1,
      maxWidthPx: 0,
      units: "imperial",
    });
    expect(imperial).toEqual({
      widthPx: 0,
      value: 0,
      unit: "ft",
      label: "0 ft",
      accessibleLabel: "Scale: 0 feet",
    });
  });
});
