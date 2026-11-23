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
  /** The key that has the problem. */
  readonly key: string;
  /** What is wrong with it. */
  readonly problem: DefinitionTextProblemKind;
}

/**
 * The positions in a definition that hold a layer template, written as the
 * name of the property that holds the object, a dot and the template's own
 * property (a list passes through to its items). A template has the same
 * `{ key, text }` shape as a {@link HostText} but is translated from
 * `layerTemplates`, so its keys are not definition text. A position, not a
 * bare name, is skipped: a `title` anywhere else is still read. A test reads
 * `layers/definition.ts` and fails when a property typed as a `LayerTemplate`
 * is missing here.
 */
const TEMPLATE_POSITIONS: ReadonlySet<string> = new Set([
  "card.title",
  "card.lines",
  "list.secondary",
  "controls.unit",
  "colour.unit",
  "label.template",
]);

/** A value still to be read, with the property that holds it. */
interface Pending {
  readonly value: unknown;
  /** The property that holds `value`; a list is transparent. */
  readonly name: string;
}

/**
 * The host texts in `definitions` in the order they are first met, one for
 * each key. The walk is generic: it reads every own property of every
 * object and list (a getter is read; a `Map` or `Set` is not visited), so a
 * field added to a definition later is covered, and it never reads an id, a
 * kind or a provider. It skips only the template positions above.
 */
function hostTextsIn(definitions: readonly unknown[]): Map<string, HostText> {
  const found = new Map<string, HostText>();
  const seen = new Set<object>();
  const pending: Pending[] = [];
  const push = (values: Iterable<unknown>, name: string): void => {
    const items = [...values];
    for (let index = items.length - 1; index >= 0; index -= 1) {
      pending.push({ value: items[index], name });
    }
  };
  push(definitions, "");
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const { value, name } = node;
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (isHostText(value)) {
      if (!found.has(value.key)) {
        found.set(value.key, value);
      }
    } else if (Array.isArray(value)) {
      push(value, name);
    } else {
      const entries = Object.entries(value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [property, child] = entries[index] as [string, unknown];
        if (!TEMPLATE_POSITIONS.has(`${name}.${property}`)) {
          pending.push({ value: child, name: property });
        }
      }
    }
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
 * a layer template (a card's `title` and `lines`, a list's `secondary`, a
 * control's or colour's `unit` and a label's `template`), whose keys belong
 * to `MessageCatalogue.layerTemplates`. Any other `{ key, text }` object is
 * read as a `HostText`, wherever it is. `definitions` can hold anything that
 * carries definition text: layer definitions, basemap definitions, keyboard
 * help lines. The walk reads own properties (getters are read) and the items
 * of lists; a `Map` or a `Set` is not visited. Keys are read as the record's
 * own properties only.
 *
 * @param definitions - Every definition the host ships. An entry for a
 *   definition that is not in the list shows up as `unused`, so a test that
 *   passes only some of its definitions leaves `unused` out of what it
 *   compares.
 * @param definitionTexts - A catalogue's `definitionTexts` for one language.
 *   With none (or a value that is not an object) every key is `missing`.
 *   An entry that is `undefined` counts as missing, and one that is not
 *   text, or only space, as `blank`.
 * @returns The problems: each used key that is missing or blank, in the
 *   order the definitions first use it, then each unused entry in the
 *   record's order. An empty list means every key is translated.
 */
export function checkDefinitionTexts(
  definitions: readonly unknown[],
  definitionTexts: Readonly<Record<string, unknown>> | null | undefined,
): readonly DefinitionTextProblem[] {
  const texts: Readonly<Record<string, unknown>> =
    typeof definitionTexts === "object" && definitionTexts !== null
      ? definitionTexts
      : {};
  const problems: DefinitionTextProblem[] = [];
  const used = hostTextsIn(definitions);
  for (const key of used.keys()) {
    if (!Object.hasOwn(texts, key) || texts[key] === undefined) {
      problems.push({ key, problem: "missing" });
    } else if (isBlank(texts[key])) {
      problems.push({ key, problem: "blank" });
    }
  }
  for (const key of Object.keys(texts)) {
    if (!used.has(key)) {
      problems.push({ key, problem: "unused" });
    }
  }
  return problems;
}
