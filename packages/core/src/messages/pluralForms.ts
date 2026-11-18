// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

const CATEGORY_FORM = /(zero|one|two|few|many|other)\{((?:[^{}]|\{\w+\})*)\}/y;

function skipWhitespace(value: string, start: number): number {
  let position = start;
  while (position < value.length && /\s/u.test(value.charAt(position))) {
    position += 1;
  }
  return position;
}

/** Reads category-keyed forms, including placeholders inside each form. */
export function parsePluralForms(
  value: string,
): ReadonlyMap<Intl.LDMLPluralRule, string> | undefined {
  const forms = new Map<Intl.LDMLPluralRule, string>();
  let position = 0;
  while (position < value.length) {
    position = skipWhitespace(value, position);
    if (position === value.length) {
      break;
    }
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
  }
  return forms.size > 0 ? forms : undefined;
}
