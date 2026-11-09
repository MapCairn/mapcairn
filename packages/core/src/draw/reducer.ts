import type { LatLng } from "../ports/geometry";
import { distanceMetres } from "./geo";
import { MAX_CIRCLE_RADIUS_METRES, shapeLabel, validateShape } from "./shape";
import type { DrawIssue, DrawKind, DrawSelection, DrawShape } from "./types";

/** How many undo steps are kept. Older ones are dropped. */
export const DRAW_HISTORY_LIMIT = 100;

/** The shortest radius a circle can be given by a tap, in metres. */
export const MIN_CIRCLE_RADIUS_METRES = 0.5;

/**
 * What the last action did, for the interface to announce. Every action that
 * changes the state or is refused replaces it with a new object.
 */
export type DrawEvent =
  | { readonly type: "mode"; readonly kind: DrawKind }
  | {
      readonly type: "vertex-added";
      readonly shapeId: string;
      readonly count: number;
    }
  | {
      readonly type: "vertex-moved";
      readonly shapeId: string;
      readonly index: number;
    }
  | {
      readonly type: "vertex-inserted";
      readonly shapeId: string;
      readonly index: number;
      readonly count: number;
    }
  | {
      readonly type: "vertex-removed";
      readonly shapeId: string;
      readonly count: number;
    }
  | { readonly type: "finished"; readonly shapeId: string }
  | { readonly type: "discarded"; readonly kind: DrawKind }
  | { readonly type: "rejected"; readonly issue: DrawIssue }
  | { readonly type: "deleted"; readonly label: string }
  | { readonly type: "cleared"; readonly count: number }
  | {
      readonly type: "selected";
      readonly shapeId: string;
      readonly vertex: number | null;
    }
  | { readonly type: "undone" }
  | { readonly type: "redone" }
  | { readonly type: "loaded"; readonly count: number };

/** A shape as it is given to `load`: everything but the generated fields. */
export interface DrawShapeInput {
  readonly kind: DrawKind;
  readonly vertices: readonly LatLng[];
  readonly radiusMetres?: number;
}

/** One undo step: the shapes and the selection as they were. */
interface HistoryEntry {
  readonly shapes: readonly DrawShape[];
  readonly selection: DrawSelection | null;
}

/**
 * Everything the draw tool knows. Shapes, the selection and the history live
 * in one value, so undo covers every edit, including deleting a shape.
 */
export interface DrawState {
  /** Every shape in the order drawn. At most one, the last, is unfinished. */
  readonly shapes: readonly DrawShape[];
  /** The kind of shape the next tap starts. */
  readonly mode: DrawKind;
  readonly selection: DrawSelection | null;
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
  /**
   * The key of the last coalescing edit. An edit with the same key joins the
   * undo step of the one before, so a drag, or a run of arrow key presses, is
   * one step.
   */
  readonly coalesce: string | null;
  /** The number the next shape's id gets. Never goes back, so ids stay unique after an undo. */
  readonly nextId: number;
  /** How many shapes of each kind have been named, for labels such as "Polygon 2". */
  readonly serials: Readonly<Record<DrawKind, number>>;
  readonly lastEvent: DrawEvent | null;
}

/** Nothing drawn, polygon mode, nothing selected. */
export const initialDrawState: DrawState = {
  shapes: [],
  mode: "polygon",
  selection: null,
  past: [],
  future: [],
  coalesce: null,
  nextId: 1,
  serials: { point: 0, line: 0, polygon: 0, circle: 0 },
  lastEvent: null,
};

