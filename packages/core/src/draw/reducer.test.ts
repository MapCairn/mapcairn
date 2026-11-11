import { describe, expect, it } from "vitest";
import {
  DRAW_HISTORY_LIMIT,
  type DrawAction,
  type DrawState,
  draftOf,
  drawReducer,
  escapeAction,
  initialDrawState,
  selectedShape,
} from "./reducer";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

function run(
  actions: readonly DrawAction[],
  from: DrawState = initialDrawState,
): DrawState {
  return actions.reduce(drawReducer, from);
}

const add = (lng: number, lat: number): DrawAction => ({
  type: "addVertex",
  at: p(lng, lat),
});

const TRIANGLE = [add(0, 0), add(0.01, 0), add(0, 0.01)];

function onlyShape(state: DrawState): DrawShape {
  const [shape] = state.shapes;
  if (!shape) {
    throw new Error("Expected a shape.");
  }
  return shape;
}

describe("initial state", () => {
  it("starts empty, in polygon mode, with nothing selected", () => {
    expect(initialDrawState.shapes).toEqual([]);
    expect(initialDrawState.mode).toBe("polygon");
    expect(initialDrawState.selection).toBeNull();
    expect(draftOf(initialDrawState)).toBeNull();
    expect(selectedShape(initialDrawState)).toBeNull();
  });
});

describe("setMode", () => {
  it("changes the mode that new shapes use", () => {
    const state = run([{ type: "setMode", kind: "line" }]);
    expect(state.mode).toBe("line");
    expect(state.lastEvent).toEqual({ type: "mode", kind: "line" });
  });

  it("does nothing when the mode is unchanged", () => {
    expect(run([{ type: "setMode", kind: "polygon" }])).toBe(initialDrawState);
  });

  it("discards an unfinished shape, which undo brings back", () => {
    const drawing = run([add(0, 0), add(1, 1)]);
    const switched = drawReducer(drawing, { type: "setMode", kind: "line" });
    expect(switched.shapes).toEqual([]);
    expect(switched.lastEvent).toEqual({ type: "discarded", kind: "polygon" });
    const undone = drawReducer(switched, { type: "undo" });
    expect(draftOf(undone)?.vertices).toHaveLength(2);
  });
});

describe("addVertex", () => {
  it("starts an unfinished polygon with its first vertex selected as a shape", () => {
    const state = run([add(0, 0)]);
    const draft = draftOf(state);
    expect(draft?.kind).toBe("polygon");
    expect(draft?.label).toBe("Polygon 1");
    expect(draft?.vertices).toEqual([p(0, 0)]);
    expect(state.selection).toEqual({ shapeId: draft?.id, vertex: null });
    expect(state.lastEvent).toEqual({
      type: "vertex-added",
      shapeId: draft?.id,
      count: 1,
    });
  });

  it("appends vertices to the unfinished shape", () => {
    const state = run(TRIANGLE);
    expect(state.shapes).toHaveLength(1);
    expect(draftOf(state)?.vertices).toHaveLength(3);
  });

  it("ignores a vertex at the same place as the last one", () => {
    const state = run([add(0, 0), add(0, 0)]);
    expect(draftOf(state)?.vertices).toHaveLength(1);
  });

  it("creates a finished point at once", () => {
    const state = run([{ type: "setMode", kind: "point" }, add(2.35, 48.85)]);
    const shape = onlyShape(state);
    expect(shape).toMatchObject({ kind: "point", done: true });
    expect(draftOf(state)).toBeNull();
    expect(state.lastEvent).toEqual({ type: "finished", shapeId: shape.id });
  });

  it("adds a second point as a second shape", () => {
    const state = run([
      { type: "setMode", kind: "point" },
      add(0, 0),
      add(1, 1),
    ]);
    expect(state.shapes.map((shape) => shape.label)).toEqual([
      "Point 1",
      "Point 2",
    ]);
  });

  it("sets a circle's radius from the second tap and finishes it", () => {
    const state = run([
      { type: "setMode", kind: "circle" },
      add(36.82, -1.29),
      add(36.83, -1.29),
    ]);
    const shape = onlyShape(state);
    expect(shape.done).toBe(true);
    expect(shape.radiusMetres).toBeGreaterThan(1000);
    expect(shape.radiusMetres).toBeLessThan(1200);
    expect(shape.vertices).toEqual([p(36.82, -1.29)]);
  });

  it("rejects a circle radius of nothing and keeps the centre", () => {
    const state = run([
      { type: "setMode", kind: "circle" },
      add(36.82, -1.29),
      add(36.82, -1.29),
    ]);
    expect(draftOf(state)?.radiusMetres).toBeUndefined();
    expect(state.lastEvent).toEqual({
      type: "rejected",
      issue: "degenerate",
    });
  });

  it("numbers shapes of each kind separately", () => {
    const state = run([
      ...TRIANGLE,
      { type: "finish" },
      { type: "setMode", kind: "line" },
      add(0, 0),
      add(1, 1),
      { type: "finish" },
      { type: "setMode", kind: "polygon" },
      add(5, 5),
    ]);
    expect(state.shapes.map((shape) => shape.label)).toEqual([
      "Polygon 1",
      "Line 1",
      "Polygon 2",
    ]);
  });

  it("gives every shape a different id", () => {
    const state = run([
      { type: "setMode", kind: "point" },
      add(0, 0),
      add(1, 1),
      add(2, 2),
    ]);
    expect(new Set(state.shapes.map((shape) => shape.id)).size).toBe(3);
  });
});

