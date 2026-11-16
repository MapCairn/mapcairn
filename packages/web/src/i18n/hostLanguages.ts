// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type LanguageCatalogue,
  type LanguageOption,
  type MessageCatalogue,
} from "@mapcairn/core";

/** The language the server renders and the one used when nothing else matches. */
export const DEFAULT_LANGUAGE = "en-GB";

/**
 * The languages the reference host offers, in switcher order, each named in
 * its own language. The switcher shows only when more than one is listed,
 * and the pre-paint script sets `lang` only to a tag listed here.
 */
export const OFFERED_LANGUAGES: readonly LanguageOption[] = [
  { tag: DEFAULT_LANGUAGE, label: "English" },
  { tag: "af", label: "Afrikaans" },
];

/** The tags in {@link OFFERED_LANGUAGES}. */
export const OFFERED_LANGUAGE_TAGS: readonly string[] = OFFERED_LANGUAGES.map(
  ({ tag }) => tag,
);

const ENGLISH = createMessageCatalogue(
  DEFAULT_LANGUAGE,
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
);

/**
 * How to get each language's messages. English is already in the bundle; every
 * other language is its own module, imported when first chosen, so no visitor
 * downloads a language they do not use.
 */
const LOADERS: Readonly<
  Record<string, () => MessageCatalogue | Promise<MessageCatalogue>>
> = {
  [DEFAULT_LANGUAGE]: () => ENGLISH,
  af: async () => {
    const { AF_CATALOGUE } = await import("./af");
    return createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE);
  },
};

/**
 * Loads one language's messages.
 * @throws When the host has no messages for `tag`.
 */
export function loadLanguage(
  tag: string,
): MessageCatalogue | Promise<MessageCatalogue> {
  const loader = LOADERS[tag];
  if (loader === undefined) {
    throw new Error(`The host has no messages for "${tag}".`);
  }
  return loader();
}

/** The catalogue the reference host passes as `Services.languages`. */
export const HOST_LANGUAGE_CATALOGUE: LanguageCatalogue =
  createLanguageCatalogue(OFFERED_LANGUAGES, DEFAULT_LANGUAGE, loadLanguage);
