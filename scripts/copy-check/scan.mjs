// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Finds user-facing literal text in JSX: text nodes, and the attributes that
 * assistive technology or the browser shows to a person. Copy belongs in the
 * message catalogue, looked up by key, so a host can translate it.
 *
 * It builds on the harmony lexer and is not a full parser. It reads the
 * children of each element, skips `{...}` containers except where one holds
 * only a string literal (or a conditional whose branches are string
 * literals), and reports text that holds a letter. Numbers, punctuation,
 * icon names, class names, token names, URLs and test ids are not reported,
 * because none of them is written as a text node or in a copy attribute.
 *
 * What it does not detect, each with a fixture in `hardcodedCopy.test.ts`:
 * copy built by string concatenation, in an array or in a spread object, copy
 * held in a variable and passed to an attribute, and props of SDK components
 * that carry copy (`label`, `tooltip`). It reads only `.tsx` files, so copy in
 * a `.ts` string table is not scanned.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findJsxTags, parseTagAt, stripComments } from "../harmony/lex.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repository root, two levels above this directory. */
export const REPO_ROOT = path.resolve(HERE, "..", "..");

/** Attributes whose value a person reads or hears. */
export const COPY_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "title",
  "placeholder",
  "alt",
  "aria-valuetext",
  "aria-placeholder",
]);

/**
 * @typedef {object} Finding
 * @property {number} line One-based line.
 * @property {"text"|"attribute"} kind
 * @property {string} text The literal text, whitespace collapsed.
 * @property {string} [attribute] The attribute name, for an attribute.
 */

const HAS_LETTER = /\p{L}/u;

/**
 * Whether `text` reads as words: it holds a letter once entities are gone.
 * @param {string} text
 * @returns {boolean}
 */
function isCopy(text) {
  return HAS_LETTER.test(text.replace(/&#?\w+;/g, ""));
}

/**
 * The static text of a string literal or template literal, or undefined when
 * `piece` is anything else.
 * @param {string} piece
 * @returns {string | undefined}
 */
function literalText(piece) {
  const trimmed = piece
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim();
  const quote = trimmed[0];
  if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== quote) {
    return undefined;
  }
  if (quote === '"' || quote === "'") {
    const body = trimmed.slice(1, -1);
    return body.includes(quote) ? undefined : body;
  }
  if (quote === "`") {
    return trimmed.slice(1, -1).replace(/\$\{[^}]*\}/g, " ");
  }
  return undefined;
}

/**
 * Index just after the string or template literal that starts at `start`.
 * @param {string} expr
 * @param {number} start
 * @returns {number}
 */
function skipQuoted(expr, start) {
  const quote = expr[start];
  let i = start + 1;
  while (i < expr.length && expr[i] !== quote) {
    i += expr[i] === "\\" ? 2 : 1;
  }
  return i + 1;
}

/**
 * Whether the `<` at `i` opens a JSX element or fragment rather than being a
 * comparison or a type argument: it follows an operator, not a name or `)`.
 * @param {string} expr
 * @param {number} i
 * @returns {boolean}
 */
function startsElement(expr, i) {
  if (!/[A-Za-z>]/.test(expr[i + 1] ?? "")) {
    return false;
  }
  let p = i - 1;
  while (p >= 0 && /\s/.test(expr[p])) {
    p -= 1;
  }
  return p < 0 || !/[\w)\]]/.test(expr[p]);
}

/**
 * Index just after the `{ ... }` group that starts at `start`, skipping
 * strings, templates and JSX elements, whose text may hold a bare apostrophe.
 * @param {string} expr
 * @param {number} start
 * @returns {number}
 */
function skipContainer(expr, start) {
  let depth = 0;
  let i = start;
  while (i < expr.length) {
    const c = expr[i];
    if (c === "<" && startsElement(expr, i)) {
      i = skipElement(expr, i);
    } else if (c === '"' || c === "'" || c === "`") {
      i = skipQuoted(expr, i);
    } else {
      depth += c === "{" ? 1 : 0;
      depth -= c === "}" ? 1 : 0;
      i += 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return expr.length;
}

/**
 * Index just after the JSX element that starts at `start`, so text such as an
 * apostrophe inside it is not read as a quote.
 * @param {string} expr
 * @param {number} start
 * @returns {number}
 */
function skipElement(expr, start) {
  const opening = parseTagAt(expr, start);
  const fragment = expr.startsWith("<>", start);
  if (!(opening || fragment)) {
    return start + 1;
  }
  if (opening?.selfClosing) {
    return opening.end;
  }
  let depth = 1;
  let i = opening ? opening.end : start + 2;
  while (i < expr.length && depth > 0) {
    if (expr.startsWith("</", i)) {
      depth -= 1;
      i = expr.indexOf(">", i) + 1 || expr.length;
    } else if (expr[i] === "<" && /[A-Za-z>]/.test(expr[i + 1] ?? "")) {
      const inner = parseTagAt(expr, i);
      depth += inner?.selfClosing ? 0 : 1;
      i = inner ? inner.end : i + 2;
    } else if (expr[i] === "{") {
      i = skipContainer(expr, i);
    } else {
      i += 1;
    }
  }
  return i;
}

/**
 * Length of the operator that separates branches at `i`, or 0 when there is
 * none: `&&`, `||`, `??`, `?` and `:` (but not the `?.` of optional chaining).
 * @param {string} expr
 * @param {number} i
 * @returns {number}
 */
function separatorLength(expr, i) {
  const two = expr.slice(i, i + 2);
  if (two === "&&" || two === "||" || two === "??") {
    return 2;
  }
  return expr[i] === ":" || (expr[i] === "?" && two !== "?.") ? 1 : 0;
}

/**
 * Splits an expression at its top-level `?`, `:`, `&&`, `||` and `??`.
 * @param {string} expr
 * @returns {string[]}
 */
function branches(expr) {
  const pieces = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === "<" && startsElement(expr, i)) {
      i = skipElement(expr, i);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i = skipQuoted(expr, i);
      continue;
    }
    if ("([{".includes(c)) {
      depth += 1;
    } else if (")]}".includes(c)) {
      depth -= 1;
    }
    const length = depth === 0 ? separatorLength(expr, i) : 0;
    if (length > 0) {
      pieces.push(expr.slice(start, i));
      start = i + length;
    }
    i += length || (expr.slice(i, i + 2) === "?." ? 2 : 1);
  }
  pieces.push(expr.slice(start));
  return pieces;
}