describe("finish", () => {
  it("finishes a valid polygon and selects it", () => {
    const state = run([...TRIANGLE, { type: "finish" }]);
    const shape = onlyShape(state);
    expect(shape.done).toBe(true);
    expect(draftOf(state)).toBeNull();
    expect(state.selection).toEqual({ shapeId: shape.id, vertex: null });
    expect(state.lastEvent).toEqual({ type: "finished", shapeId: shape.id });
  });

  it("refuses a polygon with fewer than three vertices", () => {
    const state = run([add(0, 0), add(1, 0), { type: "finish" }]);
    expect(draftOf(state)).not.toBeNull();
    expect(state.lastEvent).toEqual({
      type: "rejected",
      issue: "too-few-vertices",
    });
  });

  it("refuses a polygon whose edges cross", () => {
    const state = run([
      add(0, 0),
      add(2, 2),
      add(2, 0),
      add(0, 2),
      { type: "finish" },
    ]);
    expect(draftOf(state)).not.toBeNull();
    expect(state.lastEvent).toEqual({
      type: "rejected",
      issue: "self-intersecting",
    });
  });

  it("finishes a line of two vertices", () => {
    const state = run([
      { type: "setMode", kind: "line" },
      add(0, 0),
      add(1, 1),
      { type: "finish" },
    ]);
    expect(onlyShape(state).done).toBe(true);
  });

  it("refuses a circle that has no radius yet", () => {
    const state = run([
      { type: "setMode", kind: "circle" },
      add(0, 0),
      { type: "finish" },
    ]);
    expect(state.lastEvent).toEqual({
      type: "rejected",
      issue: "radius-missing",
    });
  });

  it("does nothing without an unfinished shape", () => {
    expect(drawReducer(initialDrawState, { type: "finish" })).toBe(
      initialDrawState,
    );
  });
});

describe("cancel", () => {
  it("discards the unfinished shape and keeps finished ones", () => {
    const state = run([
      ...TRIANGLE,
      { type: "finish" },
      add(5, 5),
      add(6, 6),
      { type: "cancel" },
    ]);
    expect(state.shapes).toHaveLength(1);
    expect(state.lastEvent).toEqual({ type: "discarded", kind: "polygon" });
    expect(state.selection?.shapeId).toBeUndefined();
  });

  it("does nothing without an unfinished shape", () => {
    expect(drawReducer(initialDrawState, { type: "cancel" })).toBe(
      initialDrawState,
    );
  });
});

