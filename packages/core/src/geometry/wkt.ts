// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, Geometry, Position } from "geojson";
import { GeometryError } from "./errors";
import { fixedDecimal } from "./fixedDecimal";
import { MAX_COLLECTION_DEPTH, validateGeometry } from "./validate";

/** Options for {@link formatWkt}. */
export interface FormatWktOptions {
  /**
   * Round every number to this many decimal places, a whole number from 0 to
   * 20. Without it each number is written with the digits needed to read it
   * back exactly. Either way a number is written as plain decimal text, never
   * with an exponent (`0.00000078`, not `7.8e-7`).
   */
  readonly precision?: number;
}

/**
 * The order of the first two numbers of a position in WKT text: `lng-lat`
 * (longitude, then latitude, as the OGC standard and GeoJSON have it) or
 * `lat-lng`, which some systems write.
 */
export type WktAxisOrder = "lng-lat" | "lat-lng";

/** Options for {@link parseWkt} and {@link readWktSequence}. */
export interface ParseWktOptions {
  /** Which number of a position is the longitude. Default `lng-lat`. */
  readonly axisOrder?: WktAxisOrder;
}

/** The characters that are a token of their own. */
type Punctuation = "(" | ")" | "," | "=" | ";";

type Token =
  | { readonly kind: "word"; readonly text: string; readonly at: number }
  | { readonly kind: "number"; readonly text: string; readonly at: number }
  | { readonly kind: Punctuation | "end"; readonly at: number };

const KEYWORDS = new Set([
  "POINT",
  "LINESTRING",
  "POLYGON",
  "MULTIPOINT",
  "MULTILINESTRING",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
]);

/** Valid WKT shapes this reader does not turn into GeoJSON. */
const UNSUPPORTED_KEYWORDS = new Set([
  "CIRCULARSTRING",
  "COMPOUNDCURVE",
  "CURVEPOLYGON",
  "CURVE",
  "MULTICURVE",
  "MULTISURFACE",
  "SURFACE",
  "POLYHEDRALSURFACE",
  "TRIANGLE",
  "TIN",
]);

function measureUnsupported(): GeometryError {
  return new GeometryError(
    "unsupported",
    "Coordinates with a measure (M) are not supported.",
  );
}

/**
 * Splits a trailing dimension tag off a type word, so `POINTZ` reads as
 * `POINT` with `Z`. A word that is not a known type with a tag is returned
 * whole, with no tag.
 */
function splitSuffix(word: string): [string, string] {
  for (const suffix of ["ZM", "Z", "M"]) {
    const base = word.slice(0, word.length - suffix.length);
    if (word.endsWith(suffix) && KEYWORDS.has(base)) {
      return [base, suffix];
    }
  }
  return [word, ""];
}

/**
 * A geometry type word, or the `SRID` of an EWKT prefix with its `=`, after
 * any white space on the same line. Sticky, so it matches at an offset.
 */
const GEOMETRY_START = /[^\S\r\n]*([A-Za-z]+)([^\S\r\n]*=)?/y;

/** The only SRID the reader accepts: WGS 84, which WKT without a prefix is in. */
export const SUPPORTED_WKT_SRID = 4326;

/**
 * The most digits an SRID may have. Real codes have five or fewer; the limit
 * keeps the value an exact integer and a hostile run of digits from being read
 * or printed back.
 */
const MAX_SRID_DIGITS = 9;

/**
 * The error for text in a spatial reference system other than
 * {@link SUPPORTED_WKT_SRID}. It is an `unsupported` {@link GeometryError}
 * that also says which SRID, so a caller can tell it from the other things the
 * reader leaves out (a measure, a curve).
 */
export class UnsupportedSridError extends GeometryError {
  /** The SRID the text named. */
  readonly srid: number;

  constructor(srid: number) {
    super(
      "unsupported",
      `Only SRID ${SUPPORTED_WKT_SRID} (WGS 84) is supported, not SRID ${srid}.`,
    );
    this.name = "UnsupportedSridError";
    this.srid = srid;
  }
}

