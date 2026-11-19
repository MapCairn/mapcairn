// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageKey } from "../ports/messages";

/** Unicode FIRST STRONG ISOLATE: starts an isolated run whose direction follows its first strong letter. */
export const FIRST_STRONG_ISOLATE = "⁨";

/** Unicode POP DIRECTIONAL ISOLATE: ends the run a {@link FIRST_STRONG_ISOLATE} began. */
export const POP_ISOLATE = "⁩";

/**
 * Wraps `text` in a first-strong isolate, so a name, a coordinate or a number
 * with a unit keeps its own order inside a right-to-left sentence and cannot
 * pull the neighbouring punctuation or words around. Text with no strong
 * letter, such as a coordinate, reads left to right. Empty text stays empty.
 */
export function isolate(text: string): string {
  return text === "" ? text : `${FIRST_STRONG_ISOLATE}${text}${POP_ISOLATE}`;
}

/**
 * The messages that assemble one figure from its parts, such as a number and
 * its unit symbol. The catalogue leaves their parameters plain, because
 * isolating the symbol apart from the number would split the figure; whoever
 * uses the result isolates it whole, as a component does with `Isolate` and
 * the catalogue does for a parameter of another message.
 */
export const FIGURE_MESSAGE_KEYS: ReadonlySet<MessageKey> = new Set<MessageKey>(
  ["units.reading"],
);
