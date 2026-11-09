import { describe, expect, it } from "vitest";
import {
  announceDrawEvent,
  DRAW_ISSUE_MESSAGES,
  describeShapeMeasure,
  formatShapeMeasure,
  hintFor,
} from "./describe";
import { type DrawEvent, drawReducer, initialDrawState } from "./reducer";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

const SQUARE: DrawShape = {
  id: "shape-1",
  kind: "polygon",
  label: "Polygon 1",
  vertices: [p(0, 0), p(0.01, 0), p(0.01, 0.01), p(0, 0.01)],
  done: true,
};
const LINE: DrawShape = {
  id: "shape-2",
  kind: "line",
  label: "Line 1",
  vertices: [p(0, 0), p(0, 0.01)],
  done: true,
};
const CIRCLE: DrawShape = {
  id: "shape-3",
  kind: "circle",
  label: "Circle 1",
  vertices: [p(36.8, -1.3)],
  radiusMetres: 500,
  done: true,
};
const POINT: DrawShape = {
  id: "shape-4",
  kind: "point",
  label: "Point 1",
  vertices: [p(2.35, 48.85)],
  done: true,
};
const SHAPES = [SQUARE, LINE, CIRCLE, POINT];

describe("formatShapeMeasure", () => {
  it("shows a polygon's area and perimeter in short units", () => {
    expect(formatShapeMeasure(SQUARE, "metric")).toMatch(
      /^[\d.,]+ (ha|km²) · [\d.,]+ (m|km)$/,
    );
    expect(formatShapeMeasure(SQUARE, "imperial")).toMatch(/(ac|ft²)/);
  });

  it("shows a line's length", () => {
    expect(formatShapeMeasure(LINE, "metric")).toMatch(/^[\d.,]+ (m|km)$/);
  });

  it("shows a circle's radius and area", () => {
    expect(formatShapeMeasure(CIRCLE, "metric")).toBe("500 m radius · 78.5 ha");
  });

  it("is empty for a point, and for a shape with nothing to measure yet", () => {
    expect(formatShapeMeasure(POINT, "metric")).toBe("");
    expect(
      formatShapeMeasure(
        { ...LINE, vertices: [p(0, 0)], done: false },
        "metric",
      ),
    ).toBe("");
  });
});

describe("describeShapeMeasure", () => {
  it("speaks units in words", () => {
    expect(describeShapeMeasure(SQUARE, "metric")).toMatch(
      /^area [\d.,]+ [a-z ]+, perimeter [\d.,]+ (metres|kilometres)$/,
    );
    expect(describeShapeMeasure(LINE, "metric")).toMatch(
      /^length [\d.,]+ (metres|kilometres)$/,
    );
    expect(describeShapeMeasure(CIRCLE, "metric")).toBe(
      "radius 500 metres, area 78.5 hectares",
    );
    expect(describeShapeMeasure(POINT, "metric")).toBe("");
  });
});

describe("hintFor", () => {
  it("says how to add the next point for each mode", () => {
    expect(hintFor("polygon")).toContain("Tap the map");
    expect(hintFor("circle")).toContain("radius");
    expect(hintFor("point")).toContain("Tap the map");
  });
});

describe("DRAW_ISSUE_MESSAGES", () => {
  it("has plain advice for every issue", () => {
    for (const message of Object.values(DRAW_ISSUE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toContain("—");
    }
  });
});

describe("announceDrawEvent", () => {
  const say = (event: DrawEvent | null, shapes = SHAPES) =>
    announceDrawEvent(event, shapes, "metric");

  it("says nothing without an event or for a quiet one", () => {
    expect(say(null)).toBeNull();
    expect(say({ type: "mode", kind: "line" })).toBeNull();
  });

  it("announces points added with the running measure", () => {
    expect(say({ type: "vertex-added", shapeId: "shape-1", count: 4 })).toMatch(
      /^Point 4 added to Polygon 1\. Area /,
    );
    const started = [{ ...LINE, vertices: [p(0, 0)], done: false }];
    expect(
      say({ type: "vertex-added", shapeId: "shape-2", count: 1 }, started),
    ).toBe("Point 1 added to Line 1.");
  });

  it("announces a finished shape with its measures", () => {
    expect(say({ type: "finished", shapeId: "shape-1" })).toMatch(
      /^Polygon 1 finished\. Area /,
    );
    expect(say({ type: "finished", shapeId: "shape-4" })).toBe(
      "Point 1 added.",
    );
    expect(say({ type: "finished", shapeId: "shape-3" })).toBe(
      "Circle 1 finished. Radius 500 metres, area 78.5 hectares.",
    );
  });

  it("announces why something was refused", () => {
    expect(say({ type: "rejected", issue: "self-intersecting" })).toBe(
      DRAW_ISSUE_MESSAGES["self-intersecting"],
    );
  });

  it("announces discarding, removing, inserting, deleting and clearing", () => {
    expect(say({ type: "discarded", kind: "polygon" })).toBe(
      "Discarded the unfinished polygon.",
    );
    expect(say({ type: "vertex-removed", shapeId: "shape-1", count: 3 })).toBe(
      "Point removed from Polygon 1. 3 points left.",
    );
    expect(
      say({ type: "vertex-inserted", shapeId: "shape-1", index: 2, count: 5 }),
    ).toBe("Point added to Polygon 1 as point 3 of 5.");
    expect(say({ type: "deleted", label: "Polygon 1" })).toBe(
      "Deleted Polygon 1. Undo brings it back.",
    );
    expect(say({ type: "cleared", count: 1 })).toBe("Deleted 1 shape.");
    expect(say({ type: "cleared", count: 3 })).toBe("Deleted all 3 shapes.");
  });

  it("announces a move with the new measure", () => {
    expect(say({ type: "vertex-moved", shapeId: "shape-2", index: 1 })).toMatch(
      /^Point 2 of Line 1 moved\. Length /,
    );
    expect(say({ type: "vertex-moved", shapeId: "shape-3", index: 0 })).toMatch(
      /^Circle 1 changed\. Radius 500 metres/,
    );
  });

  it("announces selection", () => {
    expect(say({ type: "selected", shapeId: "shape-1", vertex: null })).toBe(
      "Polygon 1 selected. 4 points.",
    );
    expect(say({ type: "selected", shapeId: "shape-1", vertex: 1 })).toBe(
      "Point 2 of 4 selected in Polygon 1.",
    );
    expect(say({ type: "selected", shapeId: "shape-4", vertex: null })).toBe(
      "Point 1 selected.",
    );
    expect(say({ type: "selected", shapeId: "shape-3", vertex: null })).toBe(
      "Circle 1 selected.",
    );
  });

  it("announces undo, redo and a link that loaded shapes", () => {
    expect(say({ type: "undone" })).toBe("Undone.");
    expect(say({ type: "redone" })).toBe("Redone.");
    expect(say({ type: "loaded", count: 1 })).toBe(
      "1 shape loaded from the link.",
    );
    expect(say({ type: "loaded", count: 2 })).toBe(
      "2 shapes loaded from the link.",
    );
  });

  it("falls back to a plain sentence when the shape is gone", () => {
    expect(say({ type: "vertex-added", shapeId: "gone", count: 2 }, [])).toBe(
      "Point 2 added.",
    );
    expect(say({ type: "finished", shapeId: "gone" }, [])).toBeNull();
  });

  it("works from a real reducer event", () => {
    const state = drawReducer(initialDrawState, {
      type: "addVertex",
      at: p(1, 1),
    });
    expect(announceDrawEvent(state.lastEvent, state.shapes, "metric")).toBe(
      "Point 1 added to Polygon 1.",
    );
  });
});
