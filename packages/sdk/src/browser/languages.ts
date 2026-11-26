// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type LanguageCatalogue,
  type LanguageOption,
  type MessageCatalogue,
  type MessageKey,
} from "@mapcairn/core";
import { MountMapError } from "./MountMapError";
import type { MountLanguage } from "./types";

const ENGLISH_TAG = "en-GB";
const ENGLISH_LABEL = "English";

/** What {@link buildLanguages} makes from the `languages` and `language` options. */
export interface BuiltLanguages {
  /** The languages offered, or undefined when the page offers none besides English. */
  readonly catalogue: LanguageCatalogue | undefined;
  /** The language to start on, or null to follow the browser's. */
  readonly initial: string | null;
}

function invalid(message: string): never {
  throw new MountMapError("invalid-option", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLanguageTag(tag: unknown): tag is string {
  if (typeof tag !== "string" || tag === "") {
    return false;
  }
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

function assertMessages(messages: unknown, name: string): void {
  if (!isObject(messages) || Array.isArray(messages)) {
    invalid(`${name}.messages must be an object of message keys and text.`);
  }
  for (const [key, text] of Object.entries(messages)) {
    if (typeof text !== "string") {
      invalid(`${name}.messages: "${key}" must be text.`);
    }
  }
}

/**
 * The language's text laid over English, so a key it leaves out reads in
 * English without a warning for each one. A key this version has no message
 * for is ignored with one warning: keys are added over time, so a page written
 * for a later version still works.
 */
function overEnglish(language: MountLanguage): Record<string, string> {
  const merged: Record<string, string> = { ...EN_GB_CATALOGUE };
  for (const [key, text] of Object.entries(language.messages)) {
    if (Object.hasOwn(EN_GB_CATALOGUE, key)) {
      merged[key] = text as string;
    } else {
      console.warn(
        `languages: "${language.tag}" has text for "${key}", which is not a message key in this version, so it is ignored.`,
      );
    }
  }
  return merged;
}

function assertLanguage(language: unknown, index: number): MountLanguage {
  const name = `languages[${index}]`;
  if (!isObject(language)) {
    invalid(`${name} must be an object with a tag, a label and messages.`);
  }
  if (!isLanguageTag(language.tag)) {
    invalid(`${name}.tag must be a language tag such as "af".`);
  }
  if (typeof language.label !== "string" || language.label === "") {
    invalid(`${name}.label must be the language's name, in that language.`);
  }
  if (
    language.direction !== undefined &&
    language.direction !== "ltr" &&
    language.direction !== "rtl"
  ) {
    invalid(`${name}.direction must be "ltr" or "rtl".`);
  }
  assertMessages(language.messages, name);
  return language as unknown as MountLanguage;
}

function assertDistinctTags(languages: readonly MountLanguage[]): void {
  const seen = new Set<string>([ENGLISH_TAG]);
  for (const { tag } of languages) {
    if (seen.has(tag)) {
      const english =
        tag === ENGLISH_TAG
          ? ` English (${ENGLISH_TAG}) is always offered, so leave it out.`
          : "";
      invalid(
        `languages: the tag "${tag}" is used twice. Give each language its own tag.${english}`,
      );
    }
    seen.add(tag);
  }
}

function messagesFor(language: MountLanguage): MessageCatalogue {
  return createMessageCatalogue(
    language.tag,
    overEnglish(language) as Record<MessageKey, string>,
    EN_GB_CATALOGUE,
    {
      ...(language.direction === undefined
        ? {}
        : { direction: language.direction }),
    },
  );
}

/**
 * Builds the language catalogue over English from the page's plain data, and
 * the language to start on. English is always first and is the fallback, so a
 * key a language leaves out reads in English.
 *
 * @throws MountMapError naming the fix for a list, a language, a tag used
 *   twice or a `language` that is not offered.
 */
export function buildLanguages(
  languages: unknown,
  language: string | undefined,
): BuiltLanguages {
  if (languages !== undefined && !Array.isArray(languages)) {
    invalid(
      'languages must be a list, such as [{ tag: "af", label: "Afrikaans", messages: {} }].',
    );
  }
  const offered = (languages ?? []).map(assertLanguage);
  assertDistinctTags(offered);
  const tags = [ENGLISH_TAG, ...offered.map(({ tag }) => tag)];
  if (language !== undefined && !tags.includes(language)) {
    invalid(
      `language "${language}" is not offered. Use one of: ${tags.join(", ")}, or add it to languages.`,
    );
  }
  const initial = language ?? null;
  if (offered.length === 0) {
    return { catalogue: undefined, initial };
  }
  const english = createMessageCatalogue(
    ENGLISH_TAG,
    EN_GB_CATALOGUE,
    EN_GB_CATALOGUE,
  );
  const loaded = new Map<string, MessageCatalogue>([[ENGLISH_TAG, english]]);
  for (const entry of offered) {
    loaded.set(entry.tag, messagesFor(entry));
  }
  const options: readonly LanguageOption[] = [
    { tag: ENGLISH_TAG, label: ENGLISH_LABEL },
    ...offered.map(({ tag, label, direction }) => ({
      tag,
      label,
      ...(direction === undefined ? {} : { direction }),
    })),
  ];
  return {
    catalogue: createLanguageCatalogue(options, ENGLISH_TAG, (tag) => {
      const messages = loaded.get(tag);
      if (messages === undefined) {
        throw new Error(`The language "${tag}" is not offered.`);
      }
      return messages;
    }),
    initial,
  };
}
