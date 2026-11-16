// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue } from "../ports/messages";

/** One language a host offers. */
export interface LanguageOption {
  /** The BCP 47 tag, for example `"en-GB"` or `"af"`. */
  readonly tag: string;
  /** The language's name in that language (an endonym), for example `"Afrikaans"`. */
  readonly label: string;
}

/**
 * The languages a host offers, with the one used when nothing else matches
 * and a way to load each one's messages. Plain data: a host builds one with
 * {@link createLanguageCatalogue} and passes it as `Services.languages`.
 * Without it the ui speaks only `Services.messages` and shows no switcher.
 */
export interface LanguageCatalogue {
  /** Every language, in the order the switcher shows them. */
  readonly languages: readonly LanguageOption[];
  /** The tag of the default language, which is in `languages`. */
  readonly defaultLanguage: string;
  /**
   * Gets the messages for one of `languages`. The default language's can be
   * returned directly; any other may be returned as a promise, so a host can
   * lazy-load it.
   */
  load(tag: string): MessageCatalogue | Promise<MessageCatalogue>;
}

/**
 * Builds a {@link LanguageCatalogue}.
 * @param languages - At least one language, with unique tags.
 * @param defaultLanguage - The default language's tag.
 * @param load - Loads the messages for a tag in `languages`.
 * @throws When the list is empty, repeats a tag, or does not hold `defaultLanguage`.
 */
export function createLanguageCatalogue(
  languages: readonly LanguageOption[],
  defaultLanguage: string,
  load: LanguageCatalogue["load"],
): LanguageCatalogue {
  if (languages.length === 0) {
    throw new Error("A language catalogue needs at least one language.");
  }
  const tags = new Set<string>();
  for (const { tag } of languages) {
    if (tags.has(tag)) {
      throw new Error(`The language tag "${tag}" is used twice.`);
    }
    tags.add(tag);
  }
  if (!tags.has(defaultLanguage)) {
    throw new Error(
      `The default language "${defaultLanguage}" is not in the catalogue.`,
    );
  }
  return { languages, defaultLanguage, load };
}
