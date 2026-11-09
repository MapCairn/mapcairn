import { describe, expect, it } from "vitest";
import {
  dragHandle,
  HANDLE_CLICK_TOLERANCE_PX,
  handleReach,
  pressHandle,
} from "./gesture";
import {
  HANDLE_HIT_RADIUS_MOUSE_PX,
  HANDLE_HIT_RADIUS_TOUCH_PX,
  type ProjectedHandle,
} from "./hit";

const handles: ProjectedHandle[] = [
  { id: "v0", point: { x: 100, y: 100 }, kind: "vertex" },
  { id: "v1", point: { x: 200, y: 100 }, kind: "vertex" },
];

describe("handleReach", () => {
  it("is larger for a finger than for a mouse", () => {
    expect(handleReach("mouse")).toBe(HANDLE_HIT_RADIUS_MOUSE_PX);
    expect(handleReach("touch")).toBe(HANDLE_HIT_RADIUS_TOUCH_PX);
    expect(handleReach("touch")).toBeGreaterThan(handleReach("mouse"));
  });
});

describe("pressHandle", () => {
  it("starts a gesture on the nearest handle in reach", () => {
    expect(pressHandle(handles, { x: 104, y: 98 }, "mouse")).toEqual({
      id: "v0",
      origin: { x: 104, y: 98 },
      pointer: "mouse",
      moved: false,
    });
  });

  it("gives a finger more reach than a mouse", () => {
    const at = { x: 100 + 18, y: 100 };
    expect(pressHandle(handles, at, "mouse")).toBeNull();
    expect(pressHandle(handles, at, "touch")?.id).toBe("v0");
  });

  it("starts nothing away from every handle", () => {
    expect(pressHandle(handles, { x: 500, y: 500 }, "touch")).toBeNull();
    expect(pressHandle([], { x: 0, y: 0 }, "mouse")).toBeNull();
  });
});

describe("dragHandle", () => {
  const start = pressHandle(handles, { x: 100, y: 100 }, "mouse");

  it("stays a tap while the pointer is within the click tolerance", () => {
    if (!start) {
      throw new Error("Expected a gesture.");
    }
    const jitter = dragHandle(start, {
      x: 100 + HANDLE_CLICK_TOLERANCE_PX.mouse,
      y: 100,
    });
    expect(jitter.moved).toBe(false);
  });

  it("becomes a drag once the pointer leaves the tolerance, and stays one", () => {
    if (!start) {
      throw new Error("Expected a gesture.");
    }
    const moved = dragHandle(start, { x: 120, y: 100 });
    expect(moved.moved).toBe(true);
    expect(dragHandle(moved, { x: 101, y: 100 }).moved).toBe(true);
  });

  it("uses a wider tolerance for a finger", () => {
    const touch = pressHandle(handles, { x: 100, y: 100 }, "touch");
    if (!touch) {
      throw new Error("Expected a gesture.");
    }
    expect(dragHandle(touch, { x: 105, y: 100 }).moved).toBe(false);
    expect(dragHandle(touch, { x: 120, y: 100 }).moved).toBe(true);
  });
});