/**
 * Whether the text starts with the name of a WKT geometry type (in any case,
 * with or without a `Z`, `M` or `ZM` tag), including the curved types
 * {@link parseWkt} does not read, or with an EWKT `SRID=` prefix. It says what
 * the text is meant to be, not whether it can be read: use it to tell a
 * damaged WKT file from a file that is something else.
 */
export function startsLikeWkt(text: string): boolean {
  return startsGeometryAt(text, text.length - text.trimStart().length);
}

/** Whether a geometry type word or an EWKT `SRID=` begins at `offset`, after any spaces on its line. */
function startsGeometryAt(text: string, offset: number): boolean {
  GEOMETRY_START.lastIndex = offset;
  const match = GEOMETRY_START.exec(text);
  if (match === null) {
    return false;
  }
  const word = (match[1] as string).toUpperCase();
  if (word === "SRID") {
    return match[2] !== undefined;
  }
  const [type] = splitSuffix(word);
  return KEYWORDS.has(type) || UNSUPPORTED_KEYWORDS.has(type);
}

/** The offset of the first line break at or after `from`, or the length of the text. */
function lineEnd(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10 || code === 13) {
      return index;
    }
  }
  return text.length;
}

function refuse(message: string, at: number): GeometryError {
  return new GeometryError("invalid", `${message} at position ${at + 1}.`);
}

function isLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isSpace(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13);
}

/** Characters that can appear inside a number: digits, signs, point, exponent. */
function isNumberCharacter(code: number): boolean {
  return (
    isDigit(code) ||
    code === 43 || // +
    code === 45 || // -
    code === 46 || // .
    code === 69 || // E
    code === 101 // e
  );
}

/** The punctuation a character is, or `undefined` when it is not one. */
function punctuationOf(character: string): Punctuation | undefined {
  switch (character) {
    case "(":
    case ")":
    case ",":
    case "=":
    case ";":
      return character;
    default:
      return undefined;
  }
}

/**
 * Reads tokens one at a time, left to right, with one token of look-ahead.
 * It never goes back over text, so the whole parse is linear in the length of
 * the input, whatever the input holds.
 */
class Tokens {
  readonly #text: string;
  #index = 0;
  #peeked: Token | undefined;
  #depth = 0;
  #taken = 0;
  #lastAt = 0;

  constructor(text: string) {
    this.#text = text;
  }

  peek(): Token {
    this.#peeked ??= this.#read();
    return this.#peeked;
  }

  next(): Token {
    const token = this.peek();
    this.#peeked = undefined;
    this.#taken += 1;
    this.#lastAt = token.at;
    if (token.kind === "(") {
      this.#depth += 1;
    } else if (token.kind === ")") {
      this.#depth -= 1;
    }
    return token;
  }

  /** How many brackets are open among the tokens taken since {@link startGeometry}. */
  get depth(): number {
    return this.#depth;
  }

  /** Starts counting brackets and tokens afresh, for the next geometry. */
  startGeometry(): void {
    this.#depth = 0;
    this.#taken = 0;
  }

