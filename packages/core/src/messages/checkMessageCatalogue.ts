// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { parsePluralForms, pluralFormsOf } from "./pluralForms";

/**
 * What {@link checkMessageCatalogue} found wrong with one key:
 *
 * - `missing`: English has the key and the catalogue does not.
 * - `unknown`: the catalogue has a key English does not.
 * - `emptyForm`: the value, or one of its plural forms, is blank.
 * - `placeholders`: a form's `{name}` placeholders differ from those of the
 *   English form of the same plural category, or of English's "other" form
 *   when it has none (a plain value is its own "other" form).
 * - `pluralForms`: the value's plural forms are not the categories
 *   `Intl.PluralRules` gives for the language, or cannot be read.
 * - `copiedEnglish`: the value, or one of its forms, is the English form
 *   it is compared with for placeholders (without case or surrounding space),
 *   and the key is not allowed to match English.
 * - `unusedAllowance`: the key is allowed to match English but does not, or
 *   is not an English key.
 */
export type MessageCatalogueProblemKind =
  | "missing"
  | "unknown"
  | "emptyForm"
  | "placeholders"
  | "pluralForms"
  | "copiedEnglish"
  | "unusedAllowance";

/** One problem {@link checkMessageCatalogue} found, and the key it is in. */
export interface MessageCatalogueProblem {
  readonly key: string;
  readonly problem: MessageCatalogueProblemKind;
}

type Forms = ReadonlyMap<Intl.LDMLPluralRule, string>;

/** A value that opens like category-keyed forms, readable or not. */
const KEYED_START = /^\s*(zero|one|two|few|many|other)\{/;

/** A value's forms by category; a plain value is its own "other" form. */
function formsByCategory(value: string): Forms {
  return (
    pluralFormsOf(value) ??
    new Map<Intl.LDMLPluralRule, string>([["other", value]])
  );
}

/** The `{name}` placeholders in `form`, sorted, deduplicated and joined. */
function placeholdersIn(form: string): string {
  return [...new Set([...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]
    .sort()
    .join();
}

/** A form as it is compared with English: no case, no surrounding space. */
function normalised(form: string): string {
  return form.trim().toLowerCase();
}

function hasEmptyForm(forms: Forms): boolean {
  return [...forms.values()].some((form) => normalised(form) === "");
}

/**
 * The English form a translated form of `category` is compared with: the
 * same category, else English's "other" form.
 */
function englishFormFor(english: Forms, category: Intl.LDMLPluralRule) {
  return english.get(category) ?? english.get("other") ?? "";
}

function hasOtherPlaceholders(forms: Forms, english: Forms): boolean {
  return [...forms].some(
    ([category, form]) =>
      placeholdersIn(form) !==
      placeholdersIn(englishFormFor(english, category)),
  );
}

/**
 * Whether `value` fails to express exactly `categories`. A plain value
 * stands for "other", and is checked only when English has forms.
 */
function hasWrongPluralForms(
  value: string,
  english: string,
  categories: readonly Intl.LDMLPluralRule[],
): boolean {
  if (
    !parsePluralForms(value) &&
    (KEYED_START.test(value) || value.split("|").length > 2)
  ) {
    return true;
  }
  const own = pluralFormsOf(value);
  if (!own && !pluralFormsOf(english)) {
    return false;
  }
  const expressed = own ? [...own.keys()] : ["other"];
  return expressed.sort().join() !== [...categories].sort().join();
}

function isCopied(forms: Forms, english: Forms): boolean {
  return [...forms].some(
    ([category, form]) =>
      normalised(form) === normalised(englishFormFor(english, category)),
  );
}

/**
 * Checks a host's message catalogue against the English one, for a host's
 * own tests or a command line: every key is present and known, each plural
 * form keeps the English placeholders, the plural forms are the categories
 * `Intl.PluralRules` gives for `language`, and no value is copied from
 * English. Values may be plain, `one|other` or category-keyed, as
 * {@link createMessageCatalogue} reads them.
 *
 * @param sameAsEnglish - Keys whose value may match English (a symbol, a
 *   name kept as published), each with the reason. An allowance with a blank
 *   reason does not count.
 * @returns Every problem found, in English key order, then unknown keys and
 *   unused allowances. An empty list means the catalogue passes; a
 *   translation in progress can leave out the `missing` problems.
 */
export function checkMessageCatalogue(
  language: string,
  catalogue: Readonly<Partial<Record<string, string>>>,
  english: Readonly<Record<string, string>>,
  sameAsEnglish: Readonly<Partial<Record<string, string>>> = {},
): readonly MessageCatalogueProblem[] {
  const categories = new Intl.PluralRules(language).resolvedOptions()
    .pluralCategories;
  const problems: MessageCatalogueProblem[] = [];
  const report = (key: string, problem: MessageCatalogueProblemKind) => {
    problems.push({ key, problem });
  };
  for (const [key, englishValue] of Object.entries(english)) {
    const value = catalogue[key];
    if (value === undefined) {
      report(key, "missing");
      continue;
    }
    const forms = formsByCategory(value);
    const englishForms = formsByCategory(englishValue);
    if (hasEmptyForm(forms)) {
      report(key, "emptyForm");
    }
    if (hasOtherPlaceholders(forms, englishForms)) {
      report(key, "placeholders");
    }
    if (hasWrongPluralForms(value, englishValue, categories)) {
      report(key, "pluralForms");
    }
    const copied = isCopied(forms, englishForms);
    const allowed = (sameAsEnglish[key]?.trim() ?? "") !== "";
    if (copied && !allowed) {
      report(key, "copiedEnglish");
    }
    if (!copied && allowed) {
      report(key, "unusedAllowance");
    }
  }
  for (const key of Object.keys(catalogue)) {
    if (!Object.hasOwn(english, key)) {
      report(key, "unknown");
    }
  }
  for (const key of Object.keys(sameAsEnglish)) {
    if (!Object.hasOwn(english, key)) {
      report(key, "unusedAllowance");
    }
  }
  return problems;
}
