// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** How many maps this copy of the module has mounted. */
let mounts = 0;

/** The length of the random part of a prefix, in base-36 digits. */
const SUFFIX_LENGTH = 6;

/**
 * A prefix for the ids React makes in one map's root, so two maps on a page
 * never share an id, even when the page loads a second copy of this module or
 * has React of its own.
 */
export function nextIdentifierPrefix(): string {
  mounts += 1;
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + SUFFIX_LENGTH);
  return `mc${mounts}${suffix}-`;
}
