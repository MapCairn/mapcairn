// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FieldValue } from "../ports/layers";
import type { MessageCatalogue } from "../ports/messages";
import type { FormatContext, FormatterRegistry } from "./formatters";

/**
 * Placeholders the map engine fills itself in a tile URL. Templates leave
 * them in place, and validation does not ask for a control for them.
 */
export const ENGINE_PLACEHOLDERS: readonly string[] = [
  "z",
  "x",
  "y",
  "bbox-epsg-3857",
];

/** The four edges of the box a query layer's URL asks for. */
export const QUERY_BOX: readonly string[] = ["west", "south", "east", "north"];

/**
 * Placeholders only a query layer's URL may use: the box and `limit`. They
 * are filled from the view, so no control stands behind them.
 */
export const QUERY_PLACEHOLDERS: readonly string[] = [...QUERY_BOX, "limit"];

/** One `{name}` or `{name|formatter}` in a template. */
export interface TemplatePlaceholder {
  readonly name: string;
  readonly formatter?: string;
}

/** A host-defined translation key and its source text for a layer template. */
export interface KeyedLayerText {
  readonly key: string;
  readonly text: string;
}

/** A literal layer template or a host-keyed template with source text. */
export type LayerTemplate = string | KeyedLayerText;

const PLACEHOLDER = /\{([a-zA-Z0-9_-]+)(?:\|([a-zA-Z0-9_-]+))?\}/g;
const warnedInvalidLayerTemplates = new WeakMap<
  MessageCatalogue,
  Set<string>
>();

/** Lists a template's placeholders, in order. */
export function parseTemplate(template: string): TemplatePlaceholder[] {
  return [...template.matchAll(PLACEHOLDER)].map(([, name, formatter]) =>
    formatter ? { name: name as string, formatter } : { name: name as string },
  );
}

function placeholderSignature(template: string): string[] {
  return parseTemplate(template)
    .map(({ name, formatter }) => `${name}|${formatter ?? ""}`)
    .sort();
}

function placeholdersMatch(source: string, translation: string): boolean {
  const expected = placeholderSignature(source);
  const actual = placeholderSignature(translation);
  return (
    expected.length === actual.length &&
    expected.every((placeholder, index) => placeholder === actual[index])
  );
}

function warnInvalidLayerTemplate(
  catalogue: MessageCatalogue,
  key: string,
): void {
  let warned = warnedInvalidLayerTemplates.get(catalogue);
  if (!warned) {
    warned = new Set();
    warnedInvalidLayerTemplates.set(catalogue, warned);
  }
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(
    `MessageCatalogue: "${catalogue.language}" has an invalid layer template translation for "${key}"; falling back to source text.`,
  );
}

/**
 * Resolves host-keyed layer text when its translation preserves every source
 * field and formatter; otherwise, warns once per key and uses the source text.
 */
export function resolveLayerTemplate(
  template: LayerTemplate,
  catalogue: MessageCatalogue,
): string {
  if (typeof template === "string") {
    return template;
  }
  const translations = catalogue.layerTemplates;
  if (!translations || !Object.hasOwn(translations, template.key)) {
    return template.text;
  }
  const translation = translations[template.key];
  if (
    typeof translation !== "string" ||
    (template.text.trim() !== "" && translation.trim() === "") ||
    !placeholdersMatch(template.text, translation)
  ) {
    warnInvalidLayerTemplate(catalogue, template.key);
    return template.text;
  }
  return translation;
}

/**
 * Fills a URL template from string values, encoding each one. The
 * placeholders named in `leftAlone` are left for the map engine, which are
 * its own (`{z}`, `{x}`, `{y}`, `{bbox-epsg-3857}`) unless a caller says
 * otherwise. A request the engine does not make, such as an identify URL,
 * passes none, so it can fill `{x}` and `{y}` itself.
 *
 * @throws When a variable has no value: a definition that passed validation
 *   never does this, so it is a programming error, not a runtime condition.
 */
export function fillUrlTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  leftAlone: readonly string[] = ENGINE_PLACEHOLDERS,
): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    if (leftAlone.includes(name)) {
      return whole;
    }
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) {
      throw new Error(`The URL template has no value for {${name}}.`);
    }
    return encodeURIComponent(value);
  });
}

/**
 * Fills a card or list template from a feature's fields, through the named
 * formatters. A field that is missing, null or unreadable by its formatter
 * becomes an empty string; when every field the template names is like that,
 * the result is null, so the caller can leave the line out. An unknown
 * formatter writes the value as plain text.
 */
export function formatTemplate(
  template: LayerTemplate,
  fields: Readonly<Record<string, FieldValue>>,
  formatters: FormatterRegistry,
  context: FormatContext,
): string | null {
  let placeholders = 0;
  let filled = 0;
  const text = resolveLayerTemplate(template, context.catalogue).replace(
    PLACEHOLDER,
    (_whole, name: string, formatterName?: string) => {
      placeholders += 1;
      const value = Object.hasOwn(fields, name) ? (fields[name] ?? null) : null;
      if (value === null) {
        return "";
      }
      const formatter = formatterName
        ? formatters.get(formatterName)
        : undefined;
      const result = formatter ? formatter(value, context) : String(value);
      if (result === null) {
        return "";
      }
      filled += 1;
      return result;
    },
  );
  return placeholders > 0 && filled === 0 ? null : text;
}
