// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type LanguageCatalogue,
  type LanguageOption,
  languageDirection,
  type MessageCatalogue,
} from "@mapcairn/core";
import {
  DEFAULT_LANGUAGE,
  OFFERED_LANGUAGE_OPTIONS,
} from "./offeredLanguageOptions";

export { DEFAULT_LANGUAGE } from "./offeredLanguageOptions";

declare const __MAPCAIRN_HOST_LANGUAGE_DIRECTIONS__: readonly ("ltr" | "rtl")[];

/**
 * The languages the reference host offers, in switcher order, each named in
 * its own language. The switcher shows only when more than one is listed,
 * and the pre-paint script sets `lang` only to a tag listed here.
 */
export const OFFERED_LANGUAGES: readonly LanguageOption[] =
  OFFERED_LANGUAGE_OPTIONS.map((option, index) => ({
    ...option,
    direction: __MAPCAIRN_HOST_LANGUAGE_DIRECTIONS__[index] ?? "ltr",
  }));

/** The tags in {@link OFFERED_LANGUAGES}. */
export const OFFERED_LANGUAGE_TAGS: readonly string[] = OFFERED_LANGUAGES.map(
  ({ tag }) => tag,
);

/**
 * The reading direction of an offered language, from its option (or, without
 * one, from the tag), for the catalogue to decide whether to isolate the text
 * it substitutes into a sentence.
 */
function directionOf(tag: string): "ltr" | "rtl" {
  return languageDirection(tag, OFFERED_LANGUAGE_OPTIONS);
}

/** The default language's messages, already in the bundle. */
export const ENGLISH = createMessageCatalogue(
  DEFAULT_LANGUAGE,
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
  { direction: directionOf(DEFAULT_LANGUAGE) },
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
    const [{ AF_CATALOGUE }, { AF_LAYER_TEMPLATES }] = await Promise.all([
      import("./af"),
      import("./afLayerTemplates"),
    ]);
    return createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE, {
      layerTemplates: AF_LAYER_TEMPLATES,
      direction: directionOf("af"),
    });
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