/** An event that may change the drawing. */
export type DrawAction =
  | { readonly type: "setMode"; readonly kind: DrawKind }
  | { readonly type: "addVertex"; readonly at: LatLng }
  | {
      readonly type: "insertVertex";
      readonly shapeId: string;
      /** The new vertex takes this place, so the old one at it moves to the next. */
      readonly index: number;
      readonly at: LatLng;
    }
  | {
      readonly type: "moveVertex";
      readonly shapeId: string;
      readonly index: number;
      readonly to: LatLng;
      readonly coalesceKey?: string;
    }
  | {
      readonly type: "removeVertex";
      readonly shapeId: string;
      readonly index: number;
    }
  | {
      readonly type: "setRadius";
      readonly shapeId: string;
      readonly metres: number;
      readonly coalesceKey?: string;
    }
  | { readonly type: "finish" }
  | { readonly type: "cancel" }
  | {
      readonly type: "select";
      readonly shapeId: string;
      readonly vertex?: number | null;
    }
  | { readonly type: "deselect" }
  | { readonly type: "stepVertex"; readonly delta: 1 | -1 }
  | { readonly type: "deleteShape"; readonly shapeId: string }
  | { readonly type: "clear" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "load"; readonly shapes: readonly DrawShapeInput[] };

/** The shape that is still being drawn, or null. */
export function draftOf(state: DrawState): DrawShape | null {
  const last = state.shapes.at(-1);
  return last && !last.done ? last : null;
}

/** The selected shape, or null. */
export function selectedShape(state: DrawState): DrawShape | null {
  const id = state.selection?.shapeId;
  return state.shapes.find((shape) => shape.id === id) ?? null;
}

const SAME_PLACE_DEGREES = 1e-7;

function samePlace(a: LatLng, b: LatLng): boolean {
  return (
    Math.abs(a.lat - b.lat) < SAME_PLACE_DEGREES &&
    Math.abs(a.lng - b.lng) < SAME_PLACE_DEGREES
  );
}

function usable(at: LatLng): boolean {
  return (
    Number.isFinite(at.lat) &&
    Number.isFinite(at.lng) &&
    Math.abs(at.lat) <= 90 &&
    Math.abs(at.lng) <= 180
  );
}

function reject(state: DrawState, issue: DrawIssue): DrawState {
  return { ...state, lastEvent: { type: "rejected", issue } };
}

/** Applies an edit, putting the state before it on the undo stack unless it coalesces. */
function commit(
  state: DrawState,
  next: Partial<DrawState> & Pick<DrawState, "shapes">,
  coalesceKey: string | null = null,
): DrawState {
  const joins = coalesceKey !== null && state.coalesce === coalesceKey;
  const past = joins
    ? state.past
    : [
        ...state.past,
        { shapes: state.shapes, selection: state.selection },
      ].slice(-DRAW_HISTORY_LIMIT);
  return {
    ...state,
    selection: state.selection,
    ...next,
    past,
    future: [],
    coalesce: coalesceKey,
  };
}

function replaceShape(
  state: DrawState,
  shapeId: string,
  update: (shape: DrawShape) => DrawShape,
): DrawShape[] {
  return state.shapes.map((shape) =>
    shape.id === shapeId ? update(shape) : shape,
  );
}

function findShape(state: DrawState, shapeId: string): DrawShape | undefined {
  return state.shapes.find((shape) => shape.id === shapeId);
}

function startShape(state: DrawState, at: LatLng): DrawState {
  const kind = state.mode;
  const serial = state.serials[kind] + 1;
  const id = `shape-${state.nextId}`;
  const done = kind === "point";
  const shape: DrawShape = {
    id,
    kind,
    label: shapeLabel(kind, serial),
    vertices: [at],
    done,
  };
  return commit(state, {
    shapes: [...state.shapes, shape],
    selection: { shapeId: id, vertex: null },
    nextId: state.nextId + 1,
    serials: { ...state.serials, [kind]: serial },
    lastEvent: done
      ? { type: "finished", shapeId: id }
      : { type: "vertex-added", shapeId: id, count: 1 },
  });
}