describe("moveVertex", () => {
  const triangle = run([...TRIANGLE, { type: "finish" }]);
  const id = onlyShape(triangle).id;

  it("moves a vertex", () => {
    const state = drawReducer(triangle, {
      type: "moveVertex",
      shapeId: id,
      index: 1,
      to: p(0.02, 0),
    });
    expect(onlyShape(state).vertices[1]).toEqual(p(0.02, 0));
    expect(state.lastEvent).toEqual({
      type: "vertex-moved",
      shapeId: id,
      index: 1,
    });
  });

  it("ignores an unknown shape or an out-of-range index", () => {
    expect(
      drawReducer(triangle, {
        type: "moveVertex",
        shapeId: "nope",
        index: 0,
        to: p(1, 1),
      }),
    ).toBe(triangle);
    expect(
      drawReducer(triangle, {
        type: "moveVertex",
        shapeId: id,
        index: 9,
        to: p(1, 1),
      }),
    ).toBe(triangle);
  });

  it("ignores a position that is not finite", () => {
    expect(
      drawReducer(triangle, {
        type: "moveVertex",
        shapeId: id,
        index: 0,
        to: p(Number.NaN, 0),
      }),
    ).toBe(triangle);
  });

  it("is one undo step for a whole drag, and a new one after another action", () => {
    const dragged = run(
      [
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.011, 0),
          coalesceKey: "drag:1",
        },
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.012, 0),
          coalesceKey: "drag:1",
        },
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.013, 0),
          coalesceKey: "drag:1",
        },
      ],
      triangle,
    );
    expect(dragged.past.length).toBe(triangle.past.length + 1);
    const undone = drawReducer(dragged, { type: "undo" });
    expect(onlyShape(undone).vertices[1]).toEqual(p(0.01, 0));

    const second = run(
      [
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.011, 0),
          coalesceKey: "drag:1",
        },
        { type: "select", shapeId: id, vertex: 0 },
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.012, 0),
          coalesceKey: "drag:1",
        },
      ],
      triangle,
    );
    expect(second.past.length).toBe(triangle.past.length + 2);
  });

  it("moves a circle's centre", () => {
    const circle = run([
      { type: "setMode", kind: "circle" },
      add(0, 0),
      add(0.01, 0),
    ]);
    const circleId = onlyShape(circle).id;
    const moved = drawReducer(circle, {
      type: "moveVertex",
      shapeId: circleId,
      index: 0,
      to: p(5, 5),
    });
    expect(onlyShape(moved).vertices[0]).toEqual(p(5, 5));
    expect(onlyShape(moved).radiusMetres).toBe(onlyShape(circle).radiusMetres);
  });
});

describe("setRadius", () => {
  const circle = run([
    { type: "setMode", kind: "circle" },
    add(2.35, 48.85),
    add(2.36, 48.85),
  ]);
  const id = onlyShape(circle).id;

  it("sets the radius of a circle", () => {
    const state = drawReducer(circle, {
      type: "setRadius",
      shapeId: id,
      metres: 250,
    });
    expect(onlyShape(state).radiusMetres).toBe(250);
  });

  it("rejects a radius that is zero, negative, not finite or too large", () => {
    for (const metres of [0, -5, Number.NaN, 20_000_000]) {
      const state = drawReducer(circle, {
        type: "setRadius",
        shapeId: id,
        metres,
      });
      expect(onlyShape(state).radiusMetres).toBe(
        onlyShape(circle).radiusMetres,
      );
      expect(state.lastEvent?.type).toBe("rejected");
    }
  });

  it("ignores a shape that is not a circle", () => {
    const polygon = run([...TRIANGLE, { type: "finish" }]);
    expect(
      drawReducer(polygon, {
        type: "setRadius",
        shapeId: onlyShape(polygon).id,
        metres: 5,
      }),
    ).toBe(polygon);
  });

  it("coalesces nudges of one radius into one undo step", () => {
    const state = run(
      [
        { type: "setRadius", shapeId: id, metres: 300, coalesceKey: "r" },
        { type: "setRadius", shapeId: id, metres: 310, coalesceKey: "r" },
      ],
      circle,
    );
    expect(state.past.length).toBe(circle.past.length + 1);
  });
});

