// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatDay, formatLocale, formatNumber } from "../format/format";
import type { MessageCatalogue, MessageKey } from "../ports/messages";
import { pluralFormsOf } from "./pluralForms";

/** Optional controls for host translations and the fallback record. */
export interface CreateMessageCatalogueOptions {
  /** Translations for host-keyed layer templates, units and labels. */
  readonly layerTemplates?: Readonly<Record<string, string>>;
  /** Translations for host-keyed definition text (`HostText`), by key. */
  readonly definitionTexts?: Readonly<Record<string, string>>;
  /** BCP 47 tag of the fallback record's language. Defaults to `en-GB`. */
  readonly fallbackLanguage?: string;
  /**
   * An `Intl` numbering system such as "latn", to write numbers and days in
   * instead of the language's own digits. Left out, they follow the
   * language's `Intl` defaults. A malformed value (it must be 3 to 8
   * letters or digits, such as "latn") is ignored with one `console.warn`.
   */
  readonly numberingSystem?: string;
}

/** Matches a `{name}` placeholder in a catalogue string. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Substitutes every `{name}` placeholder in `template` from `params`. A
 * number and a `Date` are formatted for `locale`, the language with its
 * numbering system; a list of strings is formatted for `language`. A
 * placeholder with no value is left as written.
 */
function substitute(
  template: string,
  params: Readonly<Record<string, unknown>>,
  language: string,
  locale: string,
): string {
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
        value,
      );
    }
    return String(value);
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
    ...(options.definitionTexts
      ? { definitionTexts: options.definitionTexts }
      : {}),
    t(key, params) {
      return substitute(resolve(key).template, params, language, locale);
    },
    plural(key, params) {
      const { count } = params;
      const resolved = resolve(key);
      const form = selectPluralForm(
        resolved.template,
        resolved.language,
        count,
      );
      return substitute(form, params, language, locale);
    },
    list(items, type = "conjunction") {
      return new Intl.ListFormat(language, { type }).format(items);
    },
  };
}
