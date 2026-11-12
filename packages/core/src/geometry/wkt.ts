// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, Geometry, Position } from "geojson";
import { GeometryError } from "./errors";
import { MAX_COLLECTION_DEPTH, validateGeometry } from "./validate";

/** Options for {@link formatWkt}. */
export interface FormatWktOptions {
  /**
   * Round every number to this many decimal places, a whole number from 0 to
   * 20. Without it each number is written with the digits needed to read it
   * back exactly.
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

type Token =
  | { readonly kind: "word"; readonly text: string; readonly at: number }
  | { readonly kind: "number"; readonly text: string; readonly at: number }
  | { readonly kind: "(" | ")" | "," | "end"; readonly at: number };

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

/** The first run of letters in a text, after any white space. */
const FIRST_WORD = /^\s*([A-Za-z]+)/;

/**
 * Whether the text starts with the name of a WKT geometry type (in any case,
 * with or without a `Z`, `M` or `ZM` tag), including the curved types
 * {@link parseWkt} does not read. It says what the text is meant to be, not
 * whether it can be read: use it to tell a damaged WKT file from a file that
 * is something else.
 */
export function startsLikeWkt(text: string): boolean {
  const word = FIRST_WORD.exec(text)?.[1];
  if (word === undefined) {
    return false;
  }
  const [type] = splitSuffix(word.toUpperCase());
  return KEYWORDS.has(type) || UNSUPPORTED_KEYWORDS.has(type);
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

/**
 * Reads tokens one at a time, left to right, with one token of look-ahead.
 * It never goes back over text, so the whole parse is linear in the length of
 * the input, whatever the input holds.
 */
class Tokens {
  readonly #text: string;
  #index = 0;
  #peeked: Token | undefined;

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
    return token;
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
    if (code === 40 || code === 41 || code === 44) {
      this.#index += 1;
      return { kind: code === 40 ? "(" : code === 41 ? ")" : ",", at };
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
    const geometry = this.#geometry(0);
    const rest = this.#tokens.next();
    if (rest.kind !== "end") {
      throw refuse("Unexpected text after the geometry", rest.at);
    }
    return geometry;
  }

  /** Reads one geometry or more, one after another, up to the end of the text. */
  readSequence(): Geometry[] {
    const geometries = [this.#geometry(0)];
    while (this.#tokens.peek().kind !== "end") {
      geometries.push(this.#geometry(0));
    }
    return geometries;
  }

  #expect(kind: "(" | ")" | ","): void {
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
 * `Z` tag. A `MULTIPOINT` may bracket its points or not. It does not read a
 * measure (`M`, `ZM`), an `SRID=` prefix or curved shapes.
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
  return String(
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
