// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { parsePluralForms, pluralFormsOf } from "./pluralForms";

/**
 * What {@link checkMessageCatalogue} found wrong with one key:
 *
 * - `missing`: English has the key and the catalogue does not.
 * - `unknown`: the catalogue has a key English does not.
 * - `emptyForm`: the value, or one of its plural forms, is blank.
 * - `placeholders`: the value, or one of its plural forms, does not have
 *   exactly the `{name}` placeholders the English value has across all its
 *   forms. A plural category does not cover the same numbers in every
 *   language (Russian "one" also covers 21), so no form may leave one out.
 * - `pluralForms`: the forms of a plural key's value are not the categories
 *   `Intl.PluralRules` gives for the language, or its braces or bars cannot
 *   be read.
 * - `copiedEnglish`: the value, or one of its forms, is the English form of
 *   the same category, or English's "other" form (without case or
 *   surrounding space), and the key is not allowed to match English.
 * - `unusedAllowance`: an entry in `sameAsEnglish` with a blank reason, or
 *   for a key whose value is missing or does not match English, or that
 *   English does not have; an entry in `pluralKeys` for a key English does
 *   not have, or whose English value has forms; or an entry in `notPlural`
 *   for a key English does not have, or for which neither value has forms.
 * - `conflictingOptions`: a key in both `pluralKeys` and `notPlural`. It is
 *   then read as if it were in neither.
 */
export type MessageCatalogueProblemKind =
  | "missing"
  | "unknown"
  | "emptyForm"
  | "placeholders"
  | "pluralForms"
  | "copiedEnglish"
  | "unusedAllowance"
  | "conflictingOptions";

/** One problem {@link checkMessageCatalogue} found, and the key it is in. */
export interface MessageCatalogueProblem {
  /** The key that has the problem. */
  readonly key: string;
  /** What is wrong with it. */
  readonly problem: MessageCatalogueProblemKind;
}

/** What {@link checkMessageCatalogue} allows beyond its rules. */
export interface MessageCatalogueCheckOptions {
  /**
   * Keys whose value may match English (a symbol, a name kept as
   * published), each with the reason. Only its own properties count.
   */
  readonly sameAsEnglish?: Readonly<Partial<Record<string, string>>>;
  /**
   * Keys read with `plural` whose English value has no forms, so that a
   * translation without forms is still checked as plural: a plain value
   * must then be the language's only category, and must be readable.
   */
  readonly pluralKeys?: readonly string[];
  /**
   * Keys read only with `t` whose English value or translation reads like
   * plural forms (it has a `|`, say) but is text. Their values are checked
   * as text.
   */
  readonly notPlural?: readonly string[];
}

type Forms = ReadonlyMap<Intl.LDMLPluralRule, string>;

