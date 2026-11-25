// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { formatMessage } from "../messages/formatMessage";
import type { Message } from "../ports/messages";
import {
  announceDrawEvent,
  DRAW_ISSUE_MESSAGES,
  describeAxisSuggestion,
  describeShapeImport,
  describeShapeMeasure,
  formatShapeMeasure,
  hintFor,
} from "./describe";
import { parseShapeFile } from "./import";
import { type DrawEvent, drawReducer, initialDrawState } from "./reducer";
import type { DrawShape } from "./types";

const messages = new FakeMessageCatalogue();

/** The English text of a message, as the live region would say it; null stays null. */
const english = (value: Message | null) =>
  value === null ? null : formatMessage(messages, value);

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

describe("formatShapeMeasure numbering", () => {
  const persian = (numberingSystem?: string) =>
    new FakeMessageCatalogue({ language: "fa", numberingSystem });

  it("writes native digits by default", () => {
    expect(formatShapeMeasure(LINE, "metric", persian())).toMatch(
      /[\u06F0-\u06F9]/u,
    );
  });

  it("writes Latin digits when the catalogue asks for them", () => {
    expect(
      formatShapeMeasure(LINE, "metric", persian("latn")).replace(
        /[\u2066-\u2069]/g,
        "",
      ),
    ).toMatch(/^[\d.,٫٬]+ (m|km)$/);
    expect(formatShapeMeasure(SQUARE, "metric", persian("latn"))).not.toMatch(
      /[\u06F0-\u06F9]/u,
    );
    expect(formatShapeMeasure(CIRCLE, "metric", persian("latn"))).not.toMatch(
      /[\u06F0-\u06F9]/u,
    );
  });
});

describe("formatShapeMeasure", () => {
  it("shows a polygon's area and perimeter in short units", () => {
    expect(formatShapeMeasure(SQUARE, "metric", messages)).toMatch(
      /^[\d.,]+ (ha|km²) · [\d.,]+ (m|km)$/,
    );
    expect(formatShapeMeasure(SQUARE, "imperial", messages)).toMatch(
      /(ac|ft²)/,
    );
  });

  it("shows a line's length", () => {
    expect(formatShapeMeasure(LINE, "metric", messages)).toMatch(
      /^[\d.,]+ (m|km)$/,
    );
  });

  it("shows a circle's radius and area", () => {
    expect(formatShapeMeasure(CIRCLE, "metric", messages)).toBe(
      "500 m radius · 78.5 ha",
    );
  });

  it("is empty for a point, and for a shape with nothing to measure yet", () => {
    expect(formatShapeMeasure(POINT, "metric", messages)).toBe("");
    expect(
      formatShapeMeasure(
        { ...LINE, vertices: [p(0, 0)], done: false },
        "metric",
        messages,
      ),
    ).toBe("");
  });
});

describe("describeShapeMeasure", () => {
  it("speaks units in words", () => {
    expect(english(describeShapeMeasure(SQUARE, "metric"))).toMatch(
      /^area [\d.,]+ [a-z ]+, perimeter [\d.,]+ (metres|kilometres)$/,
    );
    expect(english(describeShapeMeasure(LINE, "metric"))).toMatch(
      /^length [\d.,]+ (metres|kilometres)$/,
    );
    expect(english(describeShapeMeasure(CIRCLE, "metric"))).toBe(
      "radius 500 metres, area 78.5 hectares",
    );
    expect(describeShapeMeasure(POINT, "metric")).toBeNull();
  });
});

describe("hintFor", () => {
  it("says how to add the next point for each mode", () => {
    expect(english(hintFor("polygon"))).toContain("Tap the map");
    expect(english(hintFor("circle"))).toContain("radius");
    expect(english(hintFor("point"))).toContain("Tap the map");
  });
});

describe("DRAW_ISSUE_MESSAGES", () => {
  it("has plain advice for every issue", () => {
    for (const issue of Object.values(DRAW_ISSUE_MESSAGES)) {
      const text = english(issue) ?? "";
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain("—");
    }
  });
});

