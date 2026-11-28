// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** The keyboard model of a group with one tab stop, as pure functions. */

/** Where a key moves focus among the items. */
export type FocusMove = "previous" | "next" | "first" | "last";

const MOVES: Readonly<Record<string, FocusMove>> = {
  ArrowLeft: "previous",
  ArrowUp: "previous",
  ArrowRight: "next",
  ArrowDown: "next",
  Home: "first",
  PageUp: "first",
  End: "last",
  PageDown: "last",
};

/** Left and Right trade places where the page reads right to left. */
const MIRRORED: Readonly<Record<string, string>> = {
  ArrowLeft: "ArrowRight",
  ArrowRight: "ArrowLeft",
};

/** The parts of a key press the model reads. */
export type KeyPress = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;

/**
 * The move a key press asks for, or `undefined` for a key that is the
 * browser's: any other key, or one held with a modifier.
 */
export function focusMove(
  press: KeyPress,
  direction: "ltr" | "rtl",
): FocusMove | undefined {
  if (press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) {
    return undefined;
  }
  const mirrored = direction === "rtl" ? MIRRORED[press.key] : undefined;
  return MOVES[mirrored ?? press.key];
}

/**
 * The items to try, in order, for a move made from the item at `from`. A step
 * wraps round the ends and comes back to where it started last.
 */
export function moveCandidates<T>(
  items: readonly T[],
  from: number,
  move: FocusMove,
): readonly T[] {
  if (move === "first") {
    return items;
  }
  if (move === "last") {
    return [...items].reverse();
  }
  const ordered = move === "previous" ? [...items].reverse() : [...items];
  const at = ordered.indexOf(items[from] as T);
  return [...ordered.slice(at + 1), ...ordered.slice(0, at + 1)];
}

/** Focuses the first candidate that takes focus, stopping at the focused one. */
export function focusFirst(candidates: readonly HTMLElement[]): void {
  const before = document.activeElement;
  for (const candidate of candidates) {
    if (candidate === before) {
      return;
    }
    candidate.focus();
    if (document.activeElement !== before) {
      return;
    }
  }
}
