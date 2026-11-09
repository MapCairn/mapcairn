/** What a key press on the focused map should do. */
export type MapKeyAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "rotate"; degrees: number }
  | { type: "resetBearing" }
  | { type: "dropPin" }
  | { type: "escape" };

/** The parts of a keyboard event the map shortcuts read. */
export interface MapKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/** Pixels moved by one arrow key press. */
export const KEY_PAN_STEP = 80;

/** Pixels moved by Shift with the up or down arrow. */
export const KEY_PAN_STEP_LARGE = 240;

/** Degrees turned by Shift with left or right arrow. */
export const KEY_ROTATE_STEP = 15;

const ARROW_DIRECTIONS: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Maps a key press on the map region to an action.
 *
 * @returns The action, or null when the key is not a map shortcut. Any
 *   ctrl, meta or alt modifier gives null so browser and system shortcuts
 *   keep working. Shift is otherwise ignored for the character keys, because
 *   "+" and "_" need it on many keyboards.
 * @remarks For `pan`, `dx` and `dy` are screen pixels with y pointing down,
 *   and the map view moves the way the arrow points: ArrowRight shows more
 *   of the map to the right. Shift with left or right rotates; Shift with up
 *   or down pans further.
 */
export function mapKeyAction(event: MapKeyEvent): MapKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  const arrow = ARROW_DIRECTIONS[event.key];
  if (arrow !== undefined) {
    if (event.shiftKey && arrow.y === 0) {
      return { type: "rotate", degrees: arrow.x * KEY_ROTATE_STEP };
    }
    const step = event.shiftKey ? KEY_PAN_STEP_LARGE : KEY_PAN_STEP;
    // Multiplying zero by a negative step gives -0, so build each axis
    // explicitly.
    return {
      type: "pan",
      dx: arrow.x === 0 ? 0 : arrow.x * step,
      dy: arrow.y === 0 ? 0 : arrow.y * step,
    };
  }

  switch (event.key) {
    case "+":
    case "=":
      return { type: "zoomIn" };
    case "-":
    case "_":
      return { type: "zoomOut" };
    case "Home":
    case "0":
      return { type: "resetBearing" };
    case "p":
    case "P":
      return { type: "dropPin" };
    case "Escape":
      return { type: "escape" };
    default:
      return null;
  }
}

/** One line of the keyboard help. */
export interface MapKeyHelpEntry {
  readonly keys: string;
  readonly description: string;
}

/** The keyboard shortcuts of the map region, in display order. */
export const MAP_KEY_HELP: readonly MapKeyHelpEntry[] = [
  { keys: "Arrow keys", description: "Pan the map" },
  { keys: "Shift with up or down arrow", description: "Pan the map further" },
  { keys: "Shift with left or right arrow", description: "Rotate the map" },
  { keys: "Plus or minus", description: "Zoom in or out" },
  { keys: "Home or 0", description: "Point the map north again" },
  { keys: "P", description: "Drop a pin at the centre of the map" },
  { keys: "Escape", description: "Close the open panel" },
];
