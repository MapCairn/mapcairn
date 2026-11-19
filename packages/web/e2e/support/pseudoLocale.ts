// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE, type MessageKey } from "@mapcairn/core";

/** One language's text for every key, as a host catalogue holds it. */
export type CatalogueText = Readonly<Record<MessageKey, string>>;

/** How much longer than English the expanded pseudo-locale makes each form. */
export const EXPANSION_RATIO = 0.4;

/** Right-to-left embedding and pop directional formatting, which wrap a form of the mirrored pseudo-locale. */
const RIGHT_TO_LEFT_EMBEDDING = "‫";
const POP_DIRECTIONAL_FORMATTING = "‬";

/**
 * Keys whose value is read back by the app or sized to a symbol, not shown as
 * prose: coordinate words and hemisphere letters, unit symbols and the order
 * of a figure and its symbol. A pseudo-locale leaves them as English, as a
 * real translation keeps their shape.
 */
const STRUCTURAL_KEY = /^(format\.(word|hemisphere)|units\.(symbol|reading))/;

const ACCENTED: Readonly<Record<string, string>> = {
  a: "à",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "î",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "ü",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
};

/** Filler words, none of them English, that lengthen a form. */
const FILLER = ["ƒîļļ", "ŕöö", "ţêẋţ", "ɱöŕé", "šþàçé"];

/** The pieces of a message value that are not text: placeholders, form labels, braces and separators. */
const STRUCTURE = /(\{\w+\}|\b(?:zero|one|two|few|many|other)(?=\{)|[{}|])/;
const PLACEHOLDER = /^\{\w+\}$/;

/** `text` with each Latin letter replaced by an accented one, keeping case. */
export function accent(text: string): string {
  return text.replace(/[a-z]/gi, (letter) => {
    const accented = ACCENTED[letter.toLowerCase()] ?? letter;
    return letter === letter.toLowerCase()
      ? accented
      : accented.toLocaleUpperCase();
  });
}

/** Filler of about `length` characters, made of whole filler words, at least one. */
function filler(length: number): string {
  let text = "";
  for (let index = 0; text.length < length; index += 1) {
    text += ` ${FILLER[index % FILLER.length]}`;
  }
  return text;
}

/** One plural form, or a whole plain value, accented and about 40 percent longer. */
function expandForm(form: string): string {
  const parts = form.split(/(\{\w+\})/);
  const text = parts.filter((part) => !PLACEHOLDER.test(part)).join("");
  const letters = text.replace(/[^\p{L}]/gu, "").length;
  const accented = parts
    .map((part) => (PLACEHOLDER.test(part) ? part : accent(part)))
    .join("");
  const extra = Math.round(letters * EXPANSION_RATIO);
  return extra === 0 ? accented : accented + filler(extra);
}

/** One plural form, or a whole plain value, embedded as right-to-left text. */
function mirrorForm(form: string): string {
  return `${RIGHT_TO_LEFT_EMBEDDING}${form}${POP_DIRECTIONAL_FORMATTING}`;
}

/**
 * Applies `change` to each form of a message value: the parts between `|`, or
 * the text inside each `category{...}` of a keyed value. Placeholders,
 * separators and category names stay as they are, so the result is a
 * catalogue value the app reads as the English one.
 */
function eachForm(value: string, change: (form: string) => string): string {
  const pieces = value.split(STRUCTURE);
  const keyed = /^(zero|one|two|few|many|other)\{/.test(value);
  let depth = 0;
  let form = "";
  let out = "";
  const flush = () => {
    out += form === "" ? "" : change(form);
    form = "";
  };
  // `split` with a capture group puts the structure at the odd positions.
  pieces.forEach((piece, position) => {
    const isStructure = position % 2 === 1;
    if (!isStructure && keyed && depth === 0) {
      out += piece;
    } else if (!isStructure) {
      form += piece;
    } else if (piece === "{" && depth === 0) {
      depth = 1;
      flush();
      out += piece;
    } else if (piece === "{") {
      depth += 1;
      form += piece;
    } else if (piece === "}" && depth > 1) {
      depth -= 1;
      form += piece;
    } else if (piece === "}") {
      depth = 0;
      flush();
      out += piece;
    } else if (piece === "|" && depth === 0) {
      flush();
      out += piece;
    } else if (depth === 0 && /^[a-z]+$/.test(piece)) {
      flush();
      out += piece;
    } else {
      form += piece;
    }
  });
  flush();
  return out;
}

/** `english` with `change` applied to each form of every key that is prose. */
function pseudoCatalogue(
  english: CatalogueText,
  change: (form: string) => string,
): CatalogueText {
  const entries = Object.entries(english).map(([key, value]) => [
    key,
    STRUCTURAL_KEY.test(key) ? value : eachForm(value, change),
  ]);
  return Object.fromEntries(entries) as CatalogueText;
}

/**
 * Accented, about 40 percent longer English: what a longer translation does to
 * the layout, in text a person who reads English can still follow.
 */
export function expandedPseudoCatalogue(
  english: CatalogueText = EN_GB_CATALOGUE,
): CatalogueText {
  return pseudoCatalogue(english, expandForm);
}

/**
 * English embedded as right-to-left text in every form, for a page whose
 * direction is right to left: left-to-right words and numbers inside
 * right-to-left text, the mix a real Arabic or Hebrew page has.
 */
export function mirroredPseudoCatalogue(
  english: CatalogueText = EN_GB_CATALOGUE,
): CatalogueText {
  return pseudoCatalogue(english, mirrorForm);
}
