// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { HostText } from "../ports/messages";
import { isHostText } from "./hostText";

/**
 * What {@link checkDefinitionTexts} found wrong with one key:
 *
 * - `missing`: a definition uses the key and the catalogue has no entry of
 *   its own for it, so the source text is shown in every language.
 * - `blank`: the catalogue's entry is blank or not text, so the source text
 *   is shown and `resolveText` warns.
 * - `unused`: the catalogue has an entry that none of the definitions uses.
 */
export type DefinitionTextProblemKind = "missing" | "blank" | "unused";

/** One problem {@link checkDefinitionTexts} found, and the key it is in. */
export interface DefinitionTextProblem {
  readonly key: string;
  readonly problem: DefinitionTextProblemKind;
}

/**
 * The properties of a definition that hold a layer template, not a
 * {@link HostText}. A template has the same `{ key, text }` shape but is
 * translated from `layerTemplates`, so its keys are not definition text.
 * A test reads `layers/definition.ts` and fails when this list drifts from
 * the properties typed as a `LayerTemplate`.
 */
const TEMPLATE_FIELDS: ReadonlySet<string> = new Set([
  "lines",
  "secondary",
  "template",
  "title",
  "unit",
]);

/**
 * The host texts in `definitions` in the order they are first met, one for
 * each key. The walk is generic: it looks at every own property of every
 * object and list, so a field added to a definition later is covered, and it
 * never reads an id, a kind or a provider.
 */
function hostTextsIn(definitions: readonly unknown[]): Map<string, HostText> {
  const found = new Map<string, HostText>();
  const seen = new Set<object>();
  const pending: unknown[] = [...definitions].reverse();
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (isHostText(value)) {
      if (!found.has(value.key)) {
        found.set(value.key, value);
      }
      continue;
    }
    const children = Array.isArray(value)
      ? value
      : Object.entries(value)
          .filter(([name]) => !TEMPLATE_FIELDS.has(name))
          .map(([, child]) => child);
    pending.push(...[...children].reverse());
  }
  return found;
}

/** Whether a translation would hide its text: not text, or only space. */
function isBlank(entry: unknown): boolean {
  return typeof entry !== "string" || entry.trim() === "";
}

/**
 * Checks a host's own definition text against its translations, for a
 * host's own tests: lists the {@link HostText} keys the `definitions` use and
 * reports each that `definitionTexts` lacks or holds blank. A missing entry
 * falls back to the source text without a warning, so this is how a host
 * finds untranslated text before it ships. It only reports: it never throws
 * and does not change how `resolveText` falls back.
 *
 * A plain string and a shipped `MessageKey` are not reported, and neither is
 * a layer template (a card title or line, a list's second line, a unit or a
 * shape label), whose keys belong to `MessageCatalogue.layerTemplates`.
 * `definitions` can hold anything that carries definition text: layer
 * definitions, basemap definitions, keyboard help lines. Keys are read as
 * the record's own properties only.
 *
 * @param definitions - Every definition the host ships. An entry that is
 *   not in the list shows up as `unused`, so pass them all, or leave
 *   `unused` out of the comparison.
 * @param definitionTexts - A catalogue's `definitionTexts` for one language.
 * @returns The problems: each used key that is missing or blank, in the
 *   order the definitions first use it, then each unused entry in the
 *   record's order. An empty list means every key is translated.
 */
export function checkDefinitionTexts(
  definitions: readonly unknown[],
  definitionTexts: Readonly<Record<string, unknown>> | undefined,
): readonly DefinitionTextProblem[] {
  const own = (key: string): boolean =>
    definitionTexts !== undefined && Object.hasOwn(definitionTexts, key);
  const problems: DefinitionTextProblem[] = [];
  const used = hostTextsIn(definitions);
  for (const key of used.keys()) {
    if (!own(key)) {
      problems.push({ key, problem: "missing" });
    } else if (isBlank(definitionTexts?.[key])) {
      problems.push({ key, problem: "blank" });
    }
  }
  for (const key of Object.keys(definitionTexts ?? {})) {
    if (!used.has(key)) {
      problems.push({ key, problem: "unused" });
    }
  }
  return problems;
}
