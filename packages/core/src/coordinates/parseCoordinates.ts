// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { CoordinateWords, Hemispheres } from "../format/format";
import type { LatLng } from "../ports/geometry";
import { parseMgrs } from "./mgrs";
import {
  normaliseCoordinateText,
  withDecimalCommas,
} from "./normaliseCoordinateText";
import { parseUtm } from "./utm";

/**
 * The longest text {@link parseCoordinates} reads. A coordinate pair in
 * degrees, minutes and seconds with every unit spelt out is about 80
 * characters, so anything longer is not one. The limit also keeps the work
 * for hostile input bounded.
 *
 * @internal
 */
export const MAX_COORDINATE_TEXT_LENGTH = 120;

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MINUTES_PER_DEGREE = 60;
const SECONDS_PER_DEGREE = 3600;

/** Parsed positions keep seven decimals, about a centimetre. */
const ROUNDING_FACTOR = 10_000_000;

type Axis = "lat" | "lng";
type Unit = "degree" | "minute" | "second";

type Token =
  | {
      readonly kind: "number";
      readonly value: number;
      /** Whether the number has a decimal point with digits after it. */
      readonly decimal: boolean;
    }
  | { readonly kind: "sign"; readonly negative: boolean }
  | {
      readonly kind: "hemisphere";
      readonly axis: Axis;
      readonly negative: boolean;
    }
  | { readonly kind: "unit"; readonly unit: Unit }
  | { readonly kind: "separator" }
  | { readonly kind: "label" };

type WordToken = Exclude<Token, { kind: "number" | "sign" | "separator" }>;

const WORDS: Readonly<Record<string, WordToken>> = {
  n: { kind: "hemisphere", axis: "lat", negative: false },
  north: { kind: "hemisphere", axis: "lat", negative: false },
  s: { kind: "hemisphere", axis: "lat", negative: true },
  south: { kind: "hemisphere", axis: "lat", negative: true },
  e: { kind: "hemisphere", axis: "lng", negative: false },
  east: { kind: "hemisphere", axis: "lng", negative: false },
  w: { kind: "hemisphere", axis: "lng", negative: true },
  west: { kind: "hemisphere", axis: "lng", negative: true },
  deg: { kind: "unit", unit: "degree" },
  degree: { kind: "unit", unit: "degree" },
  degrees: { kind: "unit", unit: "degree" },
  min: { kind: "unit", unit: "minute" },
  mins: { kind: "unit", unit: "minute" },
  minute: { kind: "unit", unit: "minute" },
  minutes: { kind: "unit", unit: "minute" },
  sec: { kind: "unit", unit: "second" },
  secs: { kind: "unit", unit: "second" },
  second: { kind: "unit", unit: "second" },
  seconds: { kind: "unit", unit: "second" },
  coord: { kind: "label" },
  coords: { kind: "label" },
  coordinate: { kind: "label" },
  coordinates: { kind: "label" },
};

type Words = ReadonlyMap<string, WordToken>;

/** The English words as a map, so a word such as "constructor" finds nothing. */
const ENGLISH_WORDS: Words = new Map(Object.entries(WORDS));

/** A word as the lookup holds it: composed (NFC) and in lower case. */
function wordKey(word: string): string {
  return word.normalize("NFC").toLowerCase();
}

/** Each word in `value` (separated by white space), lowercased, with `token`. */
function entriesFor(
  value: string,
  token: WordToken,
): readonly (readonly [string, WordToken])[] {
  return wordKey(value)
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word) => [word, token]);
}

/**
 * The words the reader knows: the English ones always, plus the hemisphere
 * letters and the whole words a language writes (such as "O" and "oos" for
 * east in Afrikaans). An English word keeps its meaning if a language's word
 * would clash with it.
 */
