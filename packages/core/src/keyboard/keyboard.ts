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

/** What the active map engine can do. */
export interface MapKeyCapabilities {
  readonly supportsRotation: boolean;
}

/** Pixels moved by one arrow key press. */
export const KEY_PAN_STEP = 80;

/** Pixels moved by an arrow key press with Shift held, where Shift does not rotate. */
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
 *   of the map to the right. Home and 0 do nothing on an engine without
 *   rotation, and Shift with left or right pans further there instead.
 */
export function mapKeyAction(
  event: MapKeyEvent,
  capabilities: MapKeyCapabilities,
): MapKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  const arrow = ARROW_DIRECTIONS[event.key];
  if (arrow !== undefined) {
    if (event.shiftKey && capabilities.supportsRotation && arrow.y === 0) {
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
      return capabilities.supportsRotation ? { type: "resetBearing" } : null;
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

interface HelpRow extends MapKeyHelpEntry {
  /** When the row applies: always, only with rotation, or only without. */
  readonly when: "always" | "rotation" | "no-rotation";
}

const HELP_ROWS: readonly HelpRow[] = [
  { when: "always", keys: "Arrow keys", description: "Pan the map" },
  {
    when: "rotation",
    keys: "Shift with up or down arrow",
    description: "Pan the map further",
  },
  {
    when: "no-rotation",
    keys: "Shift with an arrow key",
    description: "Pan the map further",
  },
  {
    when: "rotation",
    keys: "Shift with left or right arrow",
    description: "Rotate the map",
  },
  { when: "always", keys: "Plus or minus", description: "Zoom in or out" },
  {
    when: "rotation",
    keys: "Home or 0",
    description: "Point the map north again",
  },
  {
    when: "always",
    keys: "P",
    description: "Drop a pin at the centre of the map",
  },
  { when: "always", keys: "Escape", description: "Close the open panel" },
];

/**
 * The keyboard shortcuts to show in the Help section, in display order.
 * Entries about rotation and north are left out when the engine cannot rotate.
 */
export function mapKeyHelp(
  capabilities: MapKeyCapabilities,
): readonly MapKeyHelpEntry[] {
  return HELP_ROWS.filter(
    (row) =>
      row.when === "always" ||
      (row.when === "rotation") === capabilities.supportsRotation,
  ).map(({ keys, description }) => ({ keys, description }));
}

/** The full keyboard help, for an engine that supports rotation. */
export const MAP_KEY_HELP: readonly MapKeyHelpEntry[] = mapKeyHelp({
  supportsRotation: true,
});
