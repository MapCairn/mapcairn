// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The two widths of a box that scrolls sideways when its content is wider. */
export interface ScrollBox {
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

/**
 * Whether a box has content wider than itself, so a reader needs the keyboard
 * to reach the rest. A table that fits is not made a tab stop.
 * @param box - The box's content width and its own width.
 */
export function scrolls(box: ScrollBox): boolean {
  return box.scrollWidth > box.clientWidth;
}
