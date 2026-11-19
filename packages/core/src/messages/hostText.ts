// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { HostText } from "../ports/messages";

/**
 * Whether `value` is a {@link HostText}: a non-null object whose `key` and
 * `text` are both strings. A {@link Message} has `params` instead of `text`,
 * so it is not one. Kept out of the package's public entry point.
 */
export function isHostText(value: unknown): value is HostText {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly key?: unknown }).key === "string" &&
    typeof (value as { readonly text?: unknown }).text === "string"
  );
}