function setCircleRadius(
  state: DrawState,
  draft: DrawShape,
  at: LatLng,
): DrawState {
  const centre = draft.vertices[0] as LatLng;
  const radius = distanceMetres(centre, at);
  if (radius < MIN_CIRCLE_RADIUS_METRES) {
    return reject(state, "degenerate");
  }
  if (radius > MAX_CIRCLE_RADIUS_METRES) {
    return reject(state, "radius-too-large");
  }
  return commit(state, {
    shapes: replaceShape(state, draft.id, (shape) => ({
      ...shape,
      radiusMetres: radius,
      done: true,
    })),
    selection: { shapeId: draft.id, vertex: null },
    lastEvent: { type: "finished", shapeId: draft.id },
  });
}

function addVertex(state: DrawState, at: LatLng): DrawState {
  if (!usable(at)) {
    return state;
  }
  const draft = draftOf(state);
  if (!draft) {
    return startShape(state, at);
  }
  if (draft.kind === "circle") {
    return setCircleRadius(state, draft, at);
  }
  const last = draft.vertices.at(-1);
  if (last && samePlace(last, at)) {
    return state;
  }
  const vertices = [...draft.vertices, at];
  return commit(state, {
    shapes: replaceShape(state, draft.id, (shape) => ({ ...shape, vertices })),
    selection: { shapeId: draft.id, vertex: null },
    lastEvent: {
      type: "vertex-added",
      shapeId: draft.id,
      count: vertices.length,
    },
  });
}

function setMode(state: DrawState, kind: DrawKind): DrawState {
  if (kind === state.mode) {
    return state;
  }
  const draft = draftOf(state);
  if (!draft) {
    return { ...state, mode: kind, lastEvent: { type: "mode", kind } };
  }
  return commit(state, {
    shapes: state.shapes.filter((shape) => shape.id !== draft.id),
    selection: null,
    mode: kind,
    lastEvent: { type: "discarded", kind: draft.kind },
  });
}

function finish(state: DrawState): DrawState {
  const draft = draftOf(state);
  if (!draft) {
    return state;
  }
  const issue = validateShape(draft);
  if (issue) {
    return reject(state, issue);
  }
  return commit(state, {
    shapes: replaceShape(state, draft.id, (shape) => ({
      ...shape,
      done: true,
    })),
    selection: { shapeId: draft.id, vertex: null },
    lastEvent: { type: "finished", shapeId: draft.id },
  });
}

function cancel(state: DrawState): DrawState {
  const draft = draftOf(state);
  if (!draft) {
    return state;
  }
  return commit(state, {
    shapes: state.shapes.filter((shape) => shape.id !== draft.id),
    selection: state.selection?.shapeId === draft.id ? null : state.selection,
    lastEvent: { type: "discarded", kind: draft.kind },
  });
}

function moveVertex(
  state: DrawState,
  action: Extract<DrawAction, { type: "moveVertex" }>,
): DrawState {
  const shape = findShape(state, action.shapeId);
  if (
    !shape ||
    !usable(action.to) ||
    !Number.isInteger(action.index) ||
    action.index < 0 ||
    action.index >= shape.vertices.length
  ) {
    return state;
  }
  return commit(
    state,
    {
      shapes: replaceShape(state, shape.id, (current) => ({
        ...current,
        vertices: current.vertices.map((vertex, at) =>
          at === action.index ? action.to : vertex,
        ),
      })),
      lastEvent: {
        type: "vertex-moved",
        shapeId: shape.id,
        index: action.index,
      },
    },
    action.coalesceKey ?? null,
  );
}

function setRadius(
  state: DrawState,
  action: Extract<DrawAction, { type: "setRadius" }>,
): DrawState {
  const shape = findShape(state, action.shapeId);
  if (shape?.kind !== "circle") {
    return state;
  }
  if (!Number.isFinite(action.metres) || action.metres <= 0) {
    return reject(state, "degenerate");
  }
  if (action.metres > MAX_CIRCLE_RADIUS_METRES) {
    return reject(state, "radius-too-large");
  }
  return commit(
    state,
    {
      shapes: replaceShape(state, shape.id, (current) => ({
        ...current,
        radiusMetres: action.metres,
      })),
      lastEvent: { type: "vertex-moved", shapeId: shape.id, index: 0 },
    },
    action.coalesceKey ?? null,
  );
}

