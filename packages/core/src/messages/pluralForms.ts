// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

const CATEGORY_FORM =
  /\s*(zero|one|two|few|many|other)\{((?:[^{}]|\{\w+\})*)\}/gy;

/** Reads category-keyed forms, including placeholders inside each form. */
export function parsePluralForms(
  value: string,
): ReadonlyMap<Intl.LDMLPluralRule, string> | undefined {
  const forms = new Map<Intl.LDMLPluralRule, string>();
  let position = 0;
  while (position < value.length) {
    CATEGORY_FORM.lastIndex = position;
    const match = CATEGORY_FORM.exec(value);
    if (!match) {
      return undefined;
    }
    const category = match[1] as Intl.LDMLPluralRule;
    if (forms.has(category)) {
      return undefined;
    }
    forms.set(category, match[2] ?? "");
    position = CATEGORY_FORM.lastIndex;
    if (value.slice(position).trim() === "") {
      break;
    }
  }
  return forms.size > 0 ? forms : undefined;
}
