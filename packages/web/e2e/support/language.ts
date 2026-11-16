// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  EN_GB_CATALOGUE,
  LANGUAGE_STORAGE_KEY,
  type MessageKey,
} from "@mapcairn/core";
import { AF_CATALOGUE } from "../../src/i18n/af";

/** One language's text for every key, as a host catalogue holds it. */
export type CatalogueText = Readonly<Record<MessageKey, string>>;

/** The languages the reference site ships, by tag. */
export const SHIPPED_CATALOGUES: Readonly<Record<string, CatalogueText>> = {
  "en-GB": EN_GB_CATALOGUE,
  af: AF_CATALOGUE,
};

/** The text of the language `tag`, or English when no language is chosen. */
export function catalogueText(tag: string | null): CatalogueText {
  const text = SHIPPED_CATALOGUES[tag ?? "en-GB"];
  if (text === undefined) {
    throw new Error(`The site ships no catalogue for "${tag}".`);
  }
  return text;
}

/** `text` escaped for use inside a regular expression. */
function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A pattern matching any form of a catalogue value, whole, with each
 * placeholder named in `numbers` as a whole number and every other
 * placeholder as any text, so a locator can find a name such as "Map key, 2
 * layers" in any language.
 */
export function namePattern(
  template: string,
  numbers: readonly string[] = ["count"],
): RegExp {
  const forms = template.split("|").map((form) =>
    form
      .split(/(\{\w+\})/)
      .map((part) => {
        const placeholder = /^\{(\w+)\}$/.exec(part)?.[1];
        if (placeholder === undefined) {
          return escapeForPattern(part);
        }
        return numbers.includes(placeholder) ? "\\d+" : ".+";
      })
      .join(""),
  );
  return new RegExp(`^(?:${forms.join("|")})$`);
}

/** A pattern matching names that begin with `text`. */
export function startsWith(text: string): RegExp {
  return new RegExp(`^${escapeForPattern(text)}`);
}

/** What {@link storeLanguageBeforeLoad} needs, passed into the page. */
export interface StoredLanguage {
  readonly key: string;
  readonly tag: string;
}

/** The stored language for `tag`, under the key the settings store reads. */
export function storedLanguage(tag: string): StoredLanguage {
  return { key: LANGUAGE_STORAGE_KEY, tag };
}

/**
 * Stores a language as the person's choice before the app loads, as the
 * Settings panel would, unless a choice is already stored, so a reload keeps
 * what the person picked since. Runs in the page, as an init script.
 */
export function storeLanguageBeforeLoad({ key, tag }: StoredLanguage): void {
  if (localStorage.getItem(key) === null) {
    localStorage.setItem(key, JSON.stringify(tag));
  }
}
