// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  announceDrawEvent,
  DRAW_ISSUE_MESSAGES,
  describeShapeImport,
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

  it("leaves an import to the words of its own result", () => {
    expect(say({ type: "imported" })).toBeNull();
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

describe("describeShapeImport", () => {
  const point = { kind: "point" as const, vertices: [p(1, 1)] };

  it("says how many shapes were imported", () => {
    expect(
      describeShapeImport({
        ok: true,
        shapes: [point],
        skipped: {},
        holesDropped: 0,
      }),
    ).toBe("1 shape imported.");
    expect(
      describeShapeImport({
        ok: true,
        shapes: [point, point, point],
        skipped: {},
        holesDropped: 0,
      }),
    ).toBe("3 shapes imported.");
  });

  it("says how many were skipped and why, and which holes were left out", () => {
    expect(
      describeShapeImport({
        ok: true,
        shapes: [point],
        skipped: { "self-intersecting": 1, "out-of-range": 2 },
        holesDropped: 2,
      }),
    ).toBe(
      "1 shape imported. 3 skipped: 1 with edges that cross, 2 with a position outside the world. Holes in 2 polygons were left out.",
    );
  });

  it("names every reason a shape is skipped", () => {
    const reasons = [
      "self-intersecting",
      "degenerate",
      "too-few-vertices",
      "radius-missing",
      "radius-too-large",
      "out-of-range",
      "too-many-points",
      "malformed",
      "unsupported",
    ] as const;
    for (const reason of reasons) {
      const text = describeShapeImport({
        ok: true,
        shapes: [],
        skipped: { [reason]: 1 },
        holesDropped: 0,
      });
      expect(text).toMatch(/^No shapes imported\. 1 skipped: 1 (with|of) \w/);
    }
    expect(
      describeShapeImport({
        ok: true,
        shapes: [],
        skipped: { "too-many-points": 1 },
        holesDropped: 0,
      }),
    ).toContain("more than 1,000 points");
  });

  it("says a file with no shapes holds none", () => {
    expect(
      describeShapeImport({
        ok: true,
        shapes: [],
        skipped: {},
        holesDropped: 0,
      }),
    ).toBe("The file holds no shapes.");
    expect(
      describeShapeImport({
        ok: true,
        shapes: [point],
        skipped: {},
        holesDropped: 1,
      }),
    ).toBe("1 shape imported. Holes in 1 polygon were left out.");
  });

  it("says why a file was refused and what to do", () => {
    expect(describeShapeImport({ ok: false, refusal: "drawing-full" })).toBe(
      "That would make more than 1,000 shapes. Delete some shapes first, or import a smaller file.",
    );
    expect(describeShapeImport({ ok: false, refusal: "empty" })).toBe(
      "The file is empty.",
    );
    expect(describeShapeImport({ ok: false, refusal: "too-large" })).toBe(
      "The file is larger than 1 MB. Split it into smaller files.",
    );
    expect(describeShapeImport({ ok: false, refusal: "too-deep" })).toBe(
      "The file is nested too deeply to read. Check that it is GeoJSON.",
    );
    expect(describeShapeImport({ ok: false, refusal: "not-recognised" })).toBe(
      "This is not GeoJSON, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .wkt, .txt or .csv file.",
    );
    expect(
      describeShapeImport({
        ok: false,
        refusal: "wkt-unreadable",
        detail: 'Expected ")" at position 33.',
      }),
    ).toBe(
      'The WKT could not be read, so none of the file was imported. Expected ")" at position 33.',
    );
    expect(describeShapeImport({ ok: false, refusal: "too-many-shapes" })).toBe(
      "The file holds more than 500 shapes. Import at most 500 at a time.",
    );
    expect(describeShapeImport({ ok: false, refusal: "too-many-points" })).toBe(
      "The file holds more than 10,000 points. Simplify the shapes or split the file.",
    );
  });
});
