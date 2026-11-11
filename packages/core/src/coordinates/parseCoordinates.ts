import type { LatLng } from "../ports/geometry";

/**
 * The longest text {@link parseCoordinates} reads. A coordinate pair in
 * degrees, minutes and seconds with every unit spelt out is about 80
 * characters, so anything longer is not one. The limit also keeps the work
 * for hostile input bounded.
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
  | { readonly kind: "number"; readonly value: number }
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

const DEGREE_SYMBOLS = "°º˚";
const MINUTE_SYMBOLS = "'′’‘´`";
const SECOND_SYMBOLS = '"″”“';
const MINUS_SIGNS = "-−";
const SIGNS = `+${MINUS_SIGNS}`;
const SEPARATORS = ",;";
const WHITE_SPACE = /^\s$/;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function isAsciiLetter(char: string | undefined): boolean {
  return char !== undefined && /^[A-Za-z]$/.test(char);
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
): { readonly value: number; readonly end: number } | null {
  const wholeEnd = runEnd(text, from, isDigit);
  let end = wholeEnd;
  if (text[end] === ".") {
    end = runEnd(text, end + 1, isDigit);
  }
  const hasDigits = wholeEnd > from || end > wholeEnd + 1;
  return hasDigits ? { value: Number(text.slice(from, end)), end } : null;
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

/** A sign belongs to a number only when it touches it, so "26 - 28" is not a pair. */
function readSign(text: string, index: number): Read | null {
  const next = text.charAt(index + 1);
  if (!isDigit(next) && next !== ".") {
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
    : { token: { kind: "number", value: number.value }, end: number.end };
}

function readWord(text: string, index: number): Read | null {
  const end = runEnd(text, index, isAsciiLetter);
  const token = WORDS[text.slice(index, end).toLowerCase()];
  return token === undefined ? null : { token, end };
}

function readToken(text: string, index: number): Read | null {
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
  return isAsciiLetter(char) ? readWord(text, index) : null;
}

/**
 * Splits the text into tokens in one left-to-right pass, skipping white space.
 * Returns `null` for any character that cannot be part of a coordinate pair.
 */
function tokenise(text: string): readonly Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const read = readToken(text, index);
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
  if (reader.takeUnit("degree")) {
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

/**
 * Reads a pair of coordinates from text a person typed, or returns `null`
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
 *   in either order; a negative sign cannot be combined with a letter
 * - one comma or semicolon between the two values, or white space alone
 * - a leading "coordinates" or "coords", so the label of a coordinate result
 *   reads back as the same place
 *
 * A comma is never a decimal mark. Latitude must be within 90 degrees and
 * longitude within 180. Text longer than {@link MAX_COORDINATE_TEXT_LENGTH}
 * is refused unread, and the rest is read in a single pass, so the cost
 * grows in step with the text and no hostile input can make it slow.
 * @returns The position, rounded to seven decimals, or `null`.
 */
export function parseCoordinates(text: string): LatLng | null {
  if (text.length > MAX_COORDINATE_TEXT_LENGTH) {
    return null;
  }
  const tokens = tokenise(text);
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
