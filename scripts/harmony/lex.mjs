// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * A small, dependency-free lexer for the harmony scanner.
 *
 * It is not a full JavaScript parser. It is enough to find object-literal
 * declarations in vanilla-extract style files and `style={{...}}` props,
 * JSX opening tags and attributes, and statements at module scope. Strings
 * other than template literals end at a line break, so a stray apostrophe in
 * JSX text can corrupt at most one line.
 */

/** The longest text before a `/` that is looked at to tell what it starts. */
const LOOK_BACK = 80;

/**
 * A character, or the word `return`, after which `/` starts a regular
 * expression. `<` is left out, so the `/` of a closing JSX tag does not.
 */
const BEFORE_REGEX = /(?:^|[(,=:[!&|?{};+*%>~^-]|\breturn)\s*$/;

/** A regular expression literal: classes and escapes may hold a `/`. */
const REGEX_LITERAL = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\[\n])+\//y;

/** @typedef {(from: number, to: number) => void} OnComment */

/**
 * Index just after the quoted string that starts at `start`. It ends at the
 * line's end at the latest, so a stray apostrophe hides one line at most.
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
function skipString(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote && source[i] !== "\n") {
    i += source[i] === "\\" ? 2 : 1;
  }
  return source[i] === quote ? i + 1 : i;
}

/**
 * Index just after the comment that starts at `start`, or `start` when none
 * does. The line break that ends a line comment is not part of it.
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
function commentEnd(source, start) {
  const opening = source.slice(start, start + 2);
  if (opening !== "//" && opening !== "/*") {
    return start;
  }
  const closing = opening === "//" ? "\n" : "*/";
  const at = source.indexOf(closing, start + 2);
  if (at === -1) {
    return source.length;
  }
  return opening === "//" ? at : at + closing.length;
}

/**
 * Index just after the string or regular expression that starts at `i`, or the
 * next index when neither does. Whether a `/` starts a regular expression is
 * told from the code before it, which ends at `codeEnd`.
 * @param {string} source
 * @param {number} i
 * @param {number} [codeEnd] Where the code before `i` ends, comments aside.
 * @returns {number}
 */
export function skipPlain(source, i, codeEnd = i) {
  if (source[i] === '"' || source[i] === "'") {
    return skipString(source, i);
  }
  if (source[i] !== "/") {
    return i + 1;
  }
  const before = source.slice(Math.max(0, codeEnd - LOOK_BACK), codeEnd);
  // `{...props}/>` ends a JSX tag, while `/>/` is a regular expression.
  const closesTag =
    source[i + 1] === ">" &&
    source[i + 2] !== "/" &&
    before.trimEnd().endsWith("}");
  if (closesTag || !BEFORE_REGEX.test(before)) {
    return i + 1;
  }
  REGEX_LITERAL.lastIndex = i;
  return REGEX_LITERAL.test(source) ? REGEX_LITERAL.lastIndex : i + 1;
}

/**
 * Reads code from `from`, past its strings, regular expressions, comments and
 * templates.
 * @param {string} source
 * @param {number} from
 * @param {OnComment} onComment Receives every comment read.
 * @param {boolean} oneGroup Stop at the `}` that closes the `{` at `from`.
 * @returns {number} Index just after that `}`, or -1 when the end of the
 *   source comes first.
 */
function readCode(source, from, onComment, oneGroup) {
  let depth = 0;
  let codeEnd = from;
  let i = from;
  while (i < source.length) {
    const c = source[i];
    const comment = commentEnd(source, i);
    if (comment > i) {
      onComment(i, comment);
      i = comment;
      continue;
    }
    if (c === "`") {
      const end = readTemplate(source, i, onComment);
      i = end === -1 ? source.length : end;
    } else if (c === "{" || c === "}") {
      depth += c === "{" ? 1 : -1;
      i += 1;
      if (oneGroup && depth === 0) {
        return i;
      }
    } else {
      i = skipPlain(source, i, codeEnd);
    }
    codeEnd = /\s/.test(c) ? codeEnd : i;
  }
  return -1;
}

/**
 * Reads the template literal that starts at `start`, honouring nested
 * `${ ... }` expressions.
 * @param {string} source
 * @param {number} start
 * @param {OnComment} onComment Receives every comment in its holes.
 * @returns {number} Index just after its closing backtick, or -1 when it never
 *   closes.
 */
