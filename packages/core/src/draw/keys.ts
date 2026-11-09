import type { MapKeyEvent } from "../keyboard/keyboard";
import {
  type DrawAction,
  type DrawState,
  draftOf,
  escapeAction,
  selectedShape,
} from "./reducer";

/** The parts of a keyboard event the draw shortcuts read. */
export type DrawKeyEvent = MapKeyEvent;

/** Screen pixels a selected vertex moves for one arrow key press. */
export const DRAW_NUDGE_PX = 8;

/** Screen pixels a selected vertex moves for Shift with an arrow key. */
export const DRAW_NUDGE_PX_LARGE = 32;

/**
 * What a key press asks of the draw tool. `nudge` is in screen pixels with y
 * pointing down, which the caller turns into a position with the map.
 * `placeAtCentre` adds a point, or moves the selected vertex, to the map
 * centre, which the caller also resolves.
 */
export type DrawKeyCommand =
  | { readonly type: "dispatch"; readonly action: DrawAction }
  | { readonly type: "nudge"; readonly dx: number; readonly dy: number }
  | { readonly type: "placeAtCentre" };

/** The keyboard shortcuts of the draw tool, in display order. */
export const DRAW_KEY_HELP: readonly { keys: string; description: string }[] = [
  {
    keys: "Space",
    description:
      "While drawing, add a point at the map centre, or move the selected point there",
  },
  { keys: "Enter", description: "While drawing, finish the shape" },
  {
    keys: "Arrow keys",
    description: "With a point selected, move it a little; hold Shift for more",
  },
  {
    keys: "Square bracket keys",
    description: "Select the previous or next point",
  },
  {
    keys: "Delete or Backspace",
    description:
      "Remove the selected point or shape, or the last point while drawing",
  },
  { keys: "Control or Command with Z", description: "Undo; add Shift to redo" },
  {
    keys: "Escape",
    description:
      "Step back: leave a point, cancel the shape, then close drawing",
  },
];

const ARROWS: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function dispatch(action: DrawAction): DrawKeyCommand {
  return { type: "dispatch", action };
}

function historyCommand(event: DrawKeyEvent): DrawKeyCommand | null {
  const key = event.key.toLowerCase();
  if (key === "z") {
    return dispatch({ type: event.shiftKey ? "redo" : "undo" });
  }
  return key === "y" ? dispatch({ type: "redo" }) : null;
}

function removeCommand(state: DrawState): DrawKeyCommand | null {
  const shape = selectedShape(state);
  if (!shape) {
    return null;
  }
  const vertex = state.selection?.vertex ?? null;
  const editable = shape.kind === "line" || shape.kind === "polygon";
  if (vertex !== null && editable) {
    return dispatch({ type: "removeVertex", shapeId: shape.id, index: vertex });
  }
  if (!shape.done && vertex === null) {
    return dispatch({
      type: "removeVertex",
      shapeId: shape.id,
      index: shape.vertices.length - 1,
    });
  }
  return dispatch({ type: "deleteShape", shapeId: shape.id });
}

/**
 * Maps a key press on the map region (or in the draw toolbar) to a command.
 *
 * @returns Null when the key is not a draw shortcut in the current state, so
 *   the map's own keys (arrows pan, Shift with left or right rotates) keep
 *   working. Arrows nudge only while a vertex is selected. Escape is only a
 *   command while there is something to step back from. Control or Command
 *   with Z, Shift for redo, and Y undo and redo; every other Control, Command
 *   or Alt combination is left to the browser.
 */
export function drawKeyCommand(
  state: DrawState,
  event: DrawKeyEvent,
): DrawKeyCommand | null {
  if (event.altKey) {
    return null;
  }
  if (event.ctrlKey || event.metaKey) {
    return historyCommand(event);
  }
  const arrow = ARROWS[event.key];
  if (arrow) {
    if (state.selection?.vertex == null) {
      return null;
    }
    const step = event.shiftKey ? DRAW_NUDGE_PX_LARGE : DRAW_NUDGE_PX;
    return {
      type: "nudge",
      dx: arrow.x === 0 ? 0 : arrow.x * step,
      dy: arrow.y === 0 ? 0 : arrow.y * step,
    };
  }
  switch (event.key) {
    case "Enter":
      return draftOf(state) ? dispatch({ type: "finish" }) : null;
    case "Escape": {
      const action = escapeAction(state);
      return action ? dispatch(action) : null;
    }
    case "Delete":
    case "Backspace":
      return removeCommand(state);
    case "[":
    case "]":
      return selectedShape(state)
        ? dispatch({ type: "stepVertex", delta: event.key === "]" ? 1 : -1 })
        : null;
    case " ":
      return { type: "placeAtCentre" };
    default:
      return null;
  }
}
