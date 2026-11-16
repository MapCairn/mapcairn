// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatDay, formatNumber } from "../format/format";
import type { MessageCatalogue, MessageKey } from "../ports/messages";

/** Matches a `{name}` placeholder in a catalogue string. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Substitutes every `{name}` placeholder in `template` from `params`. A
 * number, a `Date` and a list of strings are formatted for `language`; a
 * placeholder with no value is left as written.
 */
function substitute(
  template: string,
  params: Readonly<Record<string, unknown>>,
  language: string,
): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      return whole;
    }
    if (typeof value === "number") {
      return formatNumber(value, language);
    }
    if (value instanceof Date) {
      return formatDay(value, language);
    }
    if (Array.isArray(value)) {
      return new Intl.ListFormat(language, { type: "conjunction" }).format(
        value,
      );
    }
    return String(value);
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
 * `Record<MessageKey, string>` of resolved text, formatted with
 * `Intl.PluralRules` and `Intl.ListFormat`. A key missing from `catalogue`
 * falls back to `fallback`'s value, warning once per missing key for this
 * instance.
 */
export function createMessageCatalogue(
  language: string,
  catalogue: Readonly<Record<MessageKey, string>>,
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
      return substitute(resolve(key), params, language);
    },
    plural(key, params) {
      const { count } = params;
      const form = selectPluralForm(resolve(key), language, count);
      return substitute(form, params, language);
    },
    list(items, type = "conjunction") {
      return new Intl.ListFormat(language, { type }).format(items);
    },
  };
}
