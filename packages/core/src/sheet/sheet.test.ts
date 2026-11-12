// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  clampHeight,
  computeDetentHeights,
  cycleDetent,
  nextDetent,
  resolveSnap,
  rubberBand,
  SHEET_DETENTS,
  SHEET_FLING_VELOCITY,
} from "./sheet";

const heights = { peek: 200, half: 400, full: 788 };

describe("SHEET_DETENTS", () => {
  it("lists the detents from smallest to largest", () => {
    expect(SHEET_DETENTS).toEqual(["peek", "half", "full"]);
  });
});

describe("computeDetentHeights", () => {
  it("uses a quarter, a half and the viewport less a 12px top inset", () => {
    expect(
      computeDetentHeights({ viewportHeight: 800, insetBottom: 0 }),
    ).toEqual({ peek: 200, half: 400, full: 788 });
  });

  it("clamps the peek height to 160 at the low end", () => {
    expect(
      computeDetentHeights({ viewportHeight: 600, insetBottom: 0 }).peek,
    ).toBe(160);
  });

  it("clamps the peek height to 220 at the high end", () => {
    expect(
      computeDetentHeights({ viewportHeight: 1200, insetBottom: 0 }).peek,
    ).toBe(220);
  });

  it("rounds every height to a whole pixel", () => {
    expect(
      computeDetentHeights({ viewportHeight: 733, insetBottom: 0 }),
    ).toEqual({ peek: 183, half: 367, full: 721 });
  });

  it("adds the bottom safe-area inset to the peek so its content is not covered", () => {
    expect(
      computeDetentHeights({ viewportHeight: 800, insetBottom: 34 }).peek,
    ).toBe(234);
  });

  it("never lets a detent exceed the next one on a very short viewport", () => {
    const result = computeDetentHeights({
      viewportHeight: 300,
      insetBottom: 34,
    });
    expect(result.peek).toBeLessThanOrEqual(result.half);
    expect(result.half).toBeLessThanOrEqual(result.full);
  });

  it("never returns negative heights for a tiny viewport", () => {
    expect(computeDetentHeights({ viewportHeight: 5, insetBottom: 0 })).toEqual(
      { peek: 0, half: 0, full: 0 },
    );
  });
});

describe("resolveSnap", () => {
  it("snaps to the nearest detent when at rest", () => {
    expect(
      resolveSnap({ heights, currentHeight: 230, velocityPxPerSecond: 0 }),
    ).toBe("peek");
    expect(
      resolveSnap({ heights, currentHeight: 380, velocityPxPerSecond: 0 }),
    ).toBe("half");
    expect(
      resolveSnap({ heights, currentHeight: 700, velocityPxPerSecond: 0 }),
    ).toBe("full");
  });

  it("breaks an exact tie towards the smaller detent", () => {
    expect(
      resolveSnap({ heights, currentHeight: 300, velocityPxPerSecond: 0 }),
    ).toBe("peek");
  });

  it("projects 150ms of momentum for a slow drag", () => {
    // 230 + 0.15 * 500 = 305, which is nearer to half (400) than peek (200).
    expect(
      resolveSnap({ heights, currentHeight: 230, velocityPxPerSecond: 500 }),
    ).toBe("half");
    // 380 - 0.15 * 500 = 305 again, now travelling down: nearer half.
    expect(
      resolveSnap({ heights, currentHeight: 380, velocityPxPerSecond: -500 }),
    ).toBe("half");
    // 380 - 0.15 * 600 = 290, nearer peek.
    expect(
      resolveSnap({ heights, currentHeight: 380, velocityPxPerSecond: -600 }),
    ).toBe("peek");
  });

  it("moves one detent up on a fast upward fling", () => {
    expect(SHEET_FLING_VELOCITY).toBe(600);
    expect(
      resolveSnap({ heights, currentHeight: 410, velocityPxPerSecond: 601 }),
    ).toBe("full");
    expect(
      resolveSnap({ heights, currentHeight: 210, velocityPxPerSecond: 900 }),
    ).toBe("half");
  });

  it("moves one detent down on a fast downward fling", () => {
    expect(
      resolveSnap({ heights, currentHeight: 390, velocityPxPerSecond: -601 }),
    ).toBe("peek");
    expect(
      resolveSnap({ heights, currentHeight: 780, velocityPxPerSecond: -2000 }),
    ).toBe("half");
  });

  it("clamps a fling at either end", () => {
    expect(
      resolveSnap({ heights, currentHeight: 780, velocityPxPerSecond: 2000 }),
    ).toBe("full");
    expect(
      resolveSnap({ heights, currentHeight: 190, velocityPxPerSecond: -2000 }),
    ).toBe("peek");
  });

  it("treats exactly the threshold as a slow drag", () => {
    // 200 + 0.15 * 600 = 290 is nearer peek (200) than half (400).
    expect(
      resolveSnap({ heights, currentHeight: 200, velocityPxPerSecond: 600 }),
    ).toBe("peek");
  });
});

describe("nextDetent", () => {
  it("steps up and down and clamps at the ends", () => {
    expect(nextDetent("peek", "up")).toBe("half");
    expect(nextDetent("half", "up")).toBe("full");
    expect(nextDetent("full", "up")).toBe("full");
    expect(nextDetent("full", "down")).toBe("half");
    expect(nextDetent("half", "down")).toBe("peek");
    expect(nextDetent("peek", "down")).toBe("peek");
  });
});

describe("cycleDetent", () => {
  it("goes peek, half, full and back to peek", () => {
    expect(cycleDetent("peek")).toBe("half");
    expect(cycleDetent("half")).toBe("full");
    expect(cycleDetent("full")).toBe("peek");
  });
});

describe("rubberBand", () => {
  it("is zero with no overshoot and for negative input", () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(-20)).toBe(0);
  });

  it("is strictly increasing but with diminishing returns", () => {
    let previous = rubberBand(0);
    let previousStep = Number.POSITIVE_INFINITY;
    for (let overshoot = 10; overshoot <= 500; overshoot += 10) {
      const value = rubberBand(overshoot);
      expect(value).toBeGreaterThan(previous);
      const step = value - previous;
      expect(step).toBeLessThan(previousStep);
      previous = value;
      previousStep = step;
    }
  });

  it("never reaches the 48px limit however far the finger travels", () => {
    expect(rubberBand(1e9)).toBeLessThanOrEqual(48);
    expect(rubberBand(10_000)).toBeLessThan(48);
  });

  it("resists: the visual movement is always less than the finger's", () => {
    for (const overshoot of [1, 10, 50, 200]) {
      expect(rubberBand(overshoot)).toBeLessThan(overshoot);
    }
  });
});

describe("clampHeight", () => {
  it("returns heights between the extremes unchanged", () => {
    expect(clampHeight(300, heights)).toBe(300);
    expect(clampHeight(200, heights)).toBe(200);
    expect(clampHeight(788, heights)).toBe(788);
  });

  it("applies rubber-band resistance above the full detent", () => {
    const result = clampHeight(888, heights);
    expect(result).toBeGreaterThan(788);
    expect(result).toBeLessThan(888);
    expect(result).toBe(788 + rubberBand(100));
  });

  it("applies rubber-band resistance below the peek detent", () => {
    const result = clampHeight(100, heights);
    expect(result).toBeLessThan(200);
    expect(result).toBeGreaterThan(100);
    expect(result).toBe(200 - rubberBand(100));
  });

  it("never goes below zero", () => {
    expect(clampHeight(-500, { peek: 10, half: 20, full: 30 })).toBe(0);
  });
});