describe("insertVertex", () => {
  const polygon = run([...TRIANGLE, { type: "finish" }]);
  const id = onlyShape(polygon).id;

  it("inserts a vertex at an index", () => {
    const state = drawReducer(polygon, {
      type: "insertVertex",
      shapeId: id,
      index: 1,
      at: p(0.005, -0.001),
    });
    expect(onlyShape(state).vertices).toHaveLength(4);
    expect(onlyShape(state).vertices[1]).toEqual(p(0.005, -0.001));
    expect(state.selection).toEqual({ shapeId: id, vertex: 1 });
    expect(state.lastEvent).toEqual({
      type: "vertex-inserted",
      shapeId: id,
      index: 1,
      count: 4,
    });
  });

  it("is one undo step with the moves of the same drag", () => {
    const state = run(
      [
        {
          type: "insertVertex",
          shapeId: id,
          index: 1,
          at: p(0.005, 0),
          coalesceKey: "drag:7",
        },
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.005, -0.002),
          coalesceKey: "drag:7",
        },
        {
          type: "moveVertex",
          shapeId: id,
          index: 1,
          to: p(0.005, -0.004),
          coalesceKey: "drag:7",
        },
      ],
      polygon,
    );
    expect(state.past.length).toBe(polygon.past.length + 1);
    expect(
      onlyShape(drawReducer(state, { type: "undo" })).vertices,
    ).toHaveLength(3);
  });

  it("inserts after the last vertex of a polygon, on its closing edge", () => {
    const state = drawReducer(polygon, {
      type: "insertVertex",
      shapeId: id,
      index: 3,
      at: p(-0.001, 0.005),
    });
    expect(onlyShape(state).vertices[3]).toEqual(p(-0.001, 0.005));
  });

  it("ignores a point, a circle, an unknown shape or a bad index", () => {
    expect(
      drawReducer(polygon, {
        type: "insertVertex",
        shapeId: "nope",
        index: 1,
        at: p(0, 0),
      }),
    ).toBe(polygon);
    expect(
      drawReducer(polygon, {
        type: "insertVertex",
        shapeId: id,
        index: 0,
        at: p(0, 0),
      }),
    ).toBe(polygon);
    expect(
      drawReducer(polygon, {
        type: "insertVertex",
        shapeId: id,
        index: 9,
        at: p(0, 0),
      }),
    ).toBe(polygon);
    const point = run([{ type: "setMode", kind: "point" }, add(0, 0)]);
    expect(
      drawReducer(point, {
        type: "insertVertex",
        shapeId: onlyShape(point).id,
        index: 1,
        at: p(1, 1),
      }),
    ).toBe(point);
  });
});