  /** The offset of the end of the line that holds `offset`. */
  lineEndFrom(offset: number): number {
    return lineEnd(this.#text, offset);
  }

  /**
   * Gives up on the text read so far and moves to where a geometry can start
   * again: the token that broke the geometry, if it is the first on its line
   * and starts another geometry (a line cut short is followed by the next
   * line's), or else the first later line that does, or the end of the text
   * when none does. It never goes back to the first token of the geometry, so
   * it always makes progress.
   */
  resync(): void {
    const peeked = this.#peeked;
    const broke = peeked ? peeked.at : this.#lastAt;
    const moved = peeked !== undefined || this.#taken > 1;
    if (
      moved &&
      this.#firstOnLine(broke) &&
      startsGeometryAt(this.#text, broke)
    ) {
      this.#peeked = undefined;
      this.#index = broke;
      return;
    }
    const from = peeked ? peeked.at : this.#index;
    this.#peeked = undefined;
    let line = lineEnd(this.#text, from) + 1;
    while (line < this.#text.length && !startsGeometryAt(this.#text, line)) {
      line = lineEnd(this.#text, line) + 1;
    }
    this.#index = Math.min(line, this.#text.length);
  }

  #firstOnLine(at: number): boolean {
    for (let index = at - 1; index >= 0; index -= 1) {
      const code = this.#text.charCodeAt(index);
      if (code === 10 || code === 13) {
        return true;
      }
      if (!isSpace(code)) {
        return false;
      }
    }
    return true;
  }

  #read(): Token {
    const text = this.#text;
    const length = text.length;
    while (this.#index < length && isSpace(text.charCodeAt(this.#index))) {
      this.#index += 1;
    }
    const at = this.#index;
    if (at >= length) {
      return { kind: "end", at };
    }
    const code = text.charCodeAt(at);
    const punctuation = punctuationOf(text.charAt(at));
    if (punctuation !== undefined) {
      this.#index += 1;
      return { kind: punctuation, at };
    }
    if (isLetter(code)) {
      let end = at + 1;
      while (end < length && isLetter(text.charCodeAt(end))) {
        end += 1;
      }
      this.#index = end;
      return { kind: "word", text: text.slice(at, end), at };
    }
    if (isNumberCharacter(code)) {
      let end = at + 1;
      while (end < length && isNumberCharacter(text.charCodeAt(end))) {
        end += 1;
      }
      this.#index = end;
      return { kind: "number", text: text.slice(at, end), at };
    }
    throw refuse("Unexpected character", at);
  }
}

/**
 * The value of a number token, or `undefined` when its text is not a decimal
 * number with an optional sign, fraction and exponent, or is too large to
 * hold. Checked by hand, one character at a time, so no input can make it
 * backtrack.
 */
function numberValue(text: string): number | undefined {
  const length = text.length;
  let index = 0;
  if (text.charCodeAt(index) === 43 || text.charCodeAt(index) === 45) {
    index += 1;
  }
  let digits = 0;
  while (index < length && isDigit(text.charCodeAt(index))) {
    index += 1;
    digits += 1;
  }
  if (text.charCodeAt(index) === 46) {
    index += 1;
    while (index < length && isDigit(text.charCodeAt(index))) {
      index += 1;
      digits += 1;
    }
  }
  if (digits === 0) {
    return undefined;
  }
  if (text.charCodeAt(index) === 69 || text.charCodeAt(index) === 101) {
    index += 1;
    if (text.charCodeAt(index) === 43 || text.charCodeAt(index) === 45) {
      index += 1;
    }
    let exponent = 0;
    while (index < length && isDigit(text.charCodeAt(index))) {
      index += 1;
      exponent += 1;
    }
    if (exponent === 0) {
      return undefined;
    }
  }
  if (index !== length) {
    return undefined;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** Whether a number token is a plain run of digits, one to {@link MAX_SRID_DIGITS} of them. */
function isSridDigits(text: string): boolean {
  if (text.length === 0 || text.length > MAX_SRID_DIGITS) {
    return false;
  }
  for (let index = 0; index < text.length; index += 1) {
    if (!isDigit(text.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

type Dimensions = "any" | "z";

class Reader {
  readonly #tokens: Tokens;
  readonly #latitudeFirst: boolean;

  constructor(text: string, axisOrder: WktAxisOrder) {
    this.#tokens = new Tokens(text);
    this.#latitudeFirst = axisOrder === "lat-lng";
  }

  /** Reads one geometry, then insists on the end of the text. */
  readAll(): Geometry {
    const geometry = this.#wholeGeometry();
    const rest = this.#tokens.next();
    if (rest.kind !== "end") {
      throw refuse("Unexpected text after the geometry", rest.at);
    }
    return geometry;
  }

  /** Reads one geometry or more, one after another, up to the end of the text. */
  readSequence(): Geometry[] {
    const geometries = [this.#wholeGeometry()];
    while (this.#tokens.peek().kind !== "end") {
      geometries.push(this.#wholeGeometry());
    }
    return geometries;
  }

  /**
   * Reads geometries one after another to the end of the text, giving the
   * error for each stretch that cannot be used and going on after it.
   */
  *readRecovering(): Generator<Geometry | GeometryError, void> {
    do {
      yield this.#attempt();
    } while (!this.#atEnd());
  }

  /** Whether only the end of the text is left. A character that cannot be read counts as more text. */
  #atEnd(): boolean {
    try {
      return this.#tokens.peek().kind === "end";
    } catch {
      return false;
    }
  }

  /** One geometry, or its error with the reader moved on to where the next geometry may start. */
  #attempt(): Geometry | GeometryError {
    this.#tokens.startGeometry();
    let start = 0;
    try {
      start = this.#tokens.peek().at;
      return this.#wholeGeometry();
    } catch (error) {
      // The tokenizer and the reader throw nothing but a GeometryError.
      const failure = error as GeometryError;
      this.#recover(failure, start);
      return failure;
    }
  }

  /**
   * Moves past a geometry that failed. One that is valid WKT the reader leaves
   * out (a measure, a curve, another SRID) is skipped to its closing bracket,
   * so geometries after it on the same line are kept; if its brackets do not
   * close on the line it began on, or the text is damaged, reading goes on at
   * the next line that starts a geometry.
   */
  #recover(error: GeometryError, start: number): void {
    if (error.kind === "unsupported" && this.#skipGeometry(start)) {
      return;
    }
    this.#tokens.resync();
  }

  /**
   * Takes the tokens that are left of a geometry: up to the bracket that
   * closes it, or an `EMPTY` outside any bracket. Gives up, returning false,
   * at the end of the line the geometry began on or of the text.
   */
  #skipGeometry(start: number): boolean {
    const end = this.#tokens.lineEndFrom(start);
    for (;;) {
      let token: Token;
      try {
        token = this.#tokens.peek();
      } catch {
        return false;
      }
      if (token.kind === "end" || token.at >= end) {
        return false;
      }
      this.#tokens.next();
      const closed =
        (token.kind === ")" && this.#tokens.depth <= 0) ||
        (token.kind === "word" &&
          token.text.toUpperCase() === "EMPTY" &&
          this.#tokens.depth === 0);
      if (closed) {
        return true;
      }
    }
  }

  /** One geometry of the text, with the EWKT prefix it may start with. */
  #wholeGeometry(): Geometry {
    this.#srid();
    return this.#geometry(0);
  }

  #expect(kind: Punctuation): void {
    const token = this.#tokens.next();
    if (token.kind !== kind) {
      throw refuse(`Expected "${kind}"`, token.at);
    }
  }

  #accept(kind: "(" | ")" | ","): boolean {
    if (this.#tokens.peek().kind === kind) {
      this.#tokens.next();
      return true;
    }
    return false;
  }

  #number(): number {
    const token = this.#tokens.next();
    if (token.kind !== "number") {
      throw refuse("Expected a number", token.at);
    }
    const value = numberValue(token.text);
    if (value === undefined) {
      throw refuse("Not a valid number", token.at);
    }
    return value;
  }

  #position(dimensions: Dimensions): Position {
    const at = this.#tokens.peek().at;
    const first = this.#number();
    const second = this.#number();
    const position = this.#latitudeFirst ? [second, first] : [first, second];
    if (this.#tokens.peek().kind === "number") {
      position.push(this.#number());
    }
    if (dimensions === "z" && position.length !== 3) {
      throw refuse("A Z position needs three numbers", at);
    }
    return position;
  }

  /** `item {"," item}`, up to and including the closing bracket. */
  #list<T>(item: () => T): T[] {
    this.#expect("(");
    const items = [item()];
    while (this.#accept(",")) {
      items.push(item());
    }
    this.#expect(")");
    return items;
  }

  #empty(): boolean {
    const token = this.#tokens.peek();
    if (token.kind === "word" && token.text.toUpperCase() === "EMPTY") {
      this.#tokens.next();
      return true;
    }
    return false;
  }

  /**
   * Reads an optional EWKT `SRID=4326;` prefix, which may start a whole
   * geometry and nothing nested in one. Any other SRID is refused as
   * {@link UnsupportedSridError}, because the reader keeps coordinates as
   * written and WGS 84 is the one system the map draws.
   */
  #srid(): void {
    const first = this.#tokens.peek();
    if (first.kind !== "word" || first.text.toUpperCase() !== "SRID") {
      return;
    }
    this.#tokens.next();
    this.#expect("=");
    const code = this.#tokens.next();
    if (code.kind !== "number") {
      throw refuse("Expected an SRID", code.at);
    }
    if (!isSridDigits(code.text)) {
      throw refuse(
        `An SRID must be a whole number of at most ${MAX_SRID_DIGITS} digits`,
        code.at,
      );
    }
    const srid = Number(code.text);
    if (srid !== SUPPORTED_WKT_SRID) {
      throw new UnsupportedSridError(srid);
    }
    this.#expect(";");
  }

  #geometry(depth: number): Geometry {
    const word = this.#tokens.next();
    if (word.kind !== "word") {
      throw refuse("Expected a geometry type", word.at);
    }
    const [keyword, suffix] = splitSuffix(word.text.toUpperCase());
    let dimensions: Dimensions = suffix === "Z" ? "z" : "any";
    if (suffix === "M" || suffix === "ZM") {
      throw measureUnsupported();
    }
    if (!KEYWORDS.has(keyword)) {
      throw UNSUPPORTED_KEYWORDS.has(keyword)
        ? new GeometryError(
            "unsupported",
            `The WKT type ${keyword} is not supported.`,
          )
        : refuse(`Unknown geometry type "${keyword.slice(0, 20)}"`, word.at);
    }
    const tag = this.#tokens.peek();
    if (tag.kind === "word") {
      const text = tag.text.toUpperCase();
      if (text === "M" || text === "ZM") {
        throw measureUnsupported();
      }
      if (text !== "EMPTY" && text !== "Z") {
        throw refuse("Unexpected word", tag.at);
      }
      this.#tokens.next();
      if (text === "Z") {
        dimensions = "z";
      } else {
        return this.#emptyGeometry(keyword);
      }
    }
    if (this.#empty()) {
      return this.#emptyGeometry(keyword);
    }
    return this.#shape(keyword, dimensions, depth);
  }

  #emptyGeometry(keyword: string): Geometry {
    switch (keyword) {
      case "POINT":
        return { type: "Point", coordinates: [] };
      case "LINESTRING":
        return { type: "LineString", coordinates: [] };
      case "POLYGON":
        return { type: "Polygon", coordinates: [] };
      case "MULTIPOINT":
        return { type: "MultiPoint", coordinates: [] };
      case "MULTILINESTRING":
        return { type: "MultiLineString", coordinates: [] };
      case "MULTIPOLYGON":
        return { type: "MultiPolygon", coordinates: [] };
      default:
        return { type: "GeometryCollection", geometries: [] };
    }
  }

