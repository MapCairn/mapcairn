import { computeDetentHeights } from "@karta/core";
import { describe, expect, it } from "vitest";
import {
  coveredPadding,
  REVEAL_CLEARANCE,
  REVEAL_DETENT,
  type RevealGeometry,
  revealOffset,
} from "./reveal";

const PHONE: RevealGeometry = {
  layout: "sheet",
  viewport: { width: 390, height: 844 },
  panelEdge: null,
};
const DESKTOP: RevealGeometry = {
  layout: "panel",
  viewport: { width: 1280, height: 720 },
  panelEdge: 412,
};

describe("coveredPadding", () => {
  it("keeps clear of the bottom sheet at the detent a reveal raises it to", () => {
    const heights = computeDetentHeights({
      viewportHeight: 844,
      insetBottom: 0,
    });
    expect(coveredPadding(PHONE)).toEqual({
      top: 0,
      right: 0,
      bottom: heights[REVEAL_DETENT],
      left: 0,
    });
  });

  it("keeps clear of the side panel's right edge", () => {
    expect(coveredPadding(DESKTOP)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 412,
    });
  });

  it("treats a side panel whose edge is not known yet as covering nothing", () => {
    expect(coveredPadding({ ...DESKTOP, panelEdge: null })?.left).toBe(0);
  });

  it("has no padding before the map has a size, or when the cover fills it", () => {
    expect(
      coveredPadding({ ...PHONE, viewport: { width: 0, height: 0 } }),
    ).toBeNull();
    expect(coveredPadding({ ...DESKTOP, panelEdge: 1280 })).toBeNull();
  });
});

describe("revealOffset", () => {
  it("leaves a point alone when it is clear of the sheet and the edges", () => {
    expect(revealOffset({ x: 195, y: 200 }, PHONE)).toBeNull();
  });

  it("moves a point behind the half sheet to the middle of what shows above it", () => {
    const offset = revealOffset({ x: 195, y: 700 }, PHONE);
    // The sheet covers 422px, so the free part is 0..422 and its middle is 211.
    expect(offset).toEqual({ dx: 0, dy: 700 - 211 });
  });

  it("moves a point close to the sheet's edge, inside the clearance", () => {
    const edge = 844 - 422 - (REVEAL_CLEARANCE - 1);
    expect(revealOffset({ x: 195, y: edge }, PHONE)).not.toBeNull();
  });

  it("moves a point behind the side panel", () => {
    const offset = revealOffset({ x: 100, y: 360 }, DESKTOP);
    expect(offset).toEqual({ dx: 100 - (412 + 1280) / 2, dy: 0 });
  });

  it("moves a point past the right or top edge back in", () => {
    expect(revealOffset({ x: 388, y: 200 }, PHONE)?.dx).toBeGreaterThan(0);
    expect(revealOffset({ x: 195, y: 4 }, PHONE)?.dy).toBeLessThan(0);
  });

  it("never asks for a move without a free region", () => {
    expect(
      revealOffset(
        { x: 0, y: 0 },
        { ...PHONE, viewport: { width: 0, height: 0 } },
      ),
    ).toBeNull();
  });

  it("uses the whole free region when it is too small for the clearance", () => {
    const small: RevealGeometry = {
      layout: "sheet",
      viewport: { width: 100, height: 100 },
      panelEdge: null,
    };
    // Half of 100 is 50px of map above the sheet; 64px clearance cannot fit.
    expect(revealOffset({ x: 50, y: 25 }, small)).toBeNull();
    expect(revealOffset({ x: 50, y: 80 }, small)).not.toBeNull();
  });
});
