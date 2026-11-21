// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The last C0 control character's code point, and the one for DEL. */
const LAST_C0_CONTROL = 0x1f;
const DELETE = 0x7f;

/** Whether `text` holds a C0 control character or DEL, which a browser strips or reads oddly in an address. */
function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= LAST_C0_CONTROL || code === DELETE) {
      return true;
    }
  }
  return false;
}

/** Whether `href` is an absolute http or https address, the only kind of web link a host may supply. */
export function isWebAddress(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Whether `href` is a path on the host's own site (`/about`), the other kind
 * of address a host may supply for a link to its own page. A browser reads
 * `//` and `/\` as the start of another site's address, so neither counts. It
 * also drops tab, carriage return and line feed from an address before it
 * reads it, so `/` then a tab then `/` would be `//`: any control character
 * refuses the address.
 */
export function isSitePath(href: string): boolean {
  if (hasControlCharacter(href)) {
    return false;
  }
  return /^\/(?![/\\])/.test(href);
}
