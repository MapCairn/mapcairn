// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * What a route exports as `handle` when its page is in one language only,
 * whatever language the interface is in: the product page is English only, by
 * decision, so `<html lang>` stays `en-GB` there.
 */
export interface PageLanguageHandle {
  readonly language: string;
}

/** Whether `handle` is a {@link PageLanguageHandle}. */
function isPageLanguageHandle(handle: unknown): handle is PageLanguageHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    typeof (handle as { readonly language?: unknown }).language === "string"
  );
}

/**
 * The fixed language of the deepest route in `matches` that has one, or
 * `undefined` when the page follows the interface's language.
 */
export function fixedPageLanguage(
  matches: ReadonlyArray<{ readonly handle?: unknown }>,
): string | undefined {
  return matches
    .map(({ handle }) => handle)
    .filter(isPageLanguageHandle)
    .at(-1)?.language;
}