describe("announceDrawEvent", () => {
  const say = (event: DrawEvent | null, shapes = SHAPES) =>
    announceDrawEvent(event, shapes, "metric");

  it("says nothing without an event or for a quiet one", () => {
    expect(english(say(null))).toBeNull();
    expect(english(say({ type: "mode", kind: "line" }))).toBeNull();
  });

  it("announces points added with the running measure", () => {
    expect(
      english(say({ type: "vertex-added", shapeId: "shape-1", count: 4 })),
    ).toMatch(/^Point 4 added to Polygon 1\. Area /);
    const started = [{ ...LINE, vertices: [p(0, 0)], done: false }];
    expect(
      english(
        say({ type: "vertex-added", shapeId: "shape-2", count: 1 }, started),
      ),
    ).toBe("Point 1 added to Line 1.");
  });

  it("announces a finished shape with its measures", () => {
    expect(english(say({ type: "finished", shapeId: "shape-1" }))).toMatch(
      /^Polygon 1 finished\. Area /,
    );
    expect(english(say({ type: "finished", shapeId: "shape-4" }))).toBe(
      "Point 1 added.",
    );
    expect(english(say({ type: "finished", shapeId: "shape-3" }))).toBe(
      "Circle 1 finished. Radius 500 metres, area 78.5 hectares.",
    );
  });

  it("announces why something was refused", () => {
    expect(say({ type: "rejected", issue: "self-intersecting" })).toBe(
      DRAW_ISSUE_MESSAGES["self-intersecting"],
    );
  });

  it("announces discarding, removing, inserting, deleting and clearing", () => {
    expect(english(say({ type: "discarded", kind: "polygon" }))).toBe(
      "Discarded the unfinished polygon.",
    );
    expect(
      english(say({ type: "vertex-removed", shapeId: "shape-1", count: 3 })),
    ).toBe("Point removed from Polygon 1. 3 points left.");
    expect(
      english(
        say({
          type: "vertex-inserted",
          shapeId: "shape-1",
          index: 2,
          count: 5,
        }),
      ),
    ).toBe("Point added to Polygon 1 as point 3 of 5.");
    expect(english(say({ type: "deleted", label: "Polygon 1" }))).toBe(
      "Deleted Polygon 1. Undo brings it back.",
    );
    expect(english(say({ type: "cleared", count: 1 }))).toBe(
      "Deleted 1 shape.",
    );
    expect(english(say({ type: "cleared", count: 3 }))).toBe(
      "Deleted all 3 shapes.",
    );
  });

  it("announces a move with the new measure", () => {
    expect(
      english(say({ type: "vertex-moved", shapeId: "shape-2", index: 1 })),
    ).toMatch(/^Point 2 of Line 1 moved\. Length /);
    expect(
      english(say({ type: "vertex-moved", shapeId: "shape-3", index: 0 })),
    ).toMatch(/^Circle 1 changed\. Radius 500 metres/);
  });

  it("announces selection", () => {
    expect(
      english(say({ type: "selected", shapeId: "shape-1", vertex: null })),
    ).toBe("Polygon 1 selected. 4 points.");
    expect(
      english(say({ type: "selected", shapeId: "shape-1", vertex: 1 })),
    ).toBe("Point 2 of 4 selected in Polygon 1.");
    expect(
      english(say({ type: "selected", shapeId: "shape-4", vertex: null })),
    ).toBe("Point 1 selected.");
    expect(
      english(say({ type: "selected", shapeId: "shape-3", vertex: null })),
    ).toBe("Circle 1 selected.");
  });

  it("announces undo, redo and a link that loaded shapes", () => {
    expect(english(say({ type: "undone" }))).toBe("Undone.");
    expect(english(say({ type: "redone" }))).toBe("Redone.");
    expect(english(say({ type: "loaded", count: 1 }))).toBe(
      "1 shape loaded from the link.",
    );
    expect(english(say({ type: "loaded", count: 2 }))).toBe(
      "2 shapes loaded from the link.",
    );
  });

  it("leaves an import to the words of its own result", () => {
    expect(english(say({ type: "imported" }))).toBeNull();
  });

  it("falls back to a plain sentence when the shape is gone", () => {
    expect(
      english(say({ type: "vertex-added", shapeId: "gone", count: 2 }, [])),
    ).toBe("Point 2 added.");
    expect(english(say({ type: "finished", shapeId: "gone" }, []))).toBeNull();
  });

  it("works from a real reducer event", () => {
    const state = drawReducer(initialDrawState, {
      type: "addVertex",
      at: p(1, 1),
    });
    expect(
      english(announceDrawEvent(state.lastEvent, state.shapes, "metric")),
    ).toBe("Point 1 added to Polygon 1.");
  });
});

describe("describeAxisSuggestion", () => {
  it("says the first position fits only the other order, for each order", () => {
    expect(english(describeAxisSuggestion("lat-lng"))).toBe(
      "No shapes imported. The first position is outside the world as longitude, latitude, but it fits as latitude, longitude.",
    );
    expect(english(describeAxisSuggestion("lng-lat"))).toBe(
      "No shapes imported. The first position is outside the world as latitude, longitude, but it fits as longitude, latitude.",
    );
  });
});

