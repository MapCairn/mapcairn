// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** Unicode FIRST STRONG ISOLATE: starts an isolated run whose direction follows its first strong letter. */
const FIRST_STRONG_ISOLATE = "\u2068";

/** Unicode POP DIRECTIONAL ISOLATE: ends the run a first strong isolate began. */
const POP_ISOLATE = "\u2069";

/** The explicit isolate controls, U+2066 to U+2069, which `isolate` removes from its input. */
const ISOLATE_CONTROLS = /[\u2066-\u2069]/g;

/**
 * Wraps `text` in a first-strong isolate, so a name, a coordinate or a number
 * with a unit keeps its own order inside a right-to-left sentence and cannot
 * pull the neighbouring punctuation or words around. Text with no strong
 * letter, such as a coordinate, reads left to right. Empty text stays empty.
 * Any isolate control already in `text` is removed first, so a value that
 * holds a closing control cannot end its own isolation early, and a value
 * isolated before is not wrapped twice.
 */
export function isolate(text: string): string {
  const plain = text.replace(ISOLATE_CONTROLS, "");
  return plain === "" ? plain : `${FIRST_STRONG_ISOLATE}${plain}${POP_ISOLATE}`;
}