function wordsFor(
  hemispheres: Hemispheres | undefined,
  words: CoordinateWords | undefined,
): Words {
  const north: WordToken = { kind: "hemisphere", axis: "lat", negative: false };
  const south: WordToken = { kind: "hemisphere", axis: "lat", negative: true };
  const east: WordToken = { kind: "hemisphere", axis: "lng", negative: false };
  const west: WordToken = { kind: "hemisphere", axis: "lng", negative: true };
  if (hemispheres === undefined && words === undefined) {
    return ENGLISH_WORDS;
  }
  const entries: (readonly (readonly [string, WordToken])[])[] = [];
  if (hemispheres !== undefined) {
    entries.push(
      entriesFor(hemispheres.north, north),
      entriesFor(hemispheres.south, south),
      entriesFor(hemispheres.east, east),
      entriesFor(hemispheres.west, west),
    );
  }
  if (words !== undefined) {
    entries.push(
      entriesFor(words.north, north),
      entriesFor(words.south, south),
      entriesFor(words.east, east),
      entriesFor(words.west, west),
      entriesFor(words.degree, { kind: "unit", unit: "degree" }),
      entriesFor(words.minute, { kind: "unit", unit: "minute" }),
      entriesFor(words.second, { kind: "unit", unit: "second" }),
    );
  }
  return new Map([...entries.flat(), ...ENGLISH_WORDS]);
}

const DEGREE_SYMBOLS = "°º˚";
const MINUTE_SYMBOLS = "'′’‘´`";
const SECOND_SYMBOLS = '"″”“';
const MINUS_SIGNS = "-−–";
const SIGNS = `+${MINUS_SIGNS}`;
const SEPARATORS = ",;";
const WHITE_SPACE = /^\s$/;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function isLetter(char: string | undefined): boolean {
  return char !== undefined && /^\p{L}$/u.test(char);
}

/** A letter or a combining mark, so a word written with a separate accent stays whole. */
function isWordCharacter(char: string | undefined): boolean {
  return char !== undefined && /^[\p{L}\p{M}]$/u.test(char);
}

/** Where a run of characters that satisfy `test` starting at `from` ends. */
function runEnd(
  text: string,
  from: number,
  test: (char: string | undefined) => boolean,
): number {
  let end = from;
  while (end < text.length && test(text[end])) {
    end += 1;
  }
  return end;
}

/**
 * Reads a number without a sign: digits with an optional dot and more
 * digits, so "26", "26.5", ".5" and "5." are numbers and a lone dot is not.
 */
function readNumber(
  text: string,
  from: number,
): {
  readonly value: number;
  readonly decimal: boolean;
  readonly end: number;
} | null {
  const wholeEnd = runEnd(text, from, isDigit);
  let end = wholeEnd;
  if (text[end] === ".") {
    end = runEnd(text, end + 1, isDigit);
  }
  const decimal = end > wholeEnd + 1;
  const hasDigits = wholeEnd > from || decimal;
  return hasDigits && text[end] !== "."
    ? { value: Number(text.slice(from, end)), decimal, end }
    : null;
}

/** What one step of the tokeniser read: a token (or white space, which has none) and where it ended. */
interface Read {
  readonly token: Token | null;
  readonly end: number;
}

const SYMBOLS: ReadonlyMap<string, Token> = new Map<string, Token>([
  ...[...SEPARATORS].map((char): [string, Token] => [
    char,
    { kind: "separator" },
  ]),
  ...[...DEGREE_SYMBOLS].map((char): [string, Token] => [
    char,
    { kind: "unit", unit: "degree" },
  ]),
  ...[...SECOND_SYMBOLS].map((char): [string, Token] => [
    char,
    { kind: "unit", unit: "second" },
  ]),
]);

/** A tick is a minute, and two ticks together are a second. */
function readTick(text: string, index: number): Read {
  const following = text.charAt(index + 1);
  const doubled = following !== "" && MINUTE_SYMBOLS.includes(following);
  return {
    token: { kind: "unit", unit: doubled ? "second" : "minute" },
    end: index + (doubled ? 2 : 1),
  };
}

/**
 * A sign starts a value only when it touches the number after it and does not
 * touch a number before it, so "26 - 28" is not a pair and a postcode such as
 * "02-123" or a range such as "12-14" is not a pair with a negative value.
 */
function readSign(text: string, index: number): Read | null {
  const next = text.charAt(index + 1);
  const before = text.charAt(index - 1);
  if ((!isDigit(next) && next !== ".") || isDigit(before) || before === ".") {
    return null;
  }
  return {
    token: { kind: "sign", negative: MINUS_SIGNS.includes(text.charAt(index)) },
    end: index + 1,
  };
}