  #shape(keyword: string, dimensions: Dimensions, depth: number): Geometry {
    const position = (): Position => this.#position(dimensions);
    const line = (): Position[] => this.#list(position);
    const polygon = (): Position[][] => this.#list(line);
    switch (keyword) {
      case "POINT": {
        this.#expect("(");
        const coordinates = position();
        this.#expect(")");
        return { type: "Point", coordinates };
      }
      case "LINESTRING":
        return { type: "LineString", coordinates: line() };
      case "POLYGON":
        return { type: "Polygon", coordinates: polygon() };
      case "MULTIPOINT":
        return { type: "MultiPoint", coordinates: this.#multiPoint(position) };
      case "MULTILINESTRING":
        return { type: "MultiLineString", coordinates: this.#list(line) };
      case "MULTIPOLYGON":
        return { type: "MultiPolygon", coordinates: this.#list(polygon) };
      default: {
        if (depth >= MAX_COLLECTION_DEPTH) {
          throw refuse(
            "Geometry collections are nested too deeply",
            this.#tokens.peek().at,
          );
        }
        return {
          type: "GeometryCollection",
          geometries: this.#list(() => this.#geometry(depth + 1)),
        };
      }
    }
  }

  /** Reads `(1 2, 3 4)` or `((1 2), (3 4))`, but not a mixture of the two. */
  #multiPoint(position: () => Position): Position[] {
    this.#expect("(");
    const bracketed = this.#accept("(");
    const point = (first: boolean): Position => {
      if (!first) {
        const at = this.#tokens.peek().at;
        if (bracketed !== this.#accept("(")) {
          throw refuse("Points must all be bracketed or all bare", at);
        }
      }
      const value = position();
      if (bracketed) {
        this.#expect(")");
      }
      return value;
    };
    const points = [point(true)];
    while (this.#accept(",")) {
      points.push(point(false));
    }
    this.#expect(")");
    return points;
  }
}

/**
 * Reads a Well-Known Text string into a GeoJSON geometry.
 *
 * It reads `POINT`, `LINESTRING`, `POLYGON` (with holes), their `MULTI`
 * forms and `GEOMETRYCOLLECTION`, in any case and with any spacing, the
 * `EMPTY` form of each, and a height as a third number, with or without the
 * `Z` tag. A `MULTIPOINT` may bracket its points or not. It reads an EWKT
 * `SRID=4326;` prefix and refuses any other SRID as `unsupported`. It does
 * not read a measure (`M`, `ZM`) or curved shapes.
 *
 * The parser is a hand-written tokenizer that never backtracks, so its time
 * grows with the length of the text however hostile the text is, and a
 * collection nested past {@link MAX_COLLECTION_DEPTH} is refused. The
 * result is checked as {@link validateGeometry} checks a shape, apart from
 * the range of the coordinates: WKT may hold projected coordinates, so
 * longitude and latitude are not held to degrees.
 *
 * Positions are read as longitude then latitude; pass `axisOrder: "lat-lng"`
 * for text that writes latitude first. The result is always GeoJSON order.
 *
 * @throws {GeometryError} `invalid` for text that is not WKT or whose shape
 *   is wrong (a message names the position), `unsupported` for a valid WKT
 *   feature this reader leaves out.
 */
export function parseWkt(
  text: string,
  options: ParseWktOptions = {},
): Geometry {
  const geometry = readText(text, options, (reader) => reader.readAll());
  return validateGeometry(geometry, { geographic: false });
}

/**
 * Reads WKT text that holds one geometry or more, one after another in any
 * layout (one to a line is the usual one), into GeoJSON geometries in the
 * same way as {@link parseWkt}, with the same limits and the same errors.
 *
 * Unlike `parseWkt` it does not check the shapes it reads: an `EMPTY` shape,
 * a line of one position or coordinates outside the world come back as
 * written. It is for a caller that applies its own rules to each shape, such
 * as the draw tool's import; use `parseWkt` where a valid geometry is needed.
 *
 * @throws {GeometryError} `invalid` for text that is not WKT, and
 *   `unsupported` for a valid WKT feature this reader leaves out. Nothing is
 *   returned for text that fails part of the way.
 */
export function readWktSequence(
  text: string,
  options: ParseWktOptions = {},
): Geometry[] {
  return readText(text, options, (reader) => reader.readSequence());
}

/**
 * Reads WKT text that holds one geometry or more, as {@link readWktSequence}
 * does, but goes on after a geometry it cannot use instead of giving up. It
 * gives each stretch of the text in turn, as a GeoJSON geometry (unchecked, as
 * `readWktSequence` leaves it) or as the {@link GeometryError} that says why
 * the stretch was left out, and is lazy: a caller that has enough stops
 * asking and the rest is never read.
 *
 * A geometry that is valid WKT the reader leaves out (a measure, a curved
 * type, a SRID other than 4326) is skipped to its closing bracket, so the
 * geometries after it, on the same line or not, are kept. A bracket that has
 * not closed by the end of the line the geometry began on ends the skip
 * there. Text that is damaged is skipped up to the next line that starts with
 * a geometry type or an `SRID=` prefix, and counts as one stretch. Text with
 * a character the reader does not know is damaged in the same way. Nothing is
 * read twice, so the time grows with the length of the text.
 *
 * The text always gives at least one reading: an error for empty text.
 *
 * @throws {GeometryError} `invalid` when the text is not a string.
 */
export function readWktRecovering(
  text: string,
  options: ParseWktOptions = {},
): Generator<Geometry | GeometryError, void> {
  return readText(text, options, (reader) => reader.readRecovering());
}

function readText<T>(
  text: string,
  options: ParseWktOptions,
  read: (reader: Reader) => T,
): T {
  if (typeof text !== "string") {
    throw new GeometryError("invalid", "WKT must be a string.");
  }
  return read(new Reader(text, options.axisOrder ?? "lng-lat"));
}

function checkPrecision(precision: number | undefined): void {
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > 20)
  ) {
    throw new GeometryError(
      "invalid",
      "The precision must be a whole number from 0 to 20.",
    );
  }
}

