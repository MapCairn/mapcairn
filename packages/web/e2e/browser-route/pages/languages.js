// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

// Two pseudo-translations of the English messages, in the shape the public
// `languages` option takes: one longer than English and read left to right,
// and one marked right to left. The server writes `english.js` from the
// messages `@mapcairn/core` exports. The check reads these back to name
// what it looks for, so they are built here and nowhere else.
import english from "./english.js";

// Values the map reads back or sizes to a symbol, which a translation keeps in shape.
const KEPT = /^(format\.(word|hemisphere)|units\.(symbol|reading))/;
const CATEGORY = "(?:zero|one|two|few|many|other)";
// Placeholders and plural category names, which are not text.
const NOT_TEXT = new RegExp(`(\\{\\w+\\}|\\b${CATEGORY}(?=\\{))`);
const KEYED = new RegExp(`^${CATEGORY}\\{`);
const FORM = new RegExp(`(${CATEGORY})\\{((?:[^{}]|\\{\\w+\\})*)\\}`, "g");
const ACCENTED = { a: "àà", e: "éé", i: "îî", o: "öö", u: "üü" };

/** Accents each vowel and doubles it, which makes the text longer. */
function lengthen(value) {
  return value
    .split(NOT_TEXT)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/[aeiou]/g, (vowel) => ACCENTED[vowel]),
    )
    .join("");
}

/** Wraps a form in a right-to-left isolate, as right-to-left text with English in it. */
function isolate(form) {
  return `⁧${form}⁩`;
}

/** Isolates each plural form of a value on its own. */
function mirror(value) {
  if (KEYED.test(value)) {
    return value.replace(
      FORM,
      (_whole, category, form) => `${category}{${isolate(form)}}`,
    );
  }
  return value.split("|").map(isolate).join("|");
}

function translate(change) {
  return Object.fromEntries(
    Object.entries(english).map(([key, value]) => [
      key,
      KEPT.test(key) ? value : change(value),
    ]),
  );
}

window.sampleLanguages = [
  { tag: "en-XA", label: "English (longer)", messages: translate(lengthen) },
  {
    tag: "en-XB",
    label: "English (right to left)",
    direction: "rtl",
    messages: translate(mirror),
  },
];
