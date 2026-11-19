// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  DefinitionText,
  HostText,
  Message,
  MessageCatalogue,
  MessageKey,
  MessagePart,
} from "../ports/messages";
import { EN_GB_CATALOGUE } from "./en-GB";
import { isHostText } from "./hostText";

/**
 * Whether `text` is a key of the shipped catalogue. The check is against the
 * English catalogue's own keys, so a host text is not one, and neither is a
 * plain string that merely looks like a key (an unknown dotted name, or
 * `constructor`).
 */
export function isMessageKey(text: DefinitionText): text is MessageKey {
  return typeof text === "string" && Object.hasOwn(EN_GB_CATALOGUE, text);
}

const warnedBlankTexts = new WeakMap<MessageCatalogue, Set<string>>();

function warnBlankTranslation(catalogue: MessageCatalogue, key: string): void {
  const warned = warnedBlankTexts.get(catalogue) ?? new Set<string>();
  warnedBlankTexts.set(catalogue, warned);
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(
    `MessageCatalogue: "${catalogue.language}" has a blank definition text translation for "${key}"; falling back to source text.`,
  );
}

/**
 * The words for a host's own {@link HostText}: the catalogue's own entry for
 * its key, or the source text when there is none. A supplied blank or
 * non-string entry would hide the text, so it falls back to the source with
 * one warning per key for each catalogue.
 */
function resolveHostText(catalogue: MessageCatalogue, text: HostText): string {
  const translations = catalogue.definitionTexts;
  if (!translations || !Object.hasOwn(translations, text.key)) {
    return text.text;
  }
  const translation: unknown = translations[text.key];
  if (typeof translation !== "string" || translation.trim() === "") {
    warnBlankTranslation(catalogue, text.key);
    return text.text;
  }
  return translation;
}

/**
 * The words a person reads for a definition's text. A basemap or layer
 * definition writes such a field as a {@link MessageKey}, a {@link HostText}
 * or a plain string: a key is looked up in `catalogue`, a host key is
 * translated from `catalogue.definitionTexts` with its source text as the
 * fallback, and anything else, including a third-party definition's own
 * English, is returned unchanged. A key that takes parameters is not meant
 * for a definition, so none are passed.
 */
export function resolveText(
  catalogue: MessageCatalogue,
  text: DefinitionText,
): string {
  if (isHostText(text)) {
    return resolveHostText(catalogue, text);
  }
  return isMessageKey(text) ? catalogue.t(text, {}) : text;
}

/**
 * A definition's text as a placeholder value for a {@link Message}: a key
 * becomes a message with no parameters, which the one place that speaks the
 * sentence formats in the active language, and a plain string stays as it is.
 * Use it where a pure helper builds an announcement from a definition's name
 * and has no catalogue to hand. A {@link HostText} is passed on as it is:
 * `formatMessage` reads it with the active catalogue.
 */
export function textOrMessage(text: DefinitionText): MessagePart {
  if (isHostText(text)) {
    return text;
  }
  return isMessageKey(text) ? ({ key: text, params: {} } as Message) : text;
}