describe("removeVertex", () => {
  it("removes a vertex from a polygon of four and selects its neighbour", () => {
    const square = run([
      add(0, 0),
      add(1, 0),
      add(1, 1),
      add(0, 1),
      { type: "finish" },
    ]);
    const id = onlyShape(square).id;
    const state = drawReducer(square, {
      type: "removeVertex",
      shapeId: id,
      index: 3,
    });
    expect(onlyShape(state).vertices).toHaveLength(3);
    expect(state.selection).toEqual({ shapeId: id, vertex: 2 });
    expect(state.lastEvent).toEqual({
      type: "vertex-removed",
      shapeId: id,
      count: 3,
    });
  });

  it("refuses to take a finished polygon below three or a line below two", () => {
    const triangle = run([...TRIANGLE, { type: "finish" }]);
    const refused = drawReducer(triangle, {
      type: "removeVertex",
      shapeId: onlyShape(triangle).id,
      index: 0,
    });
    expect(refused.shapes).toBe(triangle.shapes);
    expect(refused.lastEvent).toEqual({
      type: "rejected",
      issue: "too-few-vertices",
    });

    const line = run([
      { type: "setMode", kind: "line" },
      add(0, 0),
      add(1, 1),
      { type: "finish" },
    ]);
    expect(
      drawReducer(line, {
        type: "removeVertex",
        shapeId: onlyShape(line).id,
        index: 0,
      }).lastEvent,
    ).toEqual({ type: "rejected", issue: "too-few-vertices" });
  });

  it("lets an unfinished shape lose vertices down to nothing", () => {
    const drawing = run([add(0, 0), add(1, 1)]);
    const id = onlyShape(drawing).id;
    const one = drawReducer(drawing, {
      type: "removeVertex",
      shapeId: id,
      index: 1,
    });
    expect(draftOf(one)?.vertices).toHaveLength(1);
    const none = drawReducer(one, {
      type: "removeVertex",
      shapeId: id,
      index: 0,
    });
    expect(none.shapes).toEqual([]);
    expect(none.selection).toBeNull();
  });

  it("ignores an unknown shape, a bad index, a point and a circle", () => {
    const triangle = run([...TRIANGLE, { type: "finish" }]);
    const id = onlyShape(triangle).id;
    expect(
      drawReducer(triangle, { type: "removeVertex", shapeId: "x", index: 0 }),
    ).toBe(triangle);
    expect(
      drawReducer(triangle, { type: "removeVertex", shapeId: id, index: 5 }),
    ).toBe(triangle);
    const point = run([{ type: "setMode", kind: "point" }, add(0, 0)]);
    expect(
      drawReducer(point, {
        type: "removeVertex",
        shapeId: onlyShape(point).id,
        index: 0,
      }),
    ).toBe(point);
  });
});

describe("selection", () => {
  const triangle = run([...TRIANGLE, { type: "finish" }]);
  const id = onlyShape(triangle).id;

  it("selects a shape and a vertex, and deselects", () => {
    const shape = drawReducer(triangle, { type: "select", shapeId: id });
    expect(shape.selection).toEqual({ shapeId: id, vertex: null });
    const vertex = drawReducer(shape, {
      type: "select",
      shapeId: id,
      vertex: 2,
    });
    expect(vertex.selection).toEqual({ shapeId: id, vertex: 2 });
    expect(vertex.lastEvent).toEqual({
      type: "selected",
      shapeId: id,
      vertex: 2,
    });
    expect(selectedShape(vertex)?.id).toBe(id);
    expect(drawReducer(vertex, { type: "deselect" }).selection).toBeNull();
  });

  it("ignores an unknown shape or a vertex that is not there", () => {
    expect(drawReducer(triangle, { type: "select", shapeId: "x" })).toBe(
      triangle,
    );
    expect(
      drawReducer(triangle, { type: "select", shapeId: id, vertex: 7 }),
    ).toBe(triangle);
  });

  it("does not touch the history", () => {
    const state = drawReducer(triangle, { type: "select", shapeId: id });
    expect(state.past).toBe(triangle.past);
  });

  it("steps through vertices and wraps round", () => {
    let state = drawReducer(triangle, { type: "select", shapeId: id });
    state = drawReducer(state, { type: "stepVertex", delta: 1 });
    expect(state.selection?.vertex).toBe(0);
    state = drawReducer(state, { type: "stepVertex", delta: 1 });
    expect(state.selection?.vertex).toBe(1);
    state = drawReducer(state, { type: "stepVertex", delta: -1 });
    state = drawReducer(state, { type: "stepVertex", delta: -1 });
    expect(state.selection?.vertex).toBe(2);
  });

  it("steps backwards from a shape selection to its last vertex", () => {
    const state = run(
      [
        { type: "select", shapeId: id },
        { type: "stepVertex", delta: -1 },
      ],
      triangle,
    );
    expect(state.selection?.vertex).toBe(2);
  });

  it("does nothing to step with no selection", () => {
    expect(
      drawReducer(initialDrawState, { type: "stepVertex", delta: 1 }),
    ).toBe(initialDrawState);
  });
});