function readTemplate(source, start, onComment) {
  let i = start + 1;
  while (i >= 0 && i < source.length) {
    if (source[i] === "\\") {
      i += 2;
    } else if (source[i] === "`") {
      return i + 1;
    } else if (source.startsWith("${", i)) {
      i = readCode(source, i + 1, onComment, true);
    } else {
      i += 1;
    }
  }
  return -1;
}

/**
 * Replaces comments with spaces, keeping every line break and offset so that
 * line numbers and indices still match the original source. Comments in a
 * template's holes go too; the template's own text stays as written.
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  let out = "";
  let kept = 0;
  readCode(
    source,
    0,
    (from, to) => {
      out += source.slice(kept, from);
      out += source.slice(from, to).replace(/[^\n]/g, " ");
      kept = to;
    },
    false,
  );
  return out + source.slice(kept);
}

/**
 * Builds a function that maps an offset in `code` to a line number.
 * @param {string} code
 * @returns {(index: number) => number}
 */
export function lineFinder(code) {
  const starts = [0];
  for (let k = 0; k < code.length; k += 1) {
    if (code[k] === "\n") {
      starts.push(k + 1);
    }
  }
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (starts[mid] <= index) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  };
}

/**
 * Index just after the `}` that closes the `{` at `start`, skipping strings,
 * regular expressions, comments and templates inside.
 * @param {string} source
 * @param {number} start
 * @returns {number} -1 when it never closes.
 */
export function closingBrace(source, start) {
  return readCode(source, start, () => {}, true);
}

/**
 * {@link closingBrace}, with the end of the source for a group that never
 * closes.
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
export function skipBalanced(source, start) {
  const end = closingBrace(source, start);
  return end === -1 ? source.length : end;
}

/**
 * @typedef {object} Token
 * @property {"str"|"tpl"|"num"|"id"|"p"} t Token kind.
 * @property {string} v Value. For strings, the unquoted text. For templates,
 *   the text with each `${...}` replaced by `§`.
 * @property {number} i Offset of the first character.
 * @property {number} line One-based line number.
 */

/**
 * Tokenises comment-stripped source (no JSX text).
 * @param {string} code Output of {@link stripComments}.
 * @param {number} [from] Offset to start at.
 * @param {number} [to] Offset to stop at.
 * @returns {Token[]}
 */
export function tokenize(code, from = 0, to = code.length) {
  /** @type {Token[]} */
  const tokens = [];
  let line = 1;
  for (let k = 0; k < from; k += 1) {
    if (code[k] === "\n") {
      line += 1;
    }
  }
  let i = from;
  while (i < to) {
    const c = code[i];
    if (c === "\n") {
      line += 1;
      i += 1;
    } else if (c === " " || c === "\t" || c === "\r") {
      i += 1;
    } else if (c === '"' || c === "'") {
      const start = i;
      i += 1;
      let value = "";
      while (i < to && code[i] !== c && code[i] !== "\n") {
        if (code[i] === "\\" && i + 1 < to) {
          i += 1;
        }
        value += code[i];
        i += 1;
      }
      i += 1;
      tokens.push({ t: "str", v: value, i: start, line });
    } else if (c === "`") {
      const start = i;
      const startLine = line;
      i += 1;
      let value = "";
      while (i < to && code[i] !== "`") {
        if (code[i] === "\\") {
          value += code[i + 1] ?? "";
          i += 2;
        } else if (code[i] === "$" && code[i + 1] === "{") {
          const end = skipBalanced(code, i + 1);
          for (let k = i; k < end; k += 1) {
            if (code[k] === "\n") {
              line += 1;
            }
          }
          value += "§";
          i = end;
        } else {
          if (code[i] === "\n") {
            line += 1;
          }
          value += code[i];
          i += 1;
        }
      }
      i += 1;
      tokens.push({ t: "tpl", v: value, i: start, line: startLine });
    } else if (
      /[0-9]/.test(c) ||
      (c === "." && /[0-9]/.test(code[i + 1] ?? ""))
    ) {
      const start = i;
      while (i < to && /[0-9._a-zA-Z]/.test(code[i])) {
        i += 1;
      }
      tokens.push({ t: "num", v: code.slice(start, i), i: start, line });
    } else if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < to && /[A-Za-z0-9_$]/.test(code[i])) {
        i += 1;
      }
      tokens.push({ t: "id", v: code.slice(start, i), i: start, line });
    } else {
      tokens.push({ t: "p", v: c, i, line });
      i += 1;
    }
  }
  return tokens;
}