function insertVertex(
  state: DrawState,
  action: Extract<DrawAction, { type: "insertVertex" }>,
): DrawState {
  const shape = findShape(state, action.shapeId);
  if (
    !shape ||
    (shape.kind !== "line" && shape.kind !== "polygon") ||
    !usable(action.at) ||
    !Number.isInteger(action.index) ||
    action.index < 1 ||
    action.index > shape.vertices.length
  ) {
    return state;
  }
  const vertices = [
    ...shape.vertices.slice(0, action.index),
    action.at,
    ...shape.vertices.slice(action.index),
  ];
  return commit(state, {
    shapes: replaceShape(state, shape.id, (current) => ({
      ...current,
      vertices,
    })),
    selection: { shapeId: shape.id, vertex: action.index },
    lastEvent: {
      type: "vertex-inserted",
      shapeId: shape.id,
      index: action.index,
      count: vertices.length,
    },
  });
}

/** The fewest vertices a shape may keep: nothing while drawing, then what its kind needs. */
function minimumVertices(shape: DrawShape): number {
  if (!shape.done) {
    return 0;
  }
  return shape.kind === "polygon" ? 3 : 2;
}

function removeVertex(
  state: DrawState,
  action: Extract<DrawAction, { type: "removeVertex" }>,
): DrawState {
  const shape = findShape(state, action.shapeId);
  if (
    !shape ||
    (shape.kind !== "line" && shape.kind !== "polygon") ||
    !Number.isInteger(action.index) ||
    action.index < 0 ||
    action.index >= shape.vertices.length
  ) {
    return state;
  }
  if (shape.vertices.length - 1 < minimumVertices(shape)) {
    return reject(state, "too-few-vertices");
  }
  const vertices = shape.vertices.filter((_, at) => at !== action.index);
  if (vertices.length === 0) {
    return commit(state, {
      shapes: state.shapes.filter((current) => current.id !== shape.id),
      selection: null,
      lastEvent: { type: "discarded", kind: shape.kind },
    });
  }
  return commit(state, {
    shapes: replaceShape(state, shape.id, (current) => ({
      ...current,
      vertices,
    })),
    selection: {
      shapeId: shape.id,
      vertex: Math.min(action.index, vertices.length - 1),
    },
    lastEvent: {
      type: "vertex-removed",
      shapeId: shape.id,
      count: vertices.length,
    },
  });
}

function select(
  state: DrawState,
  action: Extract<DrawAction, { type: "select" }>,
): DrawState {
  const shape = findShape(state, action.shapeId);
  const vertex = action.vertex ?? null;
  if (
    !shape ||
    (vertex !== null &&
      (!Number.isInteger(vertex) ||
        vertex < 0 ||
        vertex >= shape.vertices.length))
  ) {
    return state;
  }
  return {
    ...state,
    selection: { shapeId: shape.id, vertex },
    coalesce: null,
    lastEvent: { type: "selected", shapeId: shape.id, vertex },
  };
}

function stepVertex(state: DrawState, delta: 1 | -1): DrawState {
  const shape = selectedShape(state);
  if (!shape || shape.vertices.length === 0) {
    return state;
  }
  const count = shape.vertices.length;
  const current = state.selection?.vertex ?? null;
  const next =
    current === null
      ? delta === 1
        ? 0
        : count - 1
      : (current + delta + count) % count;
  return select(state, { type: "select", shapeId: shape.id, vertex: next });
}

function deleteShape(state: DrawState, shapeId: string): DrawState {
  const shape = findShape(state, shapeId);
  if (!shape) {
    return state;
  }
  return commit(state, {
    shapes: state.shapes.filter((current) => current.id !== shapeId),
    selection: state.selection?.shapeId === shapeId ? null : state.selection,
    lastEvent: { type: "deleted", label: shape.label },
  });
}