/**
 * The copy a JS expression writes out as literals: the whole expression when
 * it is one literal, otherwise the branches after a condition. Calls and
 * property reads are lookups, so they are never copy.
 * @param {string} expr
 * @returns {string[]}
 */
export function literalCopyIn(expr) {
  const pieces = branches(expr);
  const candidates = pieces.length === 1 ? pieces : pieces.slice(1);
  return candidates
    .map(literalText)
    .filter((text) => text !== undefined && isCopy(text));
}

/**
 * Finds user-facing literal text in one source file.
 * @param {string} source
 * @returns {Finding[]}
 */
export function findHardcodedCopy(source) {
  const code = stripComments(source);
  const tags = findJsxTags(code);
  const byStart = new Map(tags.map((tag) => [tag.start, tag]));
  const lineStarts = [0];
  for (let k = 0; k < code.length; k += 1) {
    if (code[k] === "\n") {
      lineStarts.push(k + 1);
    }
  }
  const lineOf = (index) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= index) {
      line += 1;
    }
    return line + 1;
  };
  /** @type {Finding[]} */
  const findings = [];

  const addText = (raw, at) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text && isCopy(text)) {
      const leading = raw.length - raw.trimStart().length;
      findings.push({ line: lineOf(at + leading), kind: "text", text });
    }
  };

  const checkAttributes = (tag) => {
    for (const attr of tag.attrs) {
      if (!COPY_ATTRIBUTES.has(attr.name)) {
        continue;
      }
      let texts = [];
      if (attr.kind === "string") {
        texts = [attr.value].filter(isCopy);
      } else if (attr.kind === "expr") {
        texts = literalCopyIn(attr.value);
      }
      for (const text of texts) {
        findings.push({
          line: attr.line,
          kind: "attribute",
          attribute: attr.name,
          text: text.replace(/\s+/g, " ").trim(),
        });
      }
    }
  };

  /** Reads a `{...}` child: a bare literal or its branches count as copy. */
  const readContainer = (start) => {
    const end = skipContainer(code, start);
    for (const text of literalCopyIn(code.slice(start + 1, end - 1))) {
      addText(text, start);
    }
    scanCode(start + 1, end - 1);
    return end;
  };

  /** Reads the children of an open element or fragment; returns the end. */
  const readChildren = (from) => {
    let i = from;
    let textStart = from;
    const flush = (to) => addText(code.slice(textStart, to), textStart);
    while (i < code.length) {
      const c = code[i];
      if (c === "{") {
        flush(i);
        i = readContainer(i);
        textStart = i;
      } else if (c === "<" && code[i + 1] === "/") {
        flush(i);
        return code.indexOf(">", i) + 1;
      } else if (c === "<" && code[i + 1] === ">") {
        flush(i);
        i = readChildren(i + 2);
        textStart = i;
      } else if (c === "<" && /[A-Za-z]/.test(code[i + 1] ?? "")) {
        flush(i);
        const tag = parseTagAt(code, i);
        i = tag ? readElement(tag) : i + 1;
        textStart = i;
      } else {
        i += 1;
      }
    }
    return code.length;
  };

  const readElement = (tag) => {
    checkAttributes(tag);
    const opening = code.slice(tag.start, tag.end);
    for (const match of opening.matchAll(/=\s*\{/g)) {
      const open = tag.start + (match.index ?? 0) + match[0].length - 1;
      scanCode(open + 1, skipContainer(code, open) - 1);
    }
    return tag.selfClosing ? tag.end : readChildren(tag.end);
  };

  /** Finds elements and fragments in plain code, and reads each one. */
  function scanCode(from, to) {
    let i = from;
    while (i < to) {
      if (code[i] === "<" && byStart.has(i)) {
        i = readElement(byStart.get(i));
      } else if (code[i] === "<" && code[i + 1] === ">") {
        i = readChildren(i + 2);
      } else {
        i += 1;
      }
    }
  }

  scanCode(0, code.length);
  const seen = new Set();
  return findings
    .filter((f) => {
      const key = `${f.line}|${f.kind}|${f.attribute ?? ""}|${f.text}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line);
}

/**
 * The files that make up the interface: every `.tsx` file under
 * `packages/map/src` and `packages/web/src`, without tests and stories. The
 * browser specs (`packages/web/e2e`) and `examples/` lie outside those folders.
 * @param {string} [root]
 * @returns {string[]} Repository relative paths with forward slashes.
 */
export function listCopyFiles(root = REPO_ROOT) {
  /** @type {string[]} */
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(rel);
      } else if (
        entry.name.endsWith(".tsx") &&
        !/\.(test|spec|stories)\.tsx$/.test(entry.name)
      ) {
        out.push(rel);
      }
    }
  };
  walk("packages/map/src");
  walk("packages/web/src");
  return out.sort();
}

/**
 * Reads a repository file.
 * @param {string} file Repository relative path.
 * @param {string} [root]
 * @returns {string}
 */
export function readRepoFile(file, root = REPO_ROOT) {
  return readFileSync(path.join(root, file), "utf8");
}