/**
 * @typedef {object} Declaration
 * @property {string} key The property name as written.
 * @property {string} prop The camelCase property name (`--x` stays as is).
 * @property {string} text The value as text. Member chains and calls become
 *   `§`, strings are unquoted and templates keep their text.
 * @property {string[]} exprs Source text of every identifier chain in the
 *   value, for example `tokens.motion.duration.fast`.
 * @property {number} line Line of the key.
 * @property {number} parentStart Offset of the enclosing `{`.
 * @property {number} parentEnd Offset of the enclosing `}`.
 * @property {number} ruleStart Offset of the `{` of the whole style rule,
 *   found by climbing out of nested selector and media objects.
 * @property {number} ruleEnd Offset of that rule's closing `}`.
 */

/** Converts `font-size` to `fontSize`. */
function camel(key) {
  if (key.startsWith("--")) {
    return key;
  }
  return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Finds `key: value` pairs in object literals. Nested objects are skipped as
 * values but their own pairs are found.
 * @param {Token[]} tokens
 * @param {string} code Source the tokens came from.
 * @returns {Declaration[]}
 */
export function extractDeclarations(tokens, code) {
  /** @type {Declaration[]} */
  const found = [];
  /** @type {number[]} */
  const stack = [];
  /** @type {Map<number, number>} */
  const closers = new Map();
  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    if (tok.t === "p" && tok.v === "{") {
      stack.push(tok.i);
    } else if (tok.t === "p" && tok.v === "}") {
      const open = stack.pop();
      if (open !== undefined) {
        closers.set(open, tok.i);
      }
    }
  }
  /** @type {Array<{ pos: number, keyed: boolean }>} */
  const open = [];
  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    if (tok.t === "p" && tok.v === "{") {
      const before = tokens[k - 1];
      open.push({ pos: tok.i, keyed: before?.t === "p" && before.v === ":" });
      continue;
    }
    if (tok.t === "p" && tok.v === "}") {
      open.pop();
      continue;
    }
    const colon = tokens[k + 1];
    const before = tokens[k - 1];
    const isKeyKind = tok.t === "id" || tok.t === "str" || tok.t === "num";
    if (
      !isKeyKind ||
      colon?.t !== "p" ||
      colon.v !== ":" ||
      before?.t !== "p" ||
      (before.v !== "{" && before.v !== ",") ||
      open.length === 0
    ) {
      continue;
    }
    const first = tokens[k + 2];
    if (first === undefined || (first.t === "p" && first.v === "{")) {
      continue;
    }
    let depth = 0;
    const parts = [];
    const exprs = [];
    let chain = "";
    const flush = () => {
      if (chain !== "") {
        exprs.push(chain);
        parts.push("§");
        chain = "";
      }
    };
    for (let m = k + 2; m < tokens.length; m += 1) {
      const v = tokens[m];
      if (v.t === "p") {
        if (v.v === "(" || v.v === "[" || v.v === "{") {
          depth += 1;
        } else if (v.v === ")" || v.v === "]" || v.v === "}") {
          if (depth === 0) {
            break;
          }
          depth -= 1;
        } else if (v.v === "," && depth === 0) {
          break;
        }
        if (v.v === "." && chain !== "") {
          chain += ".";
          continue;
        }
        flush();
        parts.push(v.v);
      } else if (v.t === "id") {
        if (chain !== "" && !chain.endsWith(".")) {
          flush();
        }
        chain += v.v;
      } else {
        flush();
        parts.push(v.v);
      }
    }
    flush();
    const parentStart = open[open.length - 1].pos;
    // The whole style rule: climb out of nested selector and media objects.
    let rootIndex = open.length - 1;
    while (rootIndex > 0 && open[rootIndex].keyed) {
      rootIndex -= 1;
    }
    const ruleStart = open[rootIndex].pos;
    found.push({
      key: tok.v,
      prop: camel(tok.v),
      text: parts.join(" ").replace(/\s+/g, " ").trim(),
      exprs,
      line: tok.line,
      parentStart,
      parentEnd: closers.get(parentStart) ?? code.length,
      ruleStart,
      ruleEnd: closers.get(ruleStart) ?? code.length,
    });
  }
  return found;
}

/**
 * @typedef {object} JsxAttribute
 * @property {string} name Attribute name, or `...` for a spread.
 * @property {"string"|"expr"|"none"|"spread"} kind How the value is written.
 * @property {string} value Text of the string, or of the expression without
 *   its braces.
 * @property {number} index Offset of the attribute name.
 * @property {number} line One-based line.
 */

