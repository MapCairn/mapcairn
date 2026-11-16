// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The language subtag of a BCP 47 tag, lower-cased: `"af-ZA"` gives `"af"`. */
function baseLanguage(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? "";
}

/** The offered tag that spells `tag` the same way, ignoring case. */
function findExact(
  offered: readonly string[],
  tag: string,
): string | undefined {
  const wanted = tag.toLowerCase();
  return offered.find((candidate) => candidate.toLowerCase() === wanted);
}

/** The first offered tag that shares `tag`'s language subtag. */
function findByBase(
  offered: readonly string[],
  tag: string,
): string | undefined {
  const wanted = baseLanguage(tag);
  return offered.find((candidate) => baseLanguage(candidate) === wanted);
}

/**
 * Picks the language to show. A `choice` the host offers wins. Otherwise the
 * first of `browserLanguages`, in the browser's own order, that the host
 * offers: an exact tag match, or failing that an offered tag with the same
 * language subtag (so a browser's `"af-ZA"` gets an offered `"af"`, and
 * `"en-ZA"` gets an offered `"en-GB"`). Failing all of those, `fallback`.
 * @param choice - The person's stored choice, or `null` to follow the browser.
 * @param offered - The tags the host offers.
 * @param browserLanguages - The browser's languages, most preferred first.
 * @param fallback - The host's default language, returned when nothing matches.
 * @returns A tag from `offered`, or `fallback`.
 */
export function resolveLanguage(
  choice: string | null,
  offered: readonly string[],
  browserLanguages: readonly string[],
  fallback: string,
): string {
  if (choice !== null) {
    const chosen = findExact(offered, choice);
    if (chosen !== undefined) {
      return chosen;
    }
  }
  for (const tag of browserLanguages) {
    const match = findExact(offered, tag) ?? findByBase(offered, tag);
    if (match !== undefined) {
      return match;
    }
  }
  return fallback;
}
