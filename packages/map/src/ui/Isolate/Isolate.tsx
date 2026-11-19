// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { HTMLAttributes } from "react";

/** Props for {@link Isolate}. */
export interface IsolateProps extends Omit<HTMLAttributes<HTMLElement>, "dir"> {
  /**
   * Marks ASCII figures that always read left to right, such as the signed
   * coordinates `formatLatLng` writes. It sets `dir="ltr"` and
   * `translate="no"`. Leave it off for a name, a distance or any text whose
   * direction depends on its letters.
   */
  readonly figure?: boolean;
}

/**
 * Keeps a run of text in its own bidirectional context. Use it for anything
 * that is not copy from the message catalogue and may differ in direction or
 * language from its surroundings: a place name, an address, a feature title, a
 * coordinate, a scale label or a number with its unit. In right-to-left text
 * these would otherwise reorder, because the neighbouring punctuation and
 * numbers take the direction of the paragraph.
 *
 * @remarks Renders a `bdi`, which isolates its content and, unless `figure` is
 *   set, takes its direction from the first strong letter. Pass `lang` where
 *   the language is known, so a screen reader pronounces a name in its own
 *   language. Text the catalogue substitutes into a sentence is isolated by
 *   the catalogue instead (`isolateParameters` in `createMessageCatalogue`).
 */
export function Isolate({ figure = false, ...rest }: IsolateProps) {
  return figure ? (
    <bdi {...rest} dir="ltr" translate="no" />
  ) : (
    <bdi {...rest} />
  );
}