function formatNumber(value: number, precision: number | undefined): string {
  return fixedDecimal(
    precision === undefined ? value : Number(value.toFixed(precision)),
  );
}

function firstPositionSize(coordinates: unknown[]): number {
  let level: unknown[] = coordinates;
  while (Array.isArray(level[0])) {
    level = level[0] as unknown[];
  }
  return level.length;
}

function writeGeometry(
  geometry: Geometry,
  precision: number | undefined,
): string {
  if (geometry.type === "GeometryCollection") {
    if (geometry.geometries.length === 0) {
      return "GEOMETRYCOLLECTION EMPTY";
    }
    const members = geometry.geometries.map((member) =>
      writeGeometry(member, precision),
    );
    return `GEOMETRYCOLLECTION (${members.join(", ")})`;
  }
  const name = geometry.type.toUpperCase();
  const coordinates = geometry.coordinates as unknown[];
  if (coordinates.length === 0) {
    return `${name} EMPTY`;
  }
  const position = (value: unknown): string =>
    (value as number[]).map((part) => formatNumber(part, precision)).join(" ");
  const list = (items: unknown[], item: (value: unknown) => string): string =>
    `(${items.map(item).join(", ")})`;
  const line = (value: unknown): string => list(value as unknown[], position);
  const polygon = (value: unknown): string => list(value as unknown[], line);
  const tag = firstPositionSize(coordinates) === 3 ? " Z" : "";
  switch (geometry.type) {
    case "Point":
      return `${name}${tag} (${position(coordinates)})`;
    case "MultiPoint":
      return `${name}${tag} ${list(coordinates, (value) => `(${position(value)})`)}`;
    case "LineString":
      return `${name}${tag} ${line(coordinates)}`;
    case "MultiLineString":
    case "Polygon":
      return `${name}${tag} ${list(coordinates, line)}`;
    default:
      return `${name}${tag} ${list(coordinates, polygon)}`;
  }
}

/**
 * Writes a GeoJSON geometry, or the geometry of a feature, as Well-Known Text
 * in the form `parseWkt` reads back: upper-case type names, one space between
 * a position's numbers, `, ` between positions, a `Z` tag when positions have
 * a height, and `EMPTY` for a shape with no positions. Every `MULTIPOINT`
 * member is bracketed.
 *
 * The geometry is checked for shape but not for the range of its coordinates,
 * so projected coordinates can be written too.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry or a bad
 *   `precision`, `empty` for a feature with no geometry.
 */
export function formatWkt(
  input: Geometry | Feature,
  options: FormatWktOptions = {},
): string {
  checkPrecision(options.precision);
  const geometry = validateGeometry(input, { geographic: false });
  return writeGeometry(geometry, options.precision);
}
