// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  DefinitionText,
  Message,
  MessageCatalogue,
  MessageKey,
} from "../ports/messages";
import { EN_GB_CATALOGUE } from "./en-GB";

/**
 * Whether `text` is a key of the shipped catalogue. The check is against the
 * English catalogue's own keys, so a plain string that merely looks like a
 * key (an unknown dotted name, or `constructor`) is not one.
 */
export function isMessageKey(text: string): text is MessageKey {
  return Object.hasOwn(EN_GB_CATALOGUE, text);
}

/**
 * The words a person reads for a definition's text. A basemap or layer
 * definition writes such a field as a {@link MessageKey} or as a plain
 * string: a key is looked up in `catalogue`, and anything else, including a
 * third-party definition's own English, is returned unchanged. A key that
 * takes parameters is not meant for a definition, so none are passed.
 */
export function resolveText(
  catalogue: MessageCatalogue,
  text: DefinitionText,
): string {
  return isMessageKey(text) ? catalogue.t(text, {}) : text;
}

/**
 * A definition's text as a placeholder value for a {@link Message}: a key
 * becomes a message with no parameters, which the one place that speaks the
 * sentence formats in the active language, and a plain string stays as it is.
 * Use it where a pure helper builds an announcement from a definition's name
 * and has no catalogue to hand.
 */
export function textOrMessage(text: DefinitionText): string | Message {
  return isMessageKey(text) ? ({ key: text, params: {} } as Message) : text;
}