function readCountedNumber(text: string, index: number): Read | null {
  const number = readNumber(text, index);
  return number === null
    ? null
    : {
        token: { kind: "number", value: number.value, decimal: number.decimal },
        end: number.end,
      };
}

function readWord(text: string, index: number, words: Words): Read | null {
  const end = runEnd(text, index, isWordCharacter);
  const token = words.get(wordKey(text.slice(index, end)));
  return token === undefined ? null : { token, end };
}

function readToken(text: string, index: number, words: Words): Read | null {
  const char = text.charAt(index);
  const symbol = SYMBOLS.get(char);
  if (WHITE_SPACE.test(char)) {
    return { token: null, end: index + 1 };
  }
  if (symbol !== undefined) {
    return { token: symbol, end: index + 1 };
  }
  if (MINUTE_SYMBOLS.includes(char)) {
    return readTick(text, index);
  }
  if (SIGNS.includes(char)) {
    return readSign(text, index);
  }
  if (isDigit(char) || char === ".") {
    return readCountedNumber(text, index);
  }
  return isLetter(char) ? readWord(text, index, words) : null;
}

/**
 * Splits the text into tokens in one left-to-right pass, skipping white space.
 * Returns `null` for any character that cannot be part of a coordinate pair.
 */
function tokenise(text: string, words: Words): readonly Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const read = readToken(text, index, words);
    if (read === null) {
      return null;
    }
    if (read.token !== null) {
      tokens.push(read.token);
    }
    index = read.end;
  }
  return tokens;
}

/** One value of the pair, before it is known whether it is a latitude or a longitude. */
interface Part {
  /** The axis a hemisphere letter named, or `null` when there was none. */
  readonly axis: Axis | null;
  readonly degrees: number;
}

/** A cursor over the tokens, so each grammar rule reads as one small function. */
class TokenReader {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  /** Takes the next token when it has the kind. */
  take<K extends Token["kind"]>(
    kind: K,
  ): Extract<Token, { kind: K }> | undefined {
    const token = this.peek();
    if (token?.kind !== kind) {
      return undefined;
    }
    this.index += 1;
    return token as Extract<Token, { kind: K }>;
  }

  /** Takes a number followed by the unit, such as the "12" of 12'. */
  takeCounted(unit: Unit): number | undefined {
    const number = this.peek();
    const after = this.peek(1);
    if (
      number?.kind !== "number" ||
      after?.kind !== "unit" ||
      after.unit !== unit
    ) {
      return undefined;
    }
    this.index += 2;
    return number.value;
  }

  /** Takes the unit when it is next. */
  takeUnit(unit: Unit): boolean {
    const token = this.peek();
    if (token?.kind !== "unit" || token.unit !== unit) {
      return false;
    }
    this.index += 1;
    return true;
  }

  get atEnd(): boolean {
    return this.index >= this.tokens.length;
  }
}

