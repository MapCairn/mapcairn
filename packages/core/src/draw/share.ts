// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "../ports/geometry";
import { exportableShapes } from "./export";
import type { DrawShapeInput } from "./reducer";
import { validateShape } from "./shape";
import type { DrawKind, DrawShape } from "./types";

/** The most characters a shared set of shapes may take in a link. */
export const MAX_SHARE_LENGTH = 2000;

/** The most shapes a link may carry. */
export const MAX_SHARE_SHAPES = 50;

/** What a shared set of shapes looks like: link-safe characters only, within the size limit. */
export const SHARE_PATTERN = /^[A-Za-z0-9._-]{1,2000}$/;

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CONTINUE = 32;
const DATA_MASK = 31;
/** A number is at most this many characters, so a hostile run of continuation bits ends at once. */
const MAX_NUMBER_CHARS = 7;
const SCALE = 1e5;

const KIND_TO_CHAR: Readonly<Record<DrawKind, string>> = {
  point: "p",
  line: "l",
  polygon: "g",
  circle: "c",
};

const CHAR_TO_KIND: Readonly<Record<string, DrawKind>> = {
  p: "point",
  l: "line",
  g: "polygon",
  c: "circle",
};

function writeNumber(value: number): string {
  let rest = value < 0 ? -2 * value - 1 : 2 * value;
  let out = "";
  do {
    const low = rest % 32;
    rest = Math.floor(rest / 32);
    out += ALPHABET[rest > 0 ? low + CONTINUE : low];
  } while (rest > 0);
  return out;
}

function encodeShape(shape: DrawShape): string {
  const first = shape.vertices[0] as LatLng;
  if (shape.kind === "circle") {
    return `c${writeNumber(Math.round(first.lat * SCALE))}${writeNumber(
      Math.round(first.lng * SCALE),
    )}${writeNumber(Math.round(shape.radiusMetres ?? 0))}`;
  }
  let lat = 0;
  let lng = 0;
  let out = KIND_TO_CHAR[shape.kind];
  for (const vertex of shape.vertices) {
    const nextLat = Math.round(vertex.lat * SCALE);
    const nextLng = Math.round(vertex.lng * SCALE);
    out += writeNumber(nextLat - lat) + writeNumber(nextLng - lng);
    lat = nextLat;
    lng = nextLng;
  }
  return out;
}

/**
 * The least radius, in metres, of a circle a link carries. The radius is
 * written in whole metres, so a smaller circle is left out rather than read
 * back as one that is up to twice the size.
 */
const MIN_SHARED_RADIUS_METRES = 1;

/** Whether `input` is a shape the draw rules accept, as a decoded part has to be. */
function isDrawable(input: DrawShapeInput): boolean {
  return (
    validateShape({ id: "candidate", label: "", done: true, ...input }) === null
  );
}

/**
 * The text of one shape in a link, or null when the link cannot carry it:
 * a circle under {@link MIN_SHARED_RADIUS_METRES}, or a shape that
 * {@link decodeShapes} would not accept as the text reads back, such as a line
 * whose two positions fall on the same unit of 0.00001 degrees or a polygon
 * that collapses on it. Checking what is read back keeps the writer and the
 * reader from disagreeing.
 */
function linkPart(shape: DrawShape): string | null {
  if (
    shape.kind === "circle" &&
    (shape.radiusMetres ?? 0) < MIN_SHARED_RADIUS_METRES
  ) {
    return null;
  }
  const text = encodeShape(shape);
  const input = decodeShape(text);
  return input !== null && isDrawable(input) ? text : null;
}

/**
 * The finished, valid shapes that {@link encodeShapes} leaves out because a
 * link cannot carry them: a circle of under a metre, and a line or polygon
 * too small to keep its shape when its positions are whole units of
 * 0.00001 degrees (about a metre). A caller says so, and offers a file.
 */
export function unsharableShapes(
  shapes: readonly DrawShape[],
): readonly DrawShape[] {
  return exportableShapes(shapes).filter((shape) => linkPart(shape) === null);
}

