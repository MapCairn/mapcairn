// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatDay, formatLocale, formatNumber } from "../format/format";
import type { MessageCatalogue, MessageKey } from "../ports/messages";
import { isolate } from "./isolate";
import { languageDirection } from "./languageDirection";
import { pluralFormsOf } from "./pluralForms";

/** Optional controls for host translations and the fallback record. */
export interface CreateMessageCatalogueOptions {
  /** Translations for host-keyed layer templates, units and labels. */
  readonly layerTemplates?: Readonly<Record<string, string>>;
  /** BCP 47 tag of the fallback record's language. Defaults to `en-GB`. */
  readonly fallbackLanguage?: string;
  /**
   * An `Intl` numbering system such as "latn", to write numbers and days in
   * instead of the language's own digits. Left out, they follow the
   * language's `Intl` defaults. A malformed value (it must be 3 to 8
   * letters or digits, such as "latn") is ignored with one `console.warn`.
   */
  readonly numberingSystem?: string;
  /**
   * The reading direction of the language, for a host that sets it apart from
   * what `Intl` infers from the tag (the `direction` of its `LanguageOption`).
   * Left out, it comes from `languageDirection(language)`. It decides the
   * default of `isolateParameters`.
   */
  readonly direction?: "ltr" | "rtl";
  /**
   * Whether to wrap each text parameter, and each item of a list, in a Unicode
   * first-strong isolate, so a place name, a coordinate or a distance cannot
   * reorder the sentence around it. `list` isolates its items too. Left out,
   * it is on when `direction` (or, without it, the language) reads right to
   * left and off otherwise, which keeps every string plain. The marks are
   * invisible and sit in the text a catalogue returns, so copy a value from
   * its source, not from a message, and strip them (U+2066 to U+2069) from the
   * text before an exact-name assertion in a host's tests.
   */
  readonly isolateParameters?: boolean;
}

/** Matches a `{name}` placeholder in a catalogue string. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Substitutes every `{name}` placeholder in `template` from `params`. A
 * number and a `Date` are formatted for `locale`, the language with its
 * numbering system; a list of strings is formatted for `language`. Text and
 * list items are isolated when `isolating`. A placeholder with no value is
 * left as written.
 */
function substitute(
  template: string,
  params: Readonly<Record<string, unknown>>,
  language: string,
  locale: string,
  isolating: boolean,
): string {
  const wrap = isolating ? isolate : (text: string) => text;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      return whole;
    }
    if (typeof value === "number") {
      return formatNumber(value, locale);
    }
    if (value instanceof Date) {
      return formatDay(value, locale);
    }
    if (Array.isArray(value)) {
      return new Intl.ListFormat(language, { type: "conjunction" }).format(
        value.map((item) => wrap(String(item))),
      );
    }
    return wrap(String(value));
  });
}

/**
 * Selects the form of `template` for `count`'s plural category in
 * `language`, falling back to its "other" form. A plain template is used
 * regardless of count.
 */
function selectPluralForm(
  template: string,
  language: string,
  count: number,
): string {
  const forms = pluralFormsOf(template);
  if (!forms) {
    return template;
  }
  const category = new Intl.PluralRules(language).select(count);
  return forms.get(category) ?? forms.get("other") ?? template;
}

/**
 * `numberingSystem` when `Intl` accepts it for `language`; otherwise `undefined`,
 * with one warning, so a malformed value (too short, say "x") cannot make every
 * number throw. A well-formed system the runtime does not know is accepted by
 * `Intl` and falls back to the language's own digits.
 */
function usableNumberingSystem(
  language: string,
  numberingSystem: string | undefined,
): string | undefined {
  if (numberingSystem === undefined) {
    return undefined;
  }
  try {
    new Intl.Locale(language, { numberingSystem });
    return numberingSystem;
  } catch {
    console.warn(
      `MessageCatalogue: "${numberingSystem}" is not a valid numbering system for "${language}"; using the language's own digits.`,
    );
    return undefined;
  }
}

/**
 * Builds the dependency-free default {@link MessageCatalogue}: a plain
 * `Record<MessageKey, string>` of resolved text (partial, for a translation
 * in progress), formatted with `Intl.PluralRules` and `Intl.ListFormat`. A key
 * missing from `catalogue` falls back to `fallback`'s value, using its
 * language for plural selection and warning once per missing key for this
 * instance. Substitutions continue to use the active `language`.
 */
export function createMessageCatalogue(
  language: string,
  catalogue: Readonly<Partial<Record<MessageKey, string>>>,
  fallback: Readonly<Record<MessageKey, string>>,
  options: CreateMessageCatalogueOptions = {},
): MessageCatalogue {
  const warned = new Set<MessageKey>();
  const fallbackLanguage = options.fallbackLanguage ?? "en-GB";
  const numberingSystem = usableNumberingSystem(
    language,
    options.numberingSystem,
  );
  const locale = formatLocale({ language, numberingSystem });
  const isolating =
    options.isolateParameters ??
    (options.direction ?? languageDirection(language)) === "rtl";
  const wrap = isolating ? isolate : (text: string) => text;

  function resolve(key: MessageKey): {
    readonly template: string;
    readonly language: string;
  } {
    const value = catalogue[key];
    if (value !== undefined) {
      return { template: value, language };
    }
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(
        `MessageCatalogue: "${language}" has no value for "${key}"; falling back to "${fallbackLanguage}".`,
      );
    }
    return { template: fallback[key], language: fallbackLanguage };
  }

  return {
    language,
    ...(numberingSystem === undefined ? {} : { numberingSystem }),
    ...(options.layerTemplates
      ? { layerTemplates: options.layerTemplates }
      : {}),
    t(key, params) {
      return substitute(
        resolve(key).template,
        params,
        language,
        locale,
        isolating,
      );
    },
    plural(key, params) {
      const { count } = params;
      const resolved = resolve(key);
      const form = selectPluralForm(
        resolved.template,
        resolved.language,
        count,
      );
      return substitute(form, params, language, locale, isolating);
    },
    list(items, type = "conjunction") {
      return new Intl.ListFormat(language, { type }).format(items.map(wrap));
    },
  };
}
