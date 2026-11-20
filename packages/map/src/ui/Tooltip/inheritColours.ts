// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";

/** The custom properties behind the colour tokens, read from the built contract. */
const COLOUR_PROPERTIES: readonly string[] = Object.values(
  tokens.color,
).flatMap((reference) => /^var\((--[\w-]+)\)$/.exec(reference)?.[1] ?? []);

/**
 * Copies the colours `source` sees onto `target`, an element that renders
 * elsewhere in the document, such as content in a portal under `body`.
 *
 * A host scopes its generated theme to an element it owns, so a portal
 * outside that element would show the SDK's own colours. The computed value
 * already accounts for the scope, the page theme and the high-contrast and
 * forced-colours modes (where the host theme is not applied), so copying it
 * keeps the portalled element in step with its trigger. Where the host did
 * not theme the trigger the values equal the page's own, so nothing changes.
 * The values are set through the style object, which a policy that blocks
 * inline styles allows.
 */
export function inheritColours(source: Element, target: HTMLElement): void {
  const seen = getComputedStyle(source);
  for (const property of COLOUR_PROPERTIES) {
    const value = seen.getPropertyValue(property);
    if (value !== "") {
      target.style.setProperty(property, value);
    }
  }
}
