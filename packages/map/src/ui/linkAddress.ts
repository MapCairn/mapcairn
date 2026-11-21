// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

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
 * `//` and `/\` as the start of another site's address, so neither counts.
 */
export function isSitePath(href: string): boolean {
  return /^\/(?![/\\])/.test(href);
}