/**
 * @typedef {object} JsxTag
 * @property {string} name Tag name, for example `button` or `Search`.
 * @property {JsxAttribute[]} attrs Attributes in order.
 * @property {boolean} selfClosing Whether it ends with `/>`.
 * @property {number} start Offset of `<`.
 * @property {number} end Offset just after `>`.
 * @property {number} line One-based line of `<`.
 */

/**
 * Finds every JSX opening tag in comment-stripped source.
 * @param {string} code
 * @returns {JsxTag[]}
 */
export function findJsxTags(code) {
  /** @type {JsxTag[]} */
  const tags = [];
  const lineOf = lineFinder(code);
  const re = /<([A-Za-z][A-Za-z0-9_.:-]*)(?=[\s/>])/g;
  for (let match = re.exec(code); match !== null; match = re.exec(code)) {
    const start = match.index;
    let p = start - 1;
    while (p >= 0 && /\s/.test(code[p])) {
      p -= 1;
    }
    const prev = p >= 0 ? code[p] : "";
    const beforeWord = code.slice(Math.max(0, p - 6), p + 1);
    const jsxPosition =
      prev === "" ||
      "({>?:&|=,;[".includes(prev) ||
      /\breturn$/.test(beforeWord);
    if (!jsxPosition) {
      continue;
    }
    const tag = parseTag(code, start, match[1], lineOf);
    if (tag) {
      tags.push(tag);
      re.lastIndex = Math.max(re.lastIndex, start + match[0].length);
    }
  }
  return tags;
}

/**
 * Parses attributes of the tag that starts at `start`.
 * @param {string} code
 * @param {number} start
 * @param {string} name
 * @param {(index: number) => number} lineOf
 * @returns {JsxTag | undefined}
 */
function parseTag(code, start, name, lineOf) {
  let i = start + 1 + name.length;
  const n = code.length;
  /** @type {JsxAttribute[]} */
  const attrs = [];
  while (i < n) {
    while (i < n && /\s/.test(code[i])) {
      i += 1;
    }
    const c = code[i];
    if (c === ">") {
      return {
        name,
        attrs,
        selfClosing: false,
        start,
        end: i + 1,
        line: lineOf(start),
      };
    }
    if (c === "/" && code[i + 1] === ">") {
      return {
        name,
        attrs,
        selfClosing: true,
        start,
        end: i + 2,
        line: lineOf(start),
      };
    }
    if (c === "{") {
      const end = skipBalanced(code, i);
      attrs.push({
        name: "...",
        kind: "spread",
        value: code.slice(i + 1, end - 1),
        index: i,
        line: lineOf(i),
      });
      i = end;
      continue;
    }
    const nameMatch = /^[A-Za-z_:][A-Za-z0-9_:.-]*/.exec(code.slice(i, i + 80));
    if (!nameMatch) {
      return undefined;
    }
    const attrName = nameMatch[0];
    const attrIndex = i;
    i += attrName.length;
    while (i < n && /\s/.test(code[i])) {
      i += 1;
    }
    if (code[i] !== "=") {
      attrs.push({
        name: attrName,
        kind: "none",
        value: "",
        index: attrIndex,
        line: lineOf(attrIndex),
      });
      continue;
    }
    i += 1;
    while (i < n && /\s/.test(code[i])) {
      i += 1;
    }
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      const end = code.indexOf(quote, i + 1);
      if (end === -1) {
        return undefined;
      }
      attrs.push({
        name: attrName,
        kind: "string",
        value: code.slice(i + 1, end),
        index: attrIndex,
        line: lineOf(attrIndex),
      });
      i = end + 1;
    } else if (code[i] === "{") {
      const end = skipBalanced(code, i);
      attrs.push({
        name: attrName,
        kind: "expr",
        value: code.slice(i + 1, end - 1),
        index: attrIndex,
        line: lineOf(attrIndex),
      });
      i = end;
    } else {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Parses the JSX opening tag that starts at `start`, for a caller that already
 * knows the position is inside JSX (for example among an element's children),
 * where {@link findJsxTags} cannot tell a tag from a comparison.
 * @param {string} code Comment-stripped source.
 * @param {number} start Offset of `<`.
 * @returns {JsxTag | undefined}
 */
export function parseTagAt(code, start) {
  const match = /^<([A-Za-z][A-Za-z0-9_.:-]*)/.exec(
    code.slice(start, start + 80),
  );
  if (!match) {
    return undefined;
  }
  return parseTag(code, start, match[1], (index) => {
    let line = 1;
    for (let k = 0; k < index; k += 1) {
      if (code[k] === "\n") {
        line += 1;
      }
    }
    return line;
  });
}