/** A value that opens like category-keyed forms, readable or not. */
const KEYED_START = /^\s*(zero|one|two|few|many|other)\{/;

const PLACEHOLDER = /\{(\w+)\}/g;

/** A value read as text: one "other" form, bars and braces included. */
function asText(value: string): Forms {
  return new Map<Intl.LDMLPluralRule, string>([["other", value]]);
}

/** A plural key's value by category; a plain value is its "other" form. */
function formsByCategory(value: string): Forms {
  return pluralFormsOf(value) ?? asText(value);
}

/** The `{name}` placeholders in `forms` together, sorted and joined. */
function placeholdersIn(forms: Iterable<string>): string {
  const names = new Set<string | undefined>();
  for (const form of forms) {
    for (const match of form.matchAll(PLACEHOLDER)) {
      names.add(match[1]);
    }
  }
  return [...names].sort().join();
}

/** A form as it is compared with English: no case, no surrounding space. */
function normalised(form: string): string {
  return form.trim().toLowerCase();
}

function hasEmptyForm(forms: Forms): boolean {
  return [...forms.values()].some((form) => normalised(form) === "");
}

function hasOtherPlaceholders(forms: Forms, english: Forms): boolean {
  const expected = placeholdersIn(english.values());
  return [...forms.values()].some(
    (form) => placeholdersIn([form]) !== expected,
  );
}

/**
 * Whether a plural key's `value` cannot be read as `createMessageCatalogue`
 * means it: keyed forms it cannot parse, more than two `|` forms, or a
 * brace that is not part of a `{name}` placeholder.
 */
function isUnreadable(value: string): boolean {
  return (
    !parsePluralForms(value) &&
    (KEYED_START.test(value) ||
      value.split("|").length > 2 ||
      /[{}]/.test(value.replace(PLACEHOLDER, "")))
  );
}

/**
 * Whether a plural key's `value` fails to express exactly `categories`. A
 * plain value stands for "other".
 */
function hasWrongPluralForms(
  value: string,
  categories: readonly Intl.LDMLPluralRule[],
): boolean {
  if (isUnreadable(value)) {
    return true;
  }
  const own = pluralFormsOf(value);
  const expressed = own ? [...own.keys()] : ["other"];
  return expressed.sort().join() !== [...categories].sort().join();
}

/** Whether the English value or the translation has plural forms. */
function hasForms(english: string, value: string | undefined): boolean {
  return (
    pluralFormsOf(english) !== undefined ||
    (value !== undefined && pluralFormsOf(value) !== undefined)
  );
}

/**
 * The English form a translated form of `category` is compared with for a
 * copy: the same category, else English's "other" form.
 */
function englishFormFor(english: Forms, category: Intl.LDMLPluralRule) {
  return english.get(category) ?? english.get("other") ?? "";
}

function isCopied(forms: Forms, english: Forms): boolean {
  return [...forms].some(
    ([category, form]) =>
      normalised(form) === normalised(englishFormFor(english, category)),
  );
}

/**
 * The problems with one key's `value` other than a copy, given whether the
 * key is `plural`.
 */
function formProblems(
  forms: Forms,
  englishForms: Forms,
  value: string,
  plural: boolean,
  categories: readonly Intl.LDMLPluralRule[],
): MessageCatalogueProblemKind[] {
  const found: MessageCatalogueProblemKind[] = [];
  if (hasEmptyForm(forms)) {
    found.push("emptyForm");
  }
  if (hasOtherPlaceholders(forms, englishForms)) {
    found.push("placeholders");
  }
  if (plural && hasWrongPluralForms(value, categories)) {
    found.push("pluralForms");
  }
  return found;
}

/**
 * The value `record` holds as its own property `key`, never one inherited
 * from its prototype, so a key such as `constructor` reads like any other.
 */
function ownValue(
  record: Readonly<Partial<Record<string, string>>>,
  key: string,
): string | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Checks a host's message catalogue against the English one, for a host's
 * own tests or a command line: every key is present and known, every form
 * keeps all the English placeholders, the plural forms are the categories
 * `Intl.PluralRules` gives for `language`, and no value is copied from
 * English. A key is plural when it is in `options.pluralKeys`, or when its
 * English value or the translation has forms (`one|other` or
 * category-keyed, as {@link createMessageCatalogue} reads them) and it is
 * not in `options.notPlural`; any other value is checked as text.
 *
 * @param options - Keys allowed to match English, plural keys whose English
 *   value has no forms, and keys read only with `t` whose values only look
 *   plural. An entry that is not needed is reported, as is an allowance
 *   with a blank reason and a key in both key lists.
 * @returns Every problem found: those of each English key in English key
 *   order, then unknown keys, then unneeded `sameAsEnglish`, `pluralKeys`
 *   and `notPlural` entries in that order, then keys in both key lists.
 *   An empty list means the catalogue passes;
 *   a translation in progress can leave out the `missing` problems. Keys
 *   are read only as a record's own properties.
 */
export function checkMessageCatalogue(
  language: string,
  catalogue: Readonly<Partial<Record<string, string>>>,
  english: Readonly<Record<string, string>>,
  options: MessageCatalogueCheckOptions = {},
): readonly MessageCatalogueProblem[] {
  const { sameAsEnglish = {}, pluralKeys = [], notPlural = [] } = options;
  const conflicting = pluralKeys.filter((key) => notPlural.includes(key));
  const plainKeys = new Set(notPlural.filter((k) => !conflicting.includes(k)));
  const listedPlural = new Set(
    pluralKeys.filter((k) => !conflicting.includes(k)),
  );
  const categories = new Intl.PluralRules(language).resolvedOptions()
    .pluralCategories;
  const problems: MessageCatalogueProblem[] = [];
  const report = (key: string, problem: MessageCatalogueProblemKind) => {
    problems.push({ key, problem });
  };
  const allowed = (key: string) =>
    (ownValue(sameAsEnglish, key)?.trim() ?? "") !== "";
  const copiedKeys = new Set<string>();
  for (const [key, englishValue] of Object.entries(english)) {
    const value = ownValue(catalogue, key);
    if (value === undefined) {
      report(key, "missing");
      continue;
    }
    const plural =
      listedPlural.has(key) ||
      (!plainKeys.has(key) && hasForms(englishValue, value));
    const read = plural ? formsByCategory : asText;
    const forms = read(value);
    const englishForms = read(englishValue);
    for (const problem of formProblems(
      forms,
      englishForms,
      value,
      plural,
      categories,
    )) {
      report(key, problem);
    }
    if (isCopied(forms, englishForms)) {
      copiedKeys.add(key);
      if (!allowed(key)) {
        report(key, "copiedEnglish");
      }
    }
  }
  for (const key of Object.keys(catalogue)) {
    if (!Object.hasOwn(english, key)) {
      report(key, "unknown");
    }
  }
  for (const key of Object.keys(sameAsEnglish)) {
    if (!(allowed(key) && copiedKeys.has(key))) {
      report(key, "unusedAllowance");
    }
  }
  problems.push(
    ...keyListProblems(catalogue, english, listedPlural, plainKeys),
    ...[...new Set(conflicting)].map(
      (key): MessageCatalogueProblem => ({
        key,
        problem: "conflictingOptions",
      }),
    ),
  );
  return problems;
}

/**
 * The `pluralKeys` and `notPlural` entries that are not needed: for a key
 * English does not have, a plural key whose English value already has
 * forms, or a not-plural key for which neither value has forms.
 */
function keyListProblems(
  catalogue: Readonly<Partial<Record<string, string>>>,
  english: Readonly<Record<string, string>>,
  listedPlural: ReadonlySet<string>,
  plainKeys: ReadonlySet<string>,
): MessageCatalogueProblem[] {
  const unneeded = (key: string): MessageCatalogueProblem => ({
    key,
    problem: "unusedAllowance",
  });
  const plural = [...listedPlural].filter((key) => {
    const englishValue = ownValue(english, key);
    return englishValue === undefined || pluralFormsOf(englishValue);
  });
  const plain = [...plainKeys].filter((key) => {
    const englishValue = ownValue(english, key);
    return (
      englishValue === undefined ||
      !hasForms(englishValue, ownValue(catalogue, key))
    );
  });
  return [...plural, ...plain].map(unneeded);
}