describe("deleteShape and clear", () => {
  it("deletes a shape and drops its selection", () => {
    const triangle = run([...TRIANGLE, { type: "finish" }]);
    const id = onlyShape(triangle).id;
    const state = drawReducer(triangle, { type: "deleteShape", shapeId: id });
    expect(state.shapes).toEqual([]);
    expect(state.selection).toBeNull();
    expect(state.lastEvent).toEqual({
      type: "deleted",
      label: "Polygon 1",
    });
    expect(drawReducer(state, { type: "undo" }).shapes).toHaveLength(1);
  });

  it("ignores an unknown shape", () => {
    expect(
      drawReducer(initialDrawState, { type: "deleteShape", shapeId: "x" }),
    ).toBe(initialDrawState);
  });

  it("clears every shape, undoably", () => {
    const state = run([
      ...TRIANGLE,
      { type: "finish" },
      { type: "setMode", kind: "point" },
      add(9, 9),
      { type: "clear" },
    ]);
    expect(state.shapes).toEqual([]);
    expect(state.lastEvent).toEqual({ type: "cleared", count: 2 });
    expect(drawReducer(state, { type: "undo" }).shapes).toHaveLength(2);
  });

  it("clears nothing when there is nothing", () => {
    expect(drawReducer(initialDrawState, { type: "clear" })).toBe(
      initialDrawState,
    );
  });
});

describe("undo and redo", () => {
  it("undoes and redoes a vertex", () => {
    const two = run([add(0, 0), add(1, 1)]);
    const undone = drawReducer(two, { type: "undo" });
    expect(draftOf(undone)?.vertices).toHaveLength(1);
    expect(undone.lastEvent).toEqual({ type: "undone" });
    const redone = drawReducer(undone, { type: "redo" });
    expect(draftOf(redone)?.vertices).toHaveLength(2);
    expect(redone.lastEvent).toEqual({ type: "redone" });
  });

  it("undoes finishing, so the shape is a draft again", () => {
    const finished = run([...TRIANGLE, { type: "finish" }]);
    const undone = drawReducer(finished, { type: "undo" });
    expect(draftOf(undone)?.vertices).toHaveLength(3);
  });

  it("drops the redo stack on a new edit", () => {
    const two = run([add(0, 0), add(1, 1)]);
    const undone = drawReducer(two, { type: "undo" });
    const edited = drawReducer(undone, add(5, 5));
    expect(edited.future).toEqual([]);
  });

  it("does nothing with an empty history", () => {
    expect(drawReducer(initialDrawState, { type: "undo" })).toBe(
      initialDrawState,
    );
    expect(drawReducer(initialDrawState, { type: "redo" })).toBe(
      initialDrawState,
    );
  });

  it("keeps ids unique after an undo", () => {
    const state = run([
      { type: "setMode", kind: "point" },
      add(0, 0),
      { type: "undo" },
      add(1, 1),
    ]);
    expect(onlyShape(state).id).toBe("shape-2");
  });

  it("bounds the history", () => {
    let state = run([{ type: "setMode", kind: "point" }]);
    for (let index = 0; index < DRAW_HISTORY_LIMIT + 20; index += 1) {
      state = drawReducer(state, add(index / 1000, 0));
    }
    expect(state.past.length).toBe(DRAW_HISTORY_LIMIT);
  });
});

describe("load", () => {
  it("replaces every shape, renumbers them and clears the history", () => {
    const loaded = run([
      add(5, 5),
      {
        type: "load",
        shapes: [
          { kind: "polygon", vertices: [p(0, 0), p(1, 0), p(0, 1)] },
          { kind: "circle", vertices: [p(36.8, -1.3)], radiusMetres: 400 },
          { kind: "point", vertices: [p(2.35, 48.85)] },
        ],
      },
    ]);
    expect(loaded.shapes.map((shape) => shape.label)).toEqual([
      "Polygon 1",
      "Circle 1",
      "Point 1",
    ]);
    expect(loaded.shapes.every((shape) => shape.done)).toBe(true);
    expect(loaded.past).toEqual([]);
    expect(loaded.selection).toBeNull();
    expect(loaded.lastEvent).toEqual({ type: "loaded", count: 3 });
  });

  it("skips a shape that is not valid", () => {
    const loaded = drawReducer(initialDrawState, {
      type: "load",
      shapes: [
        { kind: "polygon", vertices: [p(0, 0), p(1, 1)] },
        { kind: "point", vertices: [p(1, 1)] },
      ],
    });
    expect(loaded.shapes).toHaveLength(1);
  });

  it("does nothing for an empty list when there is nothing", () => {
    expect(drawReducer(initialDrawState, { type: "load", shapes: [] })).toBe(
      initialDrawState,
    );
  });
});

