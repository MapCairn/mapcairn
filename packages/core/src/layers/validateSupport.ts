import type { DecoderRegistry } from "./decoders";
import type { FormatterRegistry } from "./formatters";
import { isCategoricalSlot, isOrdinalSlot, isPaletteSlot } from "./palette";
import {
  ENGINE_PLACEHOLDERS,
  parseTemplate,
  QUERY_BOX,
  QUERY_PLACEHOLDERS,
} from "./template";

/** What validation checks names against. */
export interface ValidationOptions {
  readonly decoders: DecoderRegistry;
  readonly formatters: FormatterRegistry;
}

/** An untrusted JSON object, read field by field. */
export type Json = Readonly<Record<string, unknown>>;

/** Ids: lowercase letters, digits and hyphens, starting with a letter. */
export const ID = /^[a-z][a-z0-9-]*$/;
/** Segmented option values. */
export const OPTION_VALUE = /^[a-z0-9._-]+$/;
/** The shapes a point marker can take. */
export const SHAPES = ["circle", "square", "triangle", "diamond"];
/** The largest marker radius in pixels. */
export const MAX_RADIUS = 24;

/** Whether a value is a plain object. */
export function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is text with something in it. */
export function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Whether a value is an `https` URL. */
export function isHttpsUrl(value: unknown): boolean {
  return (
    typeof value === "string" &&
    URL.canParse(value) &&
    new URL(value).protocol === "https:"
  );
}

/** Whether a value is an `https` origin with no path. */
export function isHttpsOrigin(value: unknown): boolean {
  return isHttpsUrl(value) && new URL(value as string).origin === value;
}

/** A value as a list, or an empty one. */
export function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Collects problems as `path: message` lines. */
export class Problems {
  readonly lines: string[] = [];

  add(path: string, message: string): void {
    this.lines.push(`${path}: ${message}`);
  }

  text(value: unknown, path: string): void {
    if (!isText(value)) {
      this.add(path, "must be non-empty text");
    }
  }

  list(value: unknown, path: string, allowEmpty = false): value is unknown[] {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
      this.add(
        path,
        allowEmpty ? "must be a list" : "must be a non-empty list",
      );
      return false;
    }
    return true;
  }

  object(value: unknown, path: string): value is Json {
    if (!isObject(value)) {
      this.add(path, "must be an object");
      return false;
    }
    return true;
  }

  unique(values: readonly unknown[], path: (index: number) => string): void {
    const seen = new Set<unknown>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        this.add(path(index), `duplicate ${String(value)}`);
      }
      seen.add(value);
    });
  }
}

/** What a URL template may use beyond control values and derived variables. */
export interface UrlAllowances {
  /** The engine's own placeholders (`{z}`, `{x}`, `{y}`, `{bbox-epsg-3857}`). */
  readonly engine?: boolean;
  /** A query layer's box and limit; all four box edges are then required. */
  readonly query?: boolean;
}

/** Checks a URL template: https, and every placeholder known. */
export function checkUrl(
  problems: Problems,
  url: unknown,
  path: string,
  known: readonly string[],
  allow: UrlAllowances = {},
): void {
  if (!isText(url) || !isHttpsUrl(url.replace(/[{}]/g, ""))) {
    problems.add(path, "must be an https URL template");
    return;
  }
  const names = parseTemplate(url).map((placeholder) => placeholder.name);
  for (const name of names) {
    let allowed = known.includes(name);
    if (ENGINE_PLACEHOLDERS.includes(name)) {
      allowed = allow.engine === true;
    } else if (QUERY_PLACEHOLDERS.includes(name)) {
      allowed = allow.query === true;
    }
    if (!allowed) {
      problems.add(path, `{${name}} has no control or variable`);
    }
  }
  if (allow.query) {
    for (const edge of QUERY_BOX) {
      if (!names.includes(edge)) {
        problems.add(path, `a query URL must use {${edge}}`);
      }
    }
  }
}

/** Checks the field map and returns the decoded field names. */
export function checkFields(problems: Problems, value: unknown): string[] {
  if (!problems.object(value, "source.fields")) {
    return [];
  }
  const fields = Object.keys(value);
  for (const required of ["id", "title"]) {
    if (!fields.includes(required)) {
      problems.add(`source.fields.${required}`, "is required");
    }
  }
  for (const [name, path] of Object.entries(value)) {
    if (!isText(path)) {
      problems.add(`source.fields.${name}`, "must be a dotted path");
    }
  }
  return fields;
}

/** Checks a card or list template against the decoded fields and formatters. */
export function checkTemplate(
  problems: Problems,
  template: unknown,
  path: string,
  fields: readonly string[],
  options: ValidationOptions,
): void {
  if (!isText(template)) {
    problems.add(path, "must be non-empty text");
    return;
  }
  for (const { name, formatter } of parseTemplate(template)) {
    if (!fields.includes(name)) {
      problems.add(path, `{${name}} is not a field`);
    }
    if (formatter && !options.formatters.has(formatter)) {
      problems.add(path, `formatter ${formatter} is not registered`);
    }
  }
}

/** Checks a palette colour name, optionally of one kind of colour. */
export function checkColourSlot(
  problems: Problems,
  value: unknown,
  path: string,
  kind?: "categorical" | "ordinal",
): void {
  if (!isPaletteSlot(value)) {
    problems.add(path, "must name a palette colour");
  } else if (kind === "ordinal" && !isOrdinalSlot(value)) {
    problems.add(path, "use an ordinal colour for ordered steps");
  } else if (kind === "categorical" && !isCategoricalSlot(value)) {
    problems.add(path, "use a categorical colour for categories");
  }
}
