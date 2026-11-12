// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  DRAW_KEY_HELP,
  DRAW_NUDGE_PX,
  DRAW_NUDGE_PX_LARGE,
  type DrawKeyEvent,
  drawKeyCommand,
} from "./keys";
import {
  type DrawAction,
  type DrawState,
  drawReducer,
  initialDrawState,
} from "./reducer";

const p = (lng: number, lat: number) => ({ lat, lng });

function key(
  name: string,
  modifiers: Partial<Omit<DrawKeyEvent, "key">> = {},
): DrawKeyEvent {
  return {
    key: name,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  };
}

function run(
  actions: readonly DrawAction[],
  from = initialDrawState,
): DrawState {
  return actions.reduce(drawReducer, from);
}

const TRIANGLE: DrawAction[] = [
  { type: "addVertex", at: p(0, 0) },
  { type: "addVertex", at: p(0.01, 0) },
  { type: "addVertex", at: p(0, 0.01) },
  { type: "finish" },
];

const finished = run(TRIANGLE);
const shapeId = finished.shapes[0]?.id ?? "";
const withVertex = drawReducer(finished, {
  type: "select",
  shapeId,
  vertex: 1,
});
const drawing = run([
  { type: "addVertex", at: p(0, 0) },
  { type: "addVertex", at: p(1, 1) },
]);

describe("arrows", () => {
  it("move a selected vertex by a small step, or a large one with Shift", () => {
    expect(drawKeyCommand(withVertex, key("ArrowRight"))).toEqual({
      type: "nudge",
      dx: DRAW_NUDGE_PX,
      dy: 0,
    });
    expect(
      drawKeyCommand(withVertex, key("ArrowUp", { shiftKey: true })),
    ).toEqual({
      type: "nudge",
      dx: 0,
      dy: -DRAW_NUDGE_PX_LARGE,
    });
    expect(drawKeyCommand(withVertex, key("ArrowLeft"))).toEqual({
      type: "nudge",
      dx: -DRAW_NUDGE_PX,
      dy: 0,
    });
    expect(drawKeyCommand(withVertex, key("ArrowDown"))).toEqual({
      type: "nudge",
      dx: 0,
      dy: DRAW_NUDGE_PX,
    });
  });

  it("are left to the map when no vertex is selected", () => {
    expect(drawKeyCommand(finished, key("ArrowRight"))).toBeNull();
    expect(drawKeyCommand(drawing, key("ArrowRight"))).toBeNull();
    expect(drawKeyCommand(initialDrawState, key("ArrowRight"))).toBeNull();
  });
});

describe("Enter", () => {
  it("finishes a shape being drawn", () => {
    expect(drawKeyCommand(drawing, key("Enter"))).toEqual({
      type: "dispatch",
      action: { type: "finish" },
    });
  });

  it("does nothing when there is no shape being drawn", () => {
    expect(drawKeyCommand(finished, key("Enter"))).toBeNull();
  });
});

describe("Escape", () => {
  it("steps back one level and is otherwise left to close the tool", () => {
    expect(drawKeyCommand(withVertex, key("Escape"))).toEqual({
      type: "dispatch",
      action: { type: "select", shapeId },
    });
    expect(drawKeyCommand(drawing, key("Escape"))).toEqual({
      type: "dispatch",
      action: { type: "cancel" },
    });
    expect(drawKeyCommand(initialDrawState, key("Escape"))).toBeNull();
  });
});

describe("Delete and Backspace", () => {
  it("remove the selected vertex of a polygon", () => {
    const expected = {
      type: "dispatch",
      action: { type: "removeVertex", shapeId, index: 1 },
    };
    expect(drawKeyCommand(withVertex, key("Delete"))).toEqual(expected);
    expect(drawKeyCommand(withVertex, key("Backspace"))).toEqual(expected);
  });

  it("remove the last vertex of a shape being drawn", () => {
    const id = drawing.shapes[0]?.id;
    expect(drawKeyCommand(drawing, key("Backspace"))).toEqual({
      type: "dispatch",
      action: { type: "removeVertex", shapeId: id, index: 1 },
    });
  });

  it("delete a selected shape that has no vertex selected", () => {
    const selected = drawReducer(finished, { type: "select", shapeId });
    expect(drawKeyCommand(selected, key("Delete"))).toEqual({
      type: "dispatch",
      action: { type: "deleteShape", shapeId },
    });
  });

  it("delete a point or a circle when its only vertex is selected", () => {
    const point = run([
      { type: "setMode", kind: "point" },
      { type: "addVertex", at: p(1, 1) },
    ]);
    const id = point.shapes[0]?.id ?? "";
    const selected = drawReducer(point, {
      type: "select",
      shapeId: id,
      vertex: 0,
    });
    expect(drawKeyCommand(selected, key("Delete"))).toEqual({
      type: "dispatch",
      action: { type: "deleteShape", shapeId: id },
    });
  });

  it("do nothing with nothing selected", () => {
    expect(drawKeyCommand(initialDrawState, key("Delete"))).toBeNull();
  });
});

describe("undo and redo", () => {
  it("use Control or Command with Z, Shift with Z and Y", () => {
    expect(drawKeyCommand(drawing, key("z", { ctrlKey: true }))).toEqual({
      type: "dispatch",
      action: { type: "undo" },
    });
    expect(drawKeyCommand(drawing, key("z", { metaKey: true }))).toEqual({
      type: "dispatch",
      action: { type: "undo" },
    });
    expect(
      drawKeyCommand(drawing, key("Z", { ctrlKey: true, shiftKey: true })),
    ).toEqual({ type: "dispatch", action: { type: "redo" } });
    expect(drawKeyCommand(drawing, key("y", { ctrlKey: true }))).toEqual({
      type: "dispatch",
      action: { type: "redo" },
    });
  });

  it("leave other shortcuts and Alt combinations alone", () => {
    expect(drawKeyCommand(drawing, key("c", { ctrlKey: true }))).toBeNull();
    expect(
      drawKeyCommand(withVertex, key("ArrowRight", { altKey: true })),
    ).toBeNull();
    expect(
      drawKeyCommand(withVertex, key("Delete", { ctrlKey: true })),
    ).toBeNull();
  });
});

describe("vertex stepping and placing", () => {
  it("steps with the square bracket keys when a shape is selected", () => {
    expect(drawKeyCommand(withVertex, key("]"))).toEqual({
      type: "dispatch",
      action: { type: "stepVertex", delta: 1 },
    });
    expect(drawKeyCommand(withVertex, key("["))).toEqual({
      type: "dispatch",
      action: { type: "stepVertex", delta: -1 },
    });
    expect(drawKeyCommand(initialDrawState, key("]"))).toBeNull();
  });

  it("places at the map centre with Space", () => {
    expect(drawKeyCommand(withVertex, key(" "))).toEqual({
      type: "placeAtCentre",
    });
    expect(drawKeyCommand(initialDrawState, key(" "))).toEqual({
      type: "placeAtCentre",
    });
  });

  it("ignores other keys", () => {
    expect(drawKeyCommand(withVertex, key("a"))).toBeNull();
  });
});

describe("DRAW_KEY_HELP", () => {
  it("describes each key with no empty text", () => {
    expect(DRAW_KEY_HELP.length).toBeGreaterThan(4);
    for (const entry of DRAW_KEY_HELP) {
      expect(entry.keys).not.toBe("");
      expect(entry.description).not.toBe("");
    }
  });
});