function isWhole(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Reads the minutes and seconds after a degree sign. Minutes are whole when
 * seconds follow, and seconds need minutes. Returns the extra degrees, or
 * `null` when the parts do not fit.
 */
function readMinutesAndSeconds(
  reader: TokenReader,
  degrees: number,
): number | null {
  const minutes = reader.takeCounted("minute");
  if (minutes === undefined) {
    return 0;
  }
  const seconds = reader.takeCounted("second");
  const minutesFit = seconds === undefined || isWhole(minutes);
  const secondsFit = seconds === undefined || seconds < MINUTES_PER_DEGREE;
  if (
    !isWhole(degrees) ||
    minutes >= MINUTES_PER_DEGREE ||
    !minutesFit ||
    !secondsFit
  ) {
    return null;
  }
  return minutes / MINUTES_PER_DEGREE + (seconds ?? 0) / SECONDS_PER_DEGREE;
}

/** Reads one value: an optional leading letter, sign, degrees and trailing letter. */
function readPart(reader: TokenReader): Part | null {
  const prefix = reader.take("hemisphere");
  const sign = reader.take("sign");
  const number = reader.take("number");
  if (number === undefined) {
    return null;
  }
  let degrees = number.value;
  const hasDegreeUnit = reader.takeUnit("degree");
  if (!number.decimal && !hasDegreeUnit) {
    return null;
  }
  if (hasDegreeUnit) {
    const extra = readMinutesAndSeconds(reader, degrees);
    if (extra === null) {
      return null;
    }
    degrees += extra;
  }
  const hemisphere = prefix ?? reader.take("hemisphere");
  if (hemisphere !== undefined && sign !== undefined) {
    return null;
  }
  const negative = (hemisphere ?? sign)?.negative ?? false;
  return {
    axis: hemisphere?.axis ?? null,
    degrees: negative ? -degrees : degrees,
  };
}

/** Works out which part is the latitude, or `null` when the letters clash. */
function orderParts(
  first: Part,
  second: Part,
): { readonly lat: number; readonly lng: number } | null {
  const firstAxis = first.axis ?? (second.axis === "lat" ? "lng" : "lat");
  const secondAxis = second.axis ?? (firstAxis === "lat" ? "lng" : "lat");
  if (firstAxis === secondAxis) {
    return null;
  }
  return firstAxis === "lat"
    ? { lat: first.degrees, lng: second.degrees }
    : { lat: second.degrees, lng: first.degrees };
}

function roundToCentimetre(degrees: number): number {
  // Adding zero turns a negative zero into zero.
  return Math.round(degrees * ROUNDING_FACTOR) / ROUNDING_FACTOR + 0;
}

/** Reads a pair from text that is already in ASCII digits, signs and separators. */
function readPair(text: string, words: Words): LatLng | null {
  const tokens = tokenise(text, words);
  if (tokens === null) {
    return null;
  }
  const reader = new TokenReader(tokens);
  reader.take("label");
  const first = readPart(reader);
  reader.take("separator");
  const second = first === null ? null : readPart(reader);
  if (first === null || second === null || !reader.atEnd) {
    return null;
  }
  const position = orderParts(first, second);
  if (
    position === null ||
    Math.abs(position.lat) > MAX_LATITUDE ||
    Math.abs(position.lng) > MAX_LONGITUDE
  ) {
    return null;
  }
  return {
    lat: roundToCentimetre(position.lat),
    lng: roundToCentimetre(position.lng),
  };
}

/**
 * Reads coordinates from text a person typed, or returns `null`
 * when the text is not one. It never guesses: text that is out of range,
 * ambiguous, or has anything left over is refused, so a street number, a
 * postcode or a place name goes on to a place search.
 *
 * What it reads, with the latitude first unless the letters say otherwise:
 * - decimal degrees: `-26.2041, 28.0473`, `-26.2041 28.0473`, `26.2041° S, 28.0473° E`
 * - degrees, minutes and seconds: `26°12'14.8"S 28°02'50.3"E`, with the
 *   usual symbols or the words degrees, minutes and seconds, and decimal
 *   minutes when there are no seconds
 * - hemisphere letters (N, S, E, W or the words) before or after a value,
 *   in either order; a negative sign cannot be combined with a letter.
 *   Pass `hemispheres` (`hemispheresFor(catalogue)`) to read the letters of
 *   the language in use as well, so "26.20410° S, 28.04730° O" reads back in
 *   Afrikaans; N, S, E and W are always read. Pass `words`
 *   (`coordinateWordsFor(catalogue)`) to read that language's whole words for
 *   north, south, east, west, degree, minute and second too ("26.2041 suid,
 *   28.0473 oos"); the English words are always read
 * - one comma or semicolon between the two values, or white space alone
 * - a leading "coordinates" or "coords", so the label of a coordinate result
 *   reads back as the same place to about a metre
 * - a UTM reference: the zone, a band letter or a hemisphere letter, then
 *   the easting to the metre and the northing to the metre, with or
 *   without spaces between the zone, the letter and the easting (a space
 *   between the easting and the northing is required), in either letter case: `31U 500000 5500000`,
 *   `31 N 500000 4200000`, `34h261882 6243182`. A letter that is N or S is
 *   always read as a hemisphere letter, never as band N or band S: S names
 *   the southern hemisphere, whose northing carries the 10 000 000 m offset.
 *   A reference another tool wrote with band S (32 to 40 degrees north)
 *   must therefore be written with N, as `formatUtm` does, or it names a
 *   place in the southern hemisphere instead. Any other letter is a band
 *   letter, which names the eight-degree latitude band and with it the
 *   hemisphere. The easting must be between 100 000 and 900 000 m, wider
 *   than any zone's grid (about 166 000 to 834 000 m at the equator) so a
 *   reference written across a zone line still reads. A reference without a
 *   letter is ambiguous and refused, as is one whose zone is outside 1 to
 *   60, whose letter is not a band or hemisphere letter, whose northing
 *   contradicts its band, or whose position is outside the UTM grid (80° S
 *   to 84° N)
 * - an MGRS reference: the zone and band letter written together, the
 *   100 km square and the digits of the easting and northing, with or
 *   without a space between the square and the digits, and with at most
 *   spaces among the digits (runs of white space count as one), in either
 *   letter case but not a mixture ("1Dec 2015" is a date), at any precision
 *   from 1 km (four digits) to 1 m (ten): `31U CT 12345 67890`, `11SPA7234911844`. Fewer
 *   than four digits, or a space between the zone and the band letter, is
 *   refused, so a date or an address ("1 Dec 2015", "12 Rue 10") is never
 *   read as a position. A bare 100 km square names an area rather than a
 *   point and is refused, as is a reference whose square letters do not
 *   belong to its zone, whose digits are of unequal count, or whose
 *   position is outside the band the reference names. A reference written
 *   on a neighbouring zone's grid still reads
 *
 * Every value must carry a mark that says it is a degree value: a decimal
 * point with digits after it, or a degree sign or the word degrees. A bare
 * whole number is not enough, so "12 34", "E1 6" and a postcode or house
 * number go on to the place search. A minus sign (hyphen, a dash or the
 * Unicode minus) starts a value only when it does not touch a number before
 * it, so "02-123" and "12-14" are not pairs.
 *
 * Other scripts and locales are read too: digits of any script, the Unicode
 * minus and other dashes, Arabic and full-width separators and white space
 * such as the narrow no-break space are rewritten as ASCII first, and
 * bidirectional marks are dropped (see `normaliseCoordinateText`). A
 * thousands separator is read as white space, since no coordinate has a
 * digit group.
 *
 * A comma is a decimal mark in two layouts only, and only in text with no
 * decimal point (see `withDecimalCommas`): values separated by a
 * semicolon (`26,2041; 28,0473`), or by white space with a comma in every
 * number and no other comma (`26,2041 28,0473`). A comma between digits is
 * never a thousands separator, so `26,28` and `1,234` alone are not
 * coordinates. Anywhere else a comma separates the two values. Latitude must be within 90 degrees and
 * longitude within 180. Text longer than {@link MAX_COORDINATE_TEXT_LENGTH}
 * is refused unread, and the rest is read in a single pass, so the cost
 * grows in step with the text and no hostile input can make it slow.
 * @returns The position, rounded to seven decimals, or `null`.
 */
export function parseCoordinates(
  text: string,
  hemispheres?: Hemispheres,
  words?: CoordinateWords,
): LatLng | null {
  if (text.length > MAX_COORDINATE_TEXT_LENGTH) {
    return null;
  }
  const readWords = wordsFor(hemispheres, words);
  const normalised = normaliseCoordinateText(text);
  const withPoints = withDecimalCommas(normalised);
  return (
    readPair(normalised, readWords) ??
    (withPoints === null ? null : readPair(withPoints, readWords)) ??
    parseUtm(normalised) ??
    parseMgrs(normalised)
  );
}

/** What may remain of coordinate text once its words are taken out: figures, signs, separators and unit marks. */
const COORDINATE_FILLER = /^[\d\s+\-.,;:°º˚′″'"’]*$/u;

/**
 * Whether text is made only of figures and the coordinate words the reader
 * knows (hemisphere words, unit words, the "coordinates" label, in English
 * and in the language of `hemispheres` and `words`), with at least one
 * figure: a pair that may still be being typed, such as "26.2041 south, 28.04"
 * or "coordinates 26.2041, 28". Any other word, such as a place name,
 * makes it false.
 */
export function isCoordinateWordsAndFigures(
  text: string,
  hemispheres?: Hemispheres,
  words?: CoordinateWords,
): boolean {
  const known = wordsFor(hemispheres, words);
  const rest = normaliseCoordinateText(text).replace(/\p{L}+/gu, (run) =>
    known.has(wordKey(run)) ? " " : "?",
  );
  return /\d/.test(rest) && COORDINATE_FILLER.test(rest);
}
