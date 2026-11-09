import { describe, expect, it } from "vitest";
import { parseColour } from "./contrast";
import {
  accent,
  fontFamily,
  fontWeight,
  inset,
  motion,
  neutral,
  radius,
  size,
  space,
  spring,
  themeColor,
  typeScale,
  type ZLayerName,
  zIndex,
  zLayerOrder,
} from "./tokenValues";

/** Reads the lightness and chroma of an `oklch()` ramp step. */
function lightnessAndChroma(value: string): [number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) /.exec(value);
  return [Number(match?.[1]), Number(match?.[2])];
}

describe("palette ramps", () => {
  it("steps the neutral ramp from light to dark with a faint cool tint", () => {
    const steps = Object.values(neutral).map(lightnessAndChroma);
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]?.[0]).toBeLessThan(steps[index - 1]?.[0] ?? 0);
    }
    for (const [, chroma] of steps) {
      expect(chroma).toBeLessThanOrEqual(0.012);
    }
    for (const value of Object.values(neutral)) {
      expect(value).toMatch(/ 250\)$/);
    }
  });

  it("steps the accent ramp 50 to 900 at a single blue hue", () => {
    expect(Object.keys(accent)).toEqual([
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
    ]);
    const lightness = Object.values(accent).map(
      (value) => lightnessAndChroma(value)[0],
    );
    expect([...lightness].sort((a, b) => b - a)).toEqual(lightness);
    for (const value of Object.values(accent)) {
      expect(value).toMatch(/ 255\)$/);
    }
  });
});

describe("theme-color", () => {
  it("is an opaque hex colour for each theme", () => {
    for (const hex of Object.values(themeColor)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(parseColour(hex).a).toBe(1);
    }
  });
});

describe("scales", () => {
  it("keeps spacing, inset and radii to the documented values", () => {
    expect(Object.values(space)).toEqual([
      "4px",
      "8px",
      "12px",
      "16px",
      "24px",
      "32px",
    ]);
    expect(inset).toBe("12px");
    expect(radius).toEqual({
      pill: "24px",
      sheet: "20px",
      control: "14px",
      inner: "10px",
      round: "50%",
    });
  });

  it("defines type sizes in rem with the documented pixel equivalents", () => {
    const pixels = Object.values(typeScale).map(
      (step) => Number.parseFloat(step.size) * 16,
    );
    expect(pixels).toEqual([13, 15, 17, 22]);
    for (const step of Object.values(typeScale)) {
      expect(step.size).toMatch(/rem$/);
    }
  });

  it("uses only weights 400 and 600 and puts the fallback right after Plex", () => {
    expect(Object.values(fontWeight)).toEqual(["400", "600"]);
    expect(
      fontFamily.startsWith(
        '"IBM Plex Sans Variable", "IBM Plex Sans Fallback", ',
      ),
    ).toBe(true);
  });

  it("keeps targets at least 44px with 48px controls", () => {
    expect(Number.parseFloat(size.minTarget) * 16).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(size.control) * 16).toBeGreaterThanOrEqual(48);
    expect(
      Number.parseFloat(size.gapBetweenTargets) * 16,
    ).toBeGreaterThanOrEqual(8);
  });
});

describe("z layers", () => {
  it("stacks the layers in the documented order with room between them", () => {
    expect(zLayerOrder).toEqual([
      "map",
      "mapOverlay",
      "chrome",
      "chromeRaised",
      "sheet",
      "toolbar",
      "popover",
      "toast",
    ]);
    const values = zLayerOrder.map((name: ZLayerName) => Number(zIndex[name]));
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThanOrEqual(
        (values[index - 1] ?? 0) + 10,
      );
    }
  });
});

describe("motion", () => {
  it("defines three durations, one easing and a spring that settles on 1", () => {
    expect(motion.duration).toEqual({
      fast: "120ms",
      base: "200ms",
      slow: "320ms",
    });
    expect(motion.easing).toBe("cubic-bezier(0.2, 0, 0, 1)");
    const points = spring
      .replace(/^linear\(|\)$/g, "")
      .split(",")
      .map(Number);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(Math.max(...points)).toBeGreaterThan(1);
    expect(Math.max(...points)).toBeLessThan(1.1);
  });
});
