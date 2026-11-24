// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";

/** The custom property a `var(--name)` token reference points at, or none. */
function propertyOf(reference: string): string | readonly string[] {
  return /^var\((--[\w-]+)\)$/.exec(reference)?.[1] ?? [];
}

/**
 * The custom properties a host's generated theme sets, read from the built
 * contract: the colours, the font family and the corner radii.
 */
const THEME_PROPERTIES: readonly string[] = [
  ...Object.values(tokens.color),
  tokens.type.family,
  ...Object.values(tokens.radius),
].flatMap(propertyOf);

/**
 * Copies the colours, font family and corner radii `source` sees onto
 * `target`, an element that renders elsewhere in the document, such as
 * content in a portal under `body`.
 *
 * A host scopes its generated theme to an element it owns, so a portal
 * outside that element would show the SDK's own colours, font and corners. The
 * computed value already accounts for the scope, the page theme and the
 * high-contrast and forced-colours modes (where the host theme is not
 * applied), so copying it keeps the portalled element in step with its
 * trigger. Where the host did not theme the trigger the values equal the
 * page's own, so nothing changes. The values are set through the style
 * object, which a policy that blocks inline styles allows.
 */
export function inheritTheme(source: Element, target: HTMLElement): void {
  const seen = getComputedStyle(source);
  for (const property of THEME_PROPERTIES) {
    const value = seen.getPropertyValue(property);
    if (value !== "") {
      target.style.setProperty(property, value);
    }
  }
}
