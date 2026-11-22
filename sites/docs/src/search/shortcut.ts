// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The parts of a key press the search shortcut depends on. */
export interface ShortcutPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** Whether focus is in a field where a slash is text. */
  readonly typing: boolean;
}

/**
 * Whether a key press should open search: a bare `/` (not while typing in a
 * field, and not with a modifier that makes it another shortcut), or the
 * command or control key with `K`, which opens search from inside a field too.
 * @param press - The key press.
 */
export function isSearchShortcut(press: ShortcutPress): boolean {
  if (press.key.toLowerCase() === "k") {
    return (press.ctrlKey || press.metaKey) && !press.altKey;
  }
  if (press.key === "/") {
    return !press.typing && !press.ctrlKey && !press.metaKey && !press.altKey;
  }
  return false;
}
