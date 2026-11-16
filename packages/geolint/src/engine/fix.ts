// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { splitJson } from "./reader/jsonSplitter.js";
import type { Rule, RuleContext } from "./types.js";

/**
 * The order the fixes run in. One fix can create work for another: rounding
 * can make two positions equal (so duplicates go after unclosed rings and
 * before precision is settled), and closing a ring gives it a winding. Winding
 * runs last, on rings that are now closed and free of repeats.
 */
export const FIX_ORDER: readonly string[] = [
  "unclosed-ring",
  "duplicate-vertices",
  "precision",
  "winding-order",
];

/** How many times the fixes are applied to one feature before giving up on it settling. */
export const MAX_FIX_PASSES = 8;

/** Thrown when an input cannot be fixed, such as invalid JSON. Nothing is written for it. */
export class FixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixError";
  }
}

/** What a fix run did. */
export interface FixStats {
  /** Features read. */
  features: number;
  /** Features whose content changed. */
  changed: number;
}

/**
 * Applies the fix of every active rule that has one, in `FIX_ORDER`, until a
 * whole pass changes nothing (at most `MAX_FIX_PASSES` times). Returns the same
 * object when nothing needed fixing. A rule that is not in `rules` (because it
 * was ignored) is not applied.
 */
export function fixFeature(
  value: unknown,
  context: RuleContext,
  rules: readonly Rule[],
): unknown {
  const fixers = FIX_ORDER.flatMap((id) => {
    const rule = rules.find((candidate) => candidate.id === id);
    return rule?.fix ? [rule.fix] : [];
  });
  let current = value;
  for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
    const before = current;
    for (const fix of fixers) {
      current = fix(current, context);
    }
    if (current === before) {
      break;
    }
  }
  return current;
}

const FEATURES_KEY = "features";

const DECODER = new TextDecoder("utf-8", { fatal: true });

function decode(bytes: Uint8Array): string {
  try {
    return DECODER.decode(bytes);
  } catch {
    throw new FixError("The input is not valid UTF-8.");
  }
}

function parse(text: string, offset: number): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new FixError(
      `Invalid JSON at byte ${offset}: ${(error as SyntaxError).message}`,
    );
  }
}

const NOT_AN_OBJECT =
  "The document root is not a JSON object, so there is nothing to fix.";

const GEOMETRY_TYPES: ReadonlySet<string> = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

/** Fixes a root that has no `features` array: a Feature, or a bare geometry that is wrapped to be fixed. */
function fixRoot(
  members: readonly { key: string; text: string }[],
  context: RuleContext,
  rules: readonly Rule[],
  stats: FixStats,
): string {
  const text = `{${members.map(({ key, text: value }) => `${JSON.stringify(key)}:${value}`).join(",")}}`;
  const root = parse(text, 0) as Record<string, unknown>;
  stats.features += 1;
  const isGeometry =
    typeof root.type === "string" && GEOMETRY_TYPES.has(root.type);
  if (root.type !== "Feature" && !isGeometry) {
    return text;
  }
  const subject = isGeometry
    ? { type: "Feature", properties: null, geometry: root }
    : root;
  const fixed = fixFeature(subject, context, rules);
  if (fixed === subject) {
    return text;
  }
  stats.changed += 1;
  return JSON.stringify(
    isGeometry ? (fixed as { geometry: unknown }).geometry : fixed,
  );
}

/** Builds the fixed text of a document piece by piece, as the splitter reports it. */
class FixWriter {
  private readonly pending: { key: string; text: string }[] = [];
  private started = false;
  private inArray = false;
  /** Whether a repeated `features` array is being copied unchanged. */
  private copying = false;
  private featuresSeen = false;
  private first = true;

  constructor(
    private readonly context: RuleContext,
    private readonly rules: readonly Rule[],
    private readonly stats: FixStats,
  ) {}

  /** Text that closes the streamed array, if one is open. */
  private closeArray(): string {
    if (this.copying) {
      this.copying = false;
      return this.append("]");
    }
    if (!this.inArray) {
      return "";
    }
    this.inArray = false;
    return "]";
  }

