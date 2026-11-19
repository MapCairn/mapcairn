// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  EN_GB_CATALOGUE,
  LANGUAGE_STORAGE_KEY,
  type MessageKey,
} from "@mapcairn/core";
import { AF_CATALOGUE } from "../../src/i18n/af";
import { ARABIC_SAMPLE } from "./arabicSample";
import {
  type CatalogueText,
  expandedPseudoCatalogue,
  mirroredPseudoCatalogue,
} from "./pseudoLocale";

export type { CatalogueText } from "./pseudoLocale";

/** The languages the reference site ships, by tag. */
export const SHIPPED_CATALOGUES: Readonly<Record<string, CatalogueText>> = {
  "en-GB": EN_GB_CATALOGUE,
  af: AF_CATALOGUE,
};

/** A sample language a test offers through the test seam: not shipped, and not a translation. */
export interface SampleLanguage {
  readonly tag: string;
  readonly label: string;
  readonly direction: "ltr" | "rtl";
  readonly messages: Readonly<Partial<Record<MessageKey, string>>>;
}

/**
 * The sample languages the `language` option may name, by tag: accented and
 * expanded English (`en-XA`), English isolated as right-to-left text with the
 * page mirrored (`en-XB`), and a small Arabic sample (`ar`). The page gets
 * them on `window.__MAPCAIRN_TEST_LANGUAGES__`, which the host's test seam
 * reads; they exist only in the browser tests and never ship.
 */
export const SAMPLE_LANGUAGES: Readonly<Record<string, SampleLanguage>> = {
  "en-XA": {
    tag: "en-XA",
    label: "English (expanded)",
    direction: "ltr",
    messages: expandedPseudoCatalogue(),
  },
  "en-XB": {
    tag: "en-XB",
    label: "English (mirrored)",
    direction: "rtl",
    messages: mirroredPseudoCatalogue(),
  },
  ar: {
    tag: "ar",
    label: "العربية",
    direction: "rtl",
    messages: ARABIC_SAMPLE,
  },
};

/** Puts the sample languages on the page's test seam. Runs in the page, as an init script. */
export function offerSampleLanguages(samples: readonly SampleLanguage[]): void {
  window.__MAPCAIRN_TEST_LANGUAGES__ = samples;
}

/**
 * The text of the language `tag`, or English when no language is chosen. A
 * sample language falls back to English for a key it leaves out, as the app
 * does.
 */
export function catalogueText(tag: string | null): CatalogueText {
  const sample = SAMPLE_LANGUAGES[tag ?? ""];
  if (sample !== undefined) {
    return { ...EN_GB_CATALOGUE, ...sample.messages };
  }
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

/** The forms of a catalogue value: the parts between `|`, or the text inside each `category{...}`. */
function formsOf(template: string): string[] {
  const keyed = [
    ...template.matchAll(
      /\b(?:zero|one|two|few|many|other)\{((?:[^{}]|\{\w+\})*)\}/g,
    ),
  ];
  return keyed.length > 0
    ? keyed.map((form) => form[1] as string)
    : template.split("|");
}

/** Matches the bidirectional isolate marks (U+2066 to U+2069) the app puts around a substituted value whose direction differs from its sentence's. */
const ISOLATES = "[\\u2066-\\u2069]*";

/** `text` as a pattern that also matches it with isolate marks anywhere in it. */
function tolerantOfIsolates(text: string): string {
  return `${ISOLATES}${[...text].map(escapeForPattern).join(ISOLATES)}${ISOLATES}`;
}

/**
 * A pattern matching any form of a catalogue value, whole, with each
 * placeholder named in `numbers` as a whole number (in any script's digits)
 * and every other placeholder as any text, so a locator can find a name such
 * as "Key, 2 layers" in any language.
 */
export function namePattern(
  template: string,
  numbers: readonly string[] = ["count"],
): RegExp {
  const forms = formsOf(template).map((form) =>
    form
      .split(/(\{\w+\})/)
      .map((part) => {
        const placeholder = /^\{(\w+)\}$/.exec(part)?.[1];
        if (placeholder === undefined) {
          return tolerantOfIsolates(part);
        }
        return numbers.includes(placeholder) ? "\\p{Nd}+" : ".+";
      })
      .join(""),
  );
  return new RegExp(`^(?:${forms.join("|")})$`, "u");
}

/**
 * A pattern matching a catalogue value with `values` filled in, as the app
 * shows it, with or without the isolate marks the app puts around a
 * substituted value, which a plain string would not match.
 */
export function filledPattern(
  template: string,
  values: Readonly<Record<string, string>>,
): RegExp {
  const source = template
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      const value = name === undefined ? undefined : values[name];
      return value === undefined
        ? tolerantOfIsolates(part)
        : `${ISOLATES}${tolerantOfIsolates(value)}${ISOLATES}`;
    })
    .join("");
  return new RegExp(source, "u");
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
