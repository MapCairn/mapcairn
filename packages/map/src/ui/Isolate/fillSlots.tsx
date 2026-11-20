// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { Fragment, type ReactNode } from "react";

/**
 * Matches `{name}`, with the isolate controls a right-to-left catalogue puts
 * around a substituted value (U+2068 before, U+2069 after) when the value was
 * a placeholder of its own.
 */
const SLOT = /⁨?\{(\w+)\}⁩?/;

/**
 * Splits `text` around its `{name}` slots and puts `slots[name]` in each, so
 * a value in a sentence can be an element of its own, such as an `Isolate`.
 * Get `text` from the catalogue by passing each slot's own placeholder as its
 * parameter, for example `t("tools.directions.leg", { distance: "{distance}" })`.
 * A name with no entry in `slots` is left as written.
 *
 * @internal
 */
export function fillSlots(
  text: string,
  slots: Readonly<Record<string, ReactNode>>,
): ReactNode {
  return text.split(SLOT).map((part, index) => {
    // `split` with one capture group alternates text and slot names.
    const piece = index % 2 === 0 ? part : (slots[part] ?? `{${part}}`);
    // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are positional and never reorder.
    return <Fragment key={index}>{piece}</Fragment>;
  });
}