  /**
   * Text for the part of a repeated `features` array that is being copied. Once
   * the document has started it is written as it comes; before that, the first
   * `features` member was not an array, and the copy waits with the pending members.
   */
  private append(text: string): string {
    if (this.started) {
      return text;
    }
    const entry = this.pending[this.pending.length - 1] as { text: string };
    entry.text += text;
    return "";
  }

  element(bytes: Uint8Array, offset: number): string {
    const text = decode(bytes);
    const value = parse(text, offset);
    if (this.copying) {
      return this.copyElement(text);
    }
    const fixed = fixFeature(value, this.context, this.rules);
    this.stats.features += 1;
    if (fixed !== value) {
      this.stats.changed += 1;
    }
    const piece = fixed === value ? text : JSON.stringify(fixed);
    const separator = this.first ? "" : ",";
    this.first = false;
    return `${separator}${piece}`;
  }

  /** An element of a repeated `features` array: kept as written, and not counted or fixed. */
  private copyElement(text: string): string {
    const separator = this.first ? "" : ",";
    this.first = false;
    return this.append(`${separator}${text}`);
  }

  /** A member of the root object other than the streamed array. */
  member(key: string, bytes: Uint8Array): string {
    const closing = this.closeArray();
    this.featuresSeen ||= key === FEATURES_KEY;
    const entry = { key, text: decode(bytes) };
    if (!this.started) {
      this.pending.push(entry);
      return closing;
    }
    return `${closing},${JSON.stringify(entry.key)}:${entry.text}`;
  }

  /** The start of the streamed `features` array: the root's opening and the members seen so far. */
  arrayStart(): string {
    if (this.featuresSeen) {
      return this.repeatedArrayStart();
    }
    this.featuresSeen = true;
    const head = this.pending
      .map(({ key, text }) => `${JSON.stringify(key)}:${text},`)
      .join("");
    this.started = true;
    this.inArray = true;
    this.first = true;
    return `{${head}"features":[`;
  }

  /**
   * The start of a `features` array after the first `features` member. The
   * linter checks only the first, so this one is copied unchanged and none of
   * its features are fixed; nothing is dropped from the output.
   */
  private repeatedArrayStart(): string {
    const closing = this.closeArray();
    this.copying = true;
    this.first = true;
    if (this.started) {
      return `${closing},"${FEATURES_KEY}":[`;
    }
    this.pending.push({ key: FEATURES_KEY, text: "[" });
    return closing;
  }

  /** The end of the document. */
  end(): string {
    const closing = this.closeArray();
    if (this.started) {
      return `${closing}}`;
    }
    return fixRoot(this.pending, this.context, this.rules, this.stats);
  }
}

/**
 * Streams a fixed copy of a GeoJSON document as text. A FeatureCollection is
 * written feature by feature, so memory follows the largest feature; a feature
 * that needed nothing keeps its original text, and members other than
 * `features` keep theirs, in their original order. Whitespace between the
 * parts is not kept. A Feature or a bare geometry at the root is fixed whole.
 * Throws `FixError`, before or part-way through, when the input is not valid
 * JSON or its root is not an object; the caller should discard what it wrote.
 */
export async function* fixBytes(
  chunks: AsyncIterable<Uint8Array>,
  context: RuleContext,
  rules: readonly Rule[],
  stats: FixStats,
): AsyncGenerator<string> {
  const writer = new FixWriter(context, rules, stats);
  for await (const batch of splitJson(chunks, { streamKey: "features" })) {
    let text = "";
    for (const event of batch) {
      switch (event.kind) {
        case "error":
          throw new FixError(`${event.message} (byte ${event.offset})`);
        case "value":
          throw new FixError(NOT_AN_OBJECT);
        case "arrayStart":
          if (event.key === undefined) {
            throw new FixError(NOT_AN_OBJECT);
          }
          text += writer.arrayStart();
          break;
        case "element":
          text += writer.element(event.bytes, event.offset);
          break;
        case "member":
          text += writer.member(event.key, event.bytes);
          break;
      }
    }
    if (text !== "") {
      yield text;
    }
  }
  yield writer.end();
}
