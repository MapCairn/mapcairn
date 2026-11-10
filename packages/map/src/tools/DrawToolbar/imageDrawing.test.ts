import type { DrawShape } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { drawingForImage } from "./imageDrawing";

const shape: DrawShape = {
  id: "s",
  kind: "line",
  label: "Line 1",
  done: true,
  vertices: [
    { lat: 0, lng: 0 },
    { lat: 1, lng: 1 },
  ],
};

describe("drawingForImage", () => {
  it("is undefined when there is nothing to draw", () => {
    expect(drawingForImage([])).toBeUndefined();
  });

  it("carries the marks and two hex colours", () => {
    const drawing = drawingForImage([shape]);
    expect(drawing?.marks).toHaveLength(1);
    expect(drawing?.colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect(drawing?.halo).toMatch(/^#[0-9a-f]{6}$/i);
    expect(drawing?.colour).not.toBe(drawing?.halo);
  });
});