describe("escapeAction", () => {
  const triangle = run([...TRIANGLE, { type: "finish" }]);
  const id = onlyShape(triangle).id;

  it("steps back one level at a time: vertex, draft, shape, then nothing", () => {
    const vertex = drawReducer(triangle, {
      type: "select",
      shapeId: id,
      vertex: 1,
    });
    expect(escapeAction(vertex)).toEqual({ type: "select", shapeId: id });

    const shape = drawReducer(vertex, { type: "select", shapeId: id });
    expect(escapeAction(shape)).toEqual({ type: "deselect" });

    const drawing = run([add(9, 9)], shape);
    expect(escapeAction(drawing)).toEqual({ type: "cancel" });

    expect(escapeAction(initialDrawState)).toBeNull();
  });

  it("cancels a draft before dropping a vertex selection on a finished shape", () => {
    const drawing = run(
      [{ type: "select", shapeId: id, vertex: 1 }, add(9, 9)],
      triangle,
    );
    expect(escapeAction(drawing)).toEqual({ type: "cancel" });
  });
});

describe("import", () => {
  const SHAPES = [
    { kind: "polygon" as const, vertices: [p(0, 0), p(1, 0), p(0, 1)] },
    { kind: "point" as const, vertices: [p(2, 2)] },
  ];

  it("adds the shapes after those drawn, continuing ids and labels", () => {
    const drawn = run([...TRIANGLE, { type: "finish" }]);
    const imported = drawReducer(drawn, { type: "import", shapes: SHAPES });
    expect(imported.shapes.map((shape) => [shape.id, shape.label])).toEqual([
      ["shape-1", "Polygon 1"],
      ["shape-2", "Polygon 2"],
      ["shape-3", "Point 1"],
    ]);
    expect(imported.shapes.every((shape) => shape.done)).toBe(true);
    expect(imported.nextId).toBe(4);
    expect(imported.serials).toMatchObject({ polygon: 2, point: 1 });
    expect(imported.selection).toEqual({ shapeId: "shape-2", vertex: null });
    expect(imported.lastEvent).toEqual({
      type: "imported",
      shapeIds: ["shape-2", "shape-3"],
    });
  });

  it("is one undo step, and redo brings every shape back", () => {
    const drawn = run([...TRIANGLE, { type: "finish" }]);
    const imported = drawReducer(drawn, { type: "import", shapes: SHAPES });
    const undone = drawReducer(imported, { type: "undo" });
    expect(undone.shapes).toEqual(drawn.shapes);
    expect(undone.selection).toEqual(drawn.selection);
    const redone = drawReducer(undone, { type: "redo" });
    expect(redone.shapes).toEqual(imported.shapes);
  });

  it("puts the shapes before one still being drawn, which stays selected", () => {
    const drafting = run([add(5, 5), add(5.01, 5)]);
    const imported = drawReducer(drafting, { type: "import", shapes: SHAPES });
    expect(imported.shapes.map((shape) => shape.label)).toEqual([
      "Polygon 2",
      "Point 1",
      "Polygon 1",
    ]);
    expect(draftOf(imported)?.label).toBe("Polygon 1");
    expect(imported.selection).toEqual(drafting.selection);
  });

  it("leaves out a shape that is not valid, and changes nothing when none is", () => {
    const imported = drawReducer(initialDrawState, {
      type: "import",
      shapes: [{ kind: "line", vertices: [p(1, 1)] }, ...SHAPES],
    });
    expect(imported.shapes).toHaveLength(2);
    expect(
      drawReducer(initialDrawState, {
        type: "import",
        shapes: [{ kind: "line", vertices: [p(1, 1)] }],
      }),
    ).toBe(initialDrawState);
  });
});
