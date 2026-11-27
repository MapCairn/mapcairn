// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The harmony rules for the scripts of `packages/map`: the imports from Lit it
 * may not make, the DOM writes that turn a string into markup, and the ways of
 * writing a style through the DOM that go round the style rules.
 */
import { tokenize } from "./lex.mjs";
import { checkColours } from "./shared.mjs";

/** @typedef {import("./shared.mjs").Report} Report */

/** The folder these rules hold. */
const MAP_PACKAGE = "packages/map/";

/**
 * `css` and `unsafeCSS` make `static styles`, which a light DOM element never
 * applies. The `unsafe` helpers put a string into the page, or a tag name into
 * a template, with nothing checking it.
 */
const REFUSED_FROM_LIT = new Set([
  "css",
  "unsafeCSS",
  "unsafeHTML",
  "unsafeSVG",
  "unsafeStatic",
]);

/** An import or re-export from a Lit package: its kind, clause and module. */
const FROM_LIT =
  /\b(?:import|export)\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|(?:[\w$]+\s*,\s*)?\{[^}]*\}|[\w$]+)\s*from\s*["']((?:lit|lit-html|lit-element|@lit\/reactive-element)(?:\/[^"']*)?)["']/g;

/** Longer than any call of `setProperty` written in this repository. */
const CALL_WINDOW = 400;

/**
 * The refused names an import clause takes. A clause that takes everything
 * takes them too.
 * @param {string} clause
 * @returns {string[]}
 */
function refusedNames(clause) {
  if (clause.startsWith("*")) {
    return [clause];
  }
  return clause
    .replace(/^[^{]*\{|\}$/g, "")
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0])
    .filter((name) => REFUSED_FROM_LIT.has(name));
}

/**
 * A dynamic `import()` is not read, so Lit can still be loaded when it is
 * first needed. The one other way past is an entry in `allowlist.mjs`, which
 * names the file, the line's text and the reason.
 * @param {string} code
 * @param {(index: number) => number} lineAt
 * @param {Report} report
 */
function checkLitImports(code, lineAt, report) {
  for (const match of code.matchAll(FROM_LIT)) {
    const [, typeOnly, clause, from] = match;
    const names = typeOnly ? [] : refusedNames(clause);
    if (names.length > 0) {
      report(
        "lit-import",
        lineAt(match.index),
        `"${names.join(", ")}" from "${from}" is not used in packages/map: styles are vanilla-extract classes, and no string becomes markup. A module that needs one takes an entry in scripts/harmony/allowlist.mjs with the reason.`,
      );
    }
  }
}

/**
 * Refuses a string turned into markup, by a script or by a template's
 * property binding, which reads the same to this rule.
 * @param {string} code
 * @param {(index: number) => number} lineAt
 * @param {Report} report
 */
function checkMarkupWrites(code, lineAt, report) {
  const writes = /\.(?:inner|outer)HTML\s*\+?=(?!=)|\.insertAdjacentHTML\s*\(/g;
  for (const match of code.matchAll(writes)) {
    report(
      "markup-from-string",
      lineAt(match.index),
      `"${match[0]}" turns a string into markup. Render a template, or set textContent.`,
    );
  }
}

/**
 * The string tokens of the value a `setProperty(name, value)` call sets.
 * @param {string} code
 * @param {number} open Offset of the call's `(`.
 * @returns {import("./lex.mjs").Token[]}
 */
function valueTokens(code, open) {
  const tokens = tokenize(
    code,
    open,
    Math.min(code.length, open + CALL_WINDOW),
  );
  /** @type {import("./lex.mjs").Token[]} */
  const value = [];
  let depth = 0;
  let isValue = false;
  for (const token of tokens) {
    const punctuation = token.t === "p" ? token.v : "";
    if ("([{".includes(punctuation) && punctuation !== "") {
      depth += 1;
    } else if (")]}".includes(punctuation) && punctuation !== "") {
      depth -= 1;
    }
    if (depth === 0) {
      return value;
    }
    isValue ||= depth === 1 && punctuation === ",";
    if (isValue) {
      value.push(token);
    }
  }
  return value;
}

/**
 * @param {string} code
 * @param {(index: number) => number} lineAt
 * @param {Report} report
 */
function checkStyleWrites(code, lineAt, report) {
  const writes = /setAttribute\(\s*["'`]style["'`]|\.cssText\s*\+?=(?!=)/g;
  for (const match of code.matchAll(writes)) {
    report(
      "inline-style",
      lineAt(match.index),
      `"${match[0]}" writes a whole style from a string. Use a vanilla-extract class, or set each computed value with element.style.setProperty.`,
    );
  }
  for (const match of code.matchAll(/\.setProperty(?=\()/g)) {
    checkColours(valueTokens(code, match.index + match[0].length), report);
  }
}

/**
 * Applies the rules of `packages/map` to one of its scripts.
 * @param {string} file Repository relative path with forward slashes.
 * @param {string} code Comment-stripped source.
 * @param {(index: number) => number} lineAt
 * @param {Report} report
 */
export function scanMapScript(file, code, lineAt, report) {
  if (file.startsWith(MAP_PACKAGE)) {
    checkLitImports(code, lineAt, report);
    checkMarkupWrites(code, lineAt, report);
    checkStyleWrites(code, lineAt, report);
  }
}
