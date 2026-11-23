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

/**
 * The accessible name of a table's scrolling region. Each table on a page gets
 * its own number, because landmarks that share a name cannot be told apart.
 * @param index - The table's zero-based position among the tables on the page.
 */
export function tableLabel(index: number): string {
  return `Table ${index + 1}, scrolls sideways`;
}
