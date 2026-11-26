// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { DefinitionText, MessageKey } from "../ports/messages";

/** What a key press on the focused map should do. */
export type MapKeyAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "rotate"; degrees: number }
  | { type: "resetBearing" }
  | { type: "dropPin" }
  | { type: "identify" }
  | { type: "escape" };

/** The parts of a keyboard event the map shortcuts read. */
export interface MapKeyEvent {
  /** The key's value, as `KeyboardEvent.key` gives it. */
  readonly key: string;
  /** Whether Shift was held. */
  readonly shiftKey: boolean;
  /** Whether Control was held. */
  readonly ctrlKey: boolean;
  /** Whether Meta (Command on a Mac) was held. */
  readonly metaKey: boolean;
  /** Whether Alt (Option on a Mac) was held. */
  readonly altKey: boolean;
}

/** Pixels moved by one arrow key press. */
const KEY_PAN_STEP = 80;

/** Pixels moved by Shift with the up or down arrow. */
const KEY_PAN_STEP_LARGE = 240;

/** Degrees turned by Shift with left or right arrow. */
const KEY_ROTATE_STEP = 15;

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
    case "i":
    case "I":
      return { type: "identify" };
    case "Escape":
      return { type: "escape" };
    default:
      return null;
  }
}

/**
 * One line of the keyboard help. Both parts are a `DefinitionText`: a message
 * key (the SDK's own lines), a host-keyed text or a plain string (a host's
 * own extra lines).
 */
export interface MapKeyHelpEntry {
  /** The key or keys, such as `Shift + arrows`. */
  readonly keys: DefinitionText;
  /** What the keys do, as a sentence without a trailing full stop. */
  readonly description: DefinitionText;
}

/** A line of the SDK's own keyboard help, written in message keys only. */
export interface ShippedKeyHelpEntry extends MapKeyHelpEntry {
  /** The message key for the key or keys. */
  readonly keys: MessageKey;
  /** The message key for what they do. */
  readonly description: MessageKey;
}

/** Which of the optional map keys a host has wired. Each defaults to true. */
export interface MapKeyOptions {
  /** The P key, which drops a pin. Without a pin tool, set false. */
  readonly pin?: boolean;
  /** The I key, which lists the features at the centre. Without it, set false. */
  readonly identify?: boolean;
}

const PIN_KEY_HELP: ShippedKeyHelpEntry = {
  keys: "keyHelp.keys.p",
  description: "keyHelp.map.pin",
};

const IDENTIFY_KEY_HELP: ShippedKeyHelpEntry = {
  keys: "keyHelp.keys.i",
  description: "keyHelp.map.identify",
};

/**
 * The keyboard shortcuts of the map region, in display order, as message keys,
 * leaving out the P and I lines for a host that has no pin or identify.
 */
export function mapKeyHelp({
  pin = true,
  identify = true,
}: MapKeyOptions = {}): readonly ShippedKeyHelpEntry[] {
  return [
    { keys: "keyHelp.keys.arrowKeys", description: "keyHelp.map.pan" },
    { keys: "keyHelp.keys.shiftUpDown", description: "keyHelp.map.panFurther" },
    { keys: "keyHelp.keys.shiftLeftRight", description: "keyHelp.map.rotate" },
    { keys: "keyHelp.keys.plusMinus", description: "keyHelp.map.zoom" },
    { keys: "keyHelp.keys.homeOr0", description: "keyHelp.map.north" },
    ...(pin ? [PIN_KEY_HELP] : []),
    ...(identify ? [IDENTIFY_KEY_HELP] : []),
    { keys: "keyHelp.keys.escape", description: "keyHelp.map.escape" },
  ];
}

/** Every keyboard shortcut of the map region, in display order, as message keys. */
export const MAP_KEY_HELP: readonly ShippedKeyHelpEntry[] = mapKeyHelp();
