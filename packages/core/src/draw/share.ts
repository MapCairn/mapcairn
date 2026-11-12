// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "../ports/geometry";
import { exportableShapes } from "./export";
import type { DrawShapeInput } from "./reducer";
import { MAX_CIRCLE_RADIUS_METRES, validateShape } from "./shape";
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
 * Writes finished, valid shapes as a short text for a link: one letter for
 * the kind (`p` point, `l` line, `g` polygon, `c` circle) and then the
 * positions as whole units of 0.00001 degrees (about a metre), the first
 * absolute and each later one as the step from the one before, every number
 * zigzagged and packed five bits to a character in the alphabet `A-Z a-z 0-9
 * - _`. Shapes are separated by a full stop. Only link-safe characters are
 * used, so nothing needs escaping.
 *
 * @returns The text, an empty string when there is nothing to share, or
 *   null when the result would pass {@link MAX_SHARE_LENGTH} characters or
 *   {@link MAX_SHARE_SHAPES} shapes. A set is never cut short: the caller
 *   says it is too big.
 */
export function encodeShapes(shapes: readonly DrawShape[]): string | null {
  const shareable = exportableShapes(shapes);
  if (shareable.length > MAX_SHARE_SHAPES) {
    return null;
  }
  const text = shareable.map(encodeShape).join(".");
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
      !inWorld(lat, lng) ||
      radius < 1 ||
      radius > MAX_CIRCLE_RADIUS_METRES
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
 * @returns The shapes, or null when the text is malformed or holds no valid
 *   shape. A well-formed shape that fails the draw rules (a polygon of two
 *   positions, or with crossing edges) is skipped and the rest kept.
 */
export function decodeShapes(text: string): DrawShapeInput[] | null {
  if (!SHARE_PATTERN.test(text)) {
    return null;
  }
  const parts = text.split(".");
  if (parts.length > MAX_SHARE_SHAPES) {
    return null;
  }
  const shapes: DrawShapeInput[] = [];
  for (const part of parts) {
    const input = decodeShape(part);
    if (!input) {
      return null;
    }
    const candidate: DrawShape = {
      id: "candidate",
      label: "",
      done: true,
      ...input,
    };
    if (validateShape(candidate) === null) {
      shapes.push(input);
    }
  }
  return shapes.length > 0 ? shapes : null;
}