/**
 * Writes finished, valid shapes as a short text for a link: one letter for
 * the kind (`p` point, `l` line, `g` polygon, `c` circle) and then the
 * positions as whole units of 0.00001 degrees (about a metre), the first
 * absolute and each later one as the step from the one before, every number
 * zigzagged and packed five bits to a character in the alphabet `A-Z a-z 0-9
 * - _`. Shapes are separated by a full stop. Only link-safe characters are
 * used, so nothing needs escaping. A circle's radius is in whole metres.
 *
 * A shape the link cannot carry (see {@link unsharableShapes}) is left out,
 * and a caller tells the person.
 *
 * @returns The text, an empty string when there is nothing to share, or
 *   null when the result would pass {@link MAX_SHARE_LENGTH} characters or
 *   {@link MAX_SHARE_SHAPES} shapes. A set is never cut short for its size:
 *   the caller says it is too big.
 */
export function encodeShapes(shapes: readonly DrawShape[]): string | null {
  const parts = exportableShapes(shapes).flatMap((shape) => {
    const part = linkPart(shape);
    return part === null ? [] : [part];
  });
  if (parts.length > MAX_SHARE_SHAPES) {
    return null;
  }
  const text = parts.join(".");
  return text.length > MAX_SHARE_LENGTH ? null : text;
}

/** Reads one number from `text` at `from`, or null when it is cut short or runs too long. */
function readNumber(
  text: string,
  from: number,
): { value: number; next: number } | null {
  let raw = 0;
  let factor = 1;
  for (
    let at = from;
    at < text.length && at < from + MAX_NUMBER_CHARS;
    at += 1
  ) {
    const code = ALPHABET.indexOf(text.charAt(at));
    if (code < 0) {
      return null;
    }
    raw += (code & DATA_MASK) * factor;
    factor *= 32;
    if ((code & CONTINUE) === 0) {
      const value = raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
      return { value, next: at + 1 };
    }
  }
  return null;
}

function readNumbers(body: string): number[] | null {
  const numbers: number[] = [];
  let at = 0;
  while (at < body.length) {
    const read = readNumber(body, at);
    if (!read) {
      return null;
    }
    numbers.push(read.value);
    at = read.next;
  }
  return numbers;
}

function inWorld(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 * SCALE && Math.abs(lng) <= 180 * SCALE;
}

/** Reads the positions of a shape that is not a circle, or null when any is outside the world. */
function readVertices(numbers: readonly number[]): LatLng[] | null {
  if (numbers.length < 2 || numbers.length % 2 !== 0) {
    return null;
  }
  const vertices: LatLng[] = [];
  let lat = 0;
  let lng = 0;
  for (let at = 0; at < numbers.length; at += 2) {
    lat += numbers[at] as number;
    lng += numbers[at + 1] as number;
    if (!inWorld(lat, lng)) {
      return null;
    }
    vertices.push({ lat: lat / SCALE, lng: lng / SCALE });
  }
  return vertices;
}

function decodeShape(part: string): DrawShapeInput | null {
  const kind = CHAR_TO_KIND[part.charAt(0)];
  const numbers = kind ? readNumbers(part.slice(1)) : null;
  if (!kind || !numbers) {
    return null;
  }
  if (kind === "circle") {
    const [lat, lng, radius] = numbers;
    if (
      numbers.length !== 3 ||
      lat === undefined ||
      lng === undefined ||
      radius === undefined ||
      !inWorld(lat, lng)
    ) {
      return null;
    }
    return {
      kind,
      vertices: [{ lat: lat / SCALE, lng: lng / SCALE }],
      radiusMetres: radius,
    };
  }
  const vertices = readVertices(numbers);
  return vertices ? { kind, vertices } : null;
}

/**
 * Reads shapes written by {@link encodeShapes}. Text from a link is hostile
 * until proven otherwise, so it is checked before anything is read: only the
 * link-safe alphabet, at most {@link MAX_SHARE_LENGTH} characters and
 * {@link MAX_SHARE_SHAPES} shapes, numbers of at most seven characters and
 * positions inside the world. The work done is linear in the text.
 *
 * @returns The shapes, or null when the text is not made of the link-safe
 *   alphabet, is too long or holds too many shapes, or holds no valid shape.
 *   A shape that cannot be read or that fails the draw rules (a polygon of
 *   two positions, a circle with a radius of 0, crossing edges, a position
 *   outside the world) is skipped on its own and the rest kept.
 */
export function decodeShapes(text: string): DrawShapeInput[] | null {
  if (!SHARE_PATTERN.test(text)) {
    return null;
  }
  const parts = text.split(".");
  if (parts.length > MAX_SHARE_SHAPES) {
    return null;
  }
  const shapes = parts
    .map(decodeShape)
    .filter((input): input is DrawShapeInput => input !== null)
    .filter(isDrawable);
  return shapes.length > 0 ? shapes : null;
}