describe("describeShapeImport", () => {
  const point = { kind: "point" as const, vertices: [p(1, 1)] };

  it("says how many shapes were imported", () => {
    expect(
      english(
        describeShapeImport({
          ok: true,
          shapes: [point],
          skipped: {},
          holesDropped: 0,
        }),
      ),
    ).toBe("1 shape imported.");
    expect(
      english(
        describeShapeImport({
          ok: true,
          shapes: [point, point, point],
          skipped: {},
          holesDropped: 0,
        }),
      ),
    ).toBe("3 shapes imported.");
  });

  it("says how many were skipped and why, and which holes were left out", () => {
    expect(
      english(
        describeShapeImport({
          ok: true,
          shapes: [point],
          skipped: { "self-intersecting": 1, "out-of-range": 2 },
          holesDropped: 2,
        }),
      ),
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
      "other-srid",
    ] as const;
    for (const reason of reasons) {
      const text = english(
        describeShapeImport({
          ok: true,
          shapes: [],
          skipped: { [reason]: 1 },
          holesDropped: 0,
        }),
      );
      expect(text).toMatch(
        /^No shapes imported\. 1 skipped: 1 (with|of|in) \w/,
      );
    }
    expect(
      english(
        describeShapeImport({
          ok: true,
          shapes: [],
          skipped: { "too-many-points": 1 },
          holesDropped: 0,
        }),
      ),
    ).toContain("more than 1,000 points");
  });

  it("says, end to end, why a file of another SRID is refused or skipped", () => {
    expect(
      english(describeShapeImport(parseShapeFile("SRID=3857;POINT (1 2)"))),
    ).toBe(
      "The WKT could not be read, so none of the file was imported. Only SRID 4326 (WGS 84) is supported, not SRID 3857.",
    );
    expect(
      english(
        describeShapeImport(
          parseShapeFile("wkt\nSRID=4326;POINT (1 2)\nSRID=3857;POINT (3 4)\n"),
        ),
      ),
    ).toBe(
      "1 shape imported. 1 skipped: 1 in a coordinate system other than SRID 4326.",
    );
  });

  it("says a file with no shapes holds none", () => {
    expect(
      english(
        describeShapeImport({
          ok: true,
          shapes: [],
          skipped: {},
          holesDropped: 0,
        }),
      ),
    ).toBe("The file holds no shapes.");
    expect(
      english(
        describeShapeImport({
          ok: true,
          shapes: [point],
          skipped: {},
          holesDropped: 1,
        }),
      ),
    ).toBe("1 shape imported. Holes in 1 polygon were left out.");
  });

  it("says why a file was refused and what to do", () => {
    expect(
      english(describeShapeImport({ ok: false, refusal: "drawing-full" })),
    ).toBe(
      "That would make more than 1,000 shapes. Delete some shapes first, or import a smaller file.",
    );
    expect(english(describeShapeImport({ ok: false, refusal: "empty" }))).toBe(
      "The file is empty.",
    );
    expect(
      english(describeShapeImport({ ok: false, refusal: "too-large" })),
    ).toBe("The file is larger than 1 MB. Split it into smaller files.");
    expect(
      english(describeShapeImport({ ok: false, refusal: "too-deep" })),
    ).toBe(
      "The file is nested too deeply to read. Check that it is a GeoJSON or GPX file.",
    );
    expect(
      english(describeShapeImport({ ok: false, refusal: "not-recognised" })),
    ).toBe(
      "This is not GeoJSON, GPX, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .gpx, .wkt, .txt or .csv file.",
    );
    expect(
      english(describeShapeImport({ ok: false, refusal: "gpx-unreadable" })),
    ).toBe("The GPX could not be read, so none of the file was imported.");
    expect(
      english(
        describeShapeImport({
          ok: false,
          refusal: "wkt-unreadable",
          detail: 'Expected ")" at position 33.',
        }),
      ),
    ).toBe(
      'The WKT could not be read, so none of the file was imported. Expected ")" at position 33.',
    );
    expect(
      english(describeShapeImport({ ok: false, refusal: "too-many-shapes" })),
    ).toBe(
      "The file holds more than 500 shapes. Import at most 500 at a time.",
    );
    expect(
      english(describeShapeImport({ ok: false, refusal: "too-many-points" })),
    ).toBe(
      "The file holds more than 10,000 points. Simplify the shapes or split the file.",
    );
  });
});

describe("draw messages as keys and parameters", () => {
  it("returns keys with the shape's label and counts, not English", () => {
    expect(
      announceDrawEvent(
        { type: "vertex-removed", shapeId: "shape-1", count: 3 },
        SHAPES,
        "metric",
      ),
    ).toEqual({
      key: "draw.vertexRemoved",
      params: { label: "Polygon 1", count: 3 },
    });
    expect(hintFor("line")).toEqual({ key: "draw.hint.line", params: {} });
  });

  it("sends each number to the catalogue, so a limit is grouped for the language", () => {
    const german = new FakeMessageCatalogue({ language: "de" });
    expect(
      formatMessage(
        german,
        describeShapeImport({ ok: false, refusal: "drawing-full" }),
      ),
    ).toBe(
      "That would make more than 1.000 shapes. Delete some shapes first, or import a smaller file.",
    );
  });

  it("writes the short measure with the language's figures and its own word for radius", () => {
    const german = new FakeMessageCatalogue({
      language: "de",
      overrides: { "draw.measure.radiusAndArea": "Radius {radius} · {area}" },
    });
    expect(formatShapeMeasure(CIRCLE, "metric", german)).toBe(
      "Radius 500 m · 78,5 ha",
    );
  });
});