function clear(state: DrawState): DrawState {
  if (state.shapes.length === 0) {
    return state;
  }
  return commit(state, {
    shapes: [],
    selection: null,
    lastEvent: { type: "cleared", count: state.shapes.length },
  });
}

function undo(state: DrawState): DrawState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    ...state,
    shapes: previous.shapes,
    selection: previous.selection,
    past: state.past.slice(0, -1),
    future: [
      { shapes: state.shapes, selection: state.selection },
      ...state.future,
    ],
    coalesce: null,
    lastEvent: { type: "undone" },
  };
}

function redo(state: DrawState): DrawState {
  const [next, ...rest] = state.future;
  if (!next) {
    return state;
  }
  return {
    ...state,
    shapes: next.shapes,
    selection: next.selection,
    past: [
      ...state.past,
      { shapes: state.shapes, selection: state.selection },
    ].slice(-DRAW_HISTORY_LIMIT),
    future: rest,
    coalesce: null,
    lastEvent: { type: "redone" },
  };
}

function load(state: DrawState, inputs: readonly DrawShapeInput[]): DrawState {
  let nextId = 1;
  const serials = { point: 0, line: 0, polygon: 0, circle: 0 };
  const shapes: DrawShape[] = [];
  for (const input of inputs) {
    const candidate: DrawShape = {
      id: `shape-${nextId}`,
      kind: input.kind,
      label: shapeLabel(input.kind, serials[input.kind] + 1),
      vertices: input.vertices,
      ...(input.radiusMetres === undefined
        ? {}
        : { radiusMetres: input.radiusMetres }),
      done: true,
    };
    if (validateShape(candidate) === null) {
      shapes.push(candidate);
      nextId += 1;
      serials[input.kind] += 1;
    }
  }
  if (shapes.length === 0 && state.shapes.length === 0) {
    return state;
  }
  return {
    ...initialDrawState,
    mode: state.mode,
    shapes,
    nextId,
    serials,
    lastEvent: { type: "loaded", count: shapes.length },
  };
}

/**
 * Applies an action to the drawing. Pure: an action that changes nothing
 * returns the same state object, so React can skip re-rendering.
 *
 * @remarks Every edit goes on the undo stack as the shapes and selection
 *   before it (at most {@link DRAW_HISTORY_LIMIT} steps), except an edit that
 *   passes the same `coalesceKey` as the one just before it, which joins that
 *   step. Selecting, stepping and changing mode with nothing drawn are not
 *   edits. A refused action leaves the shapes alone and sets a `rejected`
 *   event naming why.
 */
export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  switch (action.type) {
    case "setMode":
      return setMode(state, action.kind);
    case "addVertex":
      return addVertex(state, action.at);
    case "insertVertex":
      return insertVertex(state, action);
    case "moveVertex":
      return moveVertex(state, action);
    case "removeVertex":
      return removeVertex(state, action);
    case "setRadius":
      return setRadius(state, action);
    case "finish":
      return finish(state);
    case "cancel":
      return cancel(state);
    case "select":
      return select(state, action);
    case "deselect":
      return state.selection
        ? { ...state, selection: null, coalesce: null }
        : state;
    case "stepVertex":
      return stepVertex(state, action.delta);
    case "deleteShape":
      return deleteShape(state, action.shapeId);
    case "clear":
      return clear(state);
    case "undo":
      return undo(state);
    case "redo":
      return redo(state);
    case "load":
      return load(state, action.shapes);
  }
}

/**
 * What Escape does next, one level at a time: leave a selected vertex, then
 * cancel a shape being drawn, then drop the selection. Null when nothing is
 * left to dismiss, so the caller can close the tool.
 */
export function escapeAction(state: DrawState): DrawAction | null {
  const selection = state.selection;
  if (selection && selection.vertex !== null) {
    return { type: "select", shapeId: selection.shapeId };
  }
  if (draftOf(state)) {
    return { type: "cancel" };
  }
  return selection ? { type: "deselect" } : null;
}
