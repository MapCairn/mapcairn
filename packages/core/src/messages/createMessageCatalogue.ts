// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue, MessageKey } from "../ports/messages";

/** Matches a `{name}` placeholder in a catalogue string. */
const PLACEHOLDER = /\{(\w+)\}/g;

/** Substitutes every `{name}` placeholder in `template` from `params`. */
function substitute(
  template: string,
  params: Readonly<Record<string, unknown>>,
): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Picks the plural form out of a `|`-separated catalogue string: the first
 * form for `Intl.PluralRules`'s "one" category, the second form for every
 * other category. A template with no `|` has one form, used regardless of
 * `count`.
 */
function selectPluralForm(
  template: string,
  language: string,
  count: number,
): string {
  const forms = template.split("|");
  if (forms.length === 1) {
    return template;
  }
  const category = new Intl.PluralRules(language).select(count);
  return category === "one"
    ? (forms[0] ?? template)
    : (forms[1] ?? forms[0] ?? template);
}

/**
 * Builds the dependency-free default {@link MessageCatalogue}: a plain
 * `Record<MessageKey, string>` of resolved text (partial, for a translation
 * in progress), formatted with `Intl.PluralRules` and `Intl.ListFormat`. A key missing from `catalogue`
 * falls back to `fallback`'s value, warning once per missing key for this
 * instance.
 */
export function createMessageCatalogue(
  language: string,
  catalogue: Readonly<Partial<Record<MessageKey, string>>>,
  fallback: Readonly<Record<MessageKey, string>>,
): MessageCatalogue {
  const warned = new Set<MessageKey>();

  function resolve(key: MessageKey): string {
    const value = catalogue[key];
    if (value !== undefined) {
      return value;
    }
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(
        `MessageCatalogue: "${language}" has no value for "${key}"; falling back to English.`,
      );
    }
    return fallback[key];
  }

  return {
    language,
    t(key, params) {
      return substitute(resolve(key), params);
    },
    plural(key, params) {
      const { count } = params;
      const form = selectPluralForm(resolve(key), language, count);
      return substitute(form, params);
    },
    list(items, type = "conjunction") {
      return new Intl.ListFormat(language, { type }).format(items);
    },
  };
}
