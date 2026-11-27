// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Reads the Lit templates of a source file as markup, for the harmony scanner
 * and the copy check.
 *
 * A tagged template counts when its tag is `html` or `svg`, or another name
 * those two are imported under from Lit. The tag is enough, wherever it comes
 * from, so a template re-exported through a local module is still read.
 *
 * It is not a full HTML parser: it reads start tags, end tags, comments, text
 * and the `${...}` holes between and inside them. It does not read a template
 * with a hole for a tag name, or one whose tag is reached through a member
 * (`lit.html`).
 */
import { lineFinder, skipBalanced } from "./lex.mjs";

/**
 * @typedef {object} LitHole
 * @property {"hole"} kind
 * @property {string} expr The expression inside `${...}`, with each template
 *   nested in it written as `§`.
 * @property {LitTemplate[]} templates The templates nested directly in it.
 * @property {number} line One-based line of the `$`.
 */

/**
 * @typedef {object} LitText
 * @property {"text"} kind
 * @property {string} value
 * @property {number} line Line of its first character that is not a space.
 */

/**
 * @typedef {object} LitAttribute
 * @property {string} name The name as written, without its Lit prefix.
 * @property {""|"."|"?"|"@"} prefix A property (`.`), boolean (`?`) or event
 *   (`@`) binding, or a plain attribute.
 * @property {string} text The static text of the value, with a space where each
 *   hole is.
 * @property {LitHole[]} holes The holes in the value.
 * @property {number} line One-based line of the name.
 */

/**
 * @typedef {object} LitElement
 * @property {"element"} kind
 * @property {string} name The tag name in lower case.
 * @property {LitAttribute[]} attrs
 * @property {LitHole[]} directives Holes among the attributes, which may set any
 *   attribute.
 * @property {LitNode[]} children
 * @property {number} line One-based line of `<`.
 */

/** @typedef {LitElement | LitText | LitHole} LitNode */

/**
 * @typedef {object} LitTemplate
 * @property {boolean} isSvg Whether it is written with the `svg` tag.
 * @property {LitNode[]} nodes The nodes at its root.
 */

/**
 * @typedef {object} Found
 * @property {number} start Offset of the tag.
 * @property {number} end Offset just after the closing backtick.
 * @property {LitTemplate} template
 */

/** @typedef {Map<number, { end: number, node: LitHole }>} Holes */

/**
 * @typedef {object} Source
 * @property {string} code Comment-stripped source.
 * @property {(index: number) => number} lineAt
 * @property {Map<string, boolean>} tags See `templateTags`.
 * @property {LitTemplate[]} all Receives every template parsed.
 */

/** A tag name at the end of the text, not reached through a member or a path. */
const TRAILING_NAME = /(?<![\w$./-])([A-Za-z_$][\w$]*)$/;

/** The longest text before a backtick that is looked at for a tag name. */
const TAG_WINDOW = 80;

/**
 * A character, or the word `return`, after which `/` starts a regular
 * expression. `<` is left out, so the `/` of a closing JSX tag does not.
 */
const BEFORE_REGEX = /(?:^|[(,=:[!&|?{};+*%>~^-]|\breturn)\s*$/;

/** A regular expression literal: classes and escapes may hold a `/`. */
const REGEX_LITERAL = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\[\n])+\//y;

const LIT_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*["'](?:lit|lit-html|lit-element)(?:\/[^"']*)?["']/g;

/** HTML elements that have no end tag. */
const VOID_ELEMENTS = new Set(
  "area base br col embed hr img input link meta source track wbr".split(" "),
);

/**
 * The names that tag a template in this file, each with whether it means `svg`.
 * @param {string} code
 * @returns {Map<string, boolean>}
 */
function templateTags(code) {
  const tags = new Map([
    ["html", false],
    ["svg", true],
  ]);
  for (const [, names] of code.matchAll(LIT_IMPORT)) {
    for (const part of names.split(",")) {
      const [imported, alias] = part.trim().split(/\s+as\s+/);
      if (alias && (imported === "html" || imported === "svg")) {
        tags.set(alias, imported === "svg");
      }
    }
  }
  return tags;
}

/**
 * Index just after the quoted string that starts at `start`. It ends at the
 * line's end at the latest, so a stray apostrophe hides one line at most.
 * @param {string} code
 * @param {number} start
 * @returns {number}
 */
function skipString(code, start) {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length && code[i] !== quote && code[i] !== "\n") {
    i += code[i] === "\\" ? 2 : 1;
  }
  return i + 1;
}

/**
 * Index just after what starts at `i` and cannot hold a template: a string or
 * a regular expression. Otherwise the next index.
 * @param {string} code
 * @param {number} i
 * @returns {number}
 */
function skipPlain(code, i) {
  if (code[i] === '"' || code[i] === "'") {
    return skipString(code, i);
  }
  const before = code.slice(Math.max(0, i - TAG_WINDOW), i);
  // `/>` ends a JSX tag.
  const startsSlash = code[i] === "/" && code[i + 1] !== ">";
  if (startsSlash && BEFORE_REGEX.test(before)) {
    REGEX_LITERAL.lastIndex = i;
    return REGEX_LITERAL.test(code) ? REGEX_LITERAL.lastIndex : i + 1;
  }
  return i + 1;
}

/**
 * Finds where the template that opens at `tick` closes, and where its holes are.
 * @param {string} code
 * @param {number} tick
 * @returns {{ close: number, spans: Array<{ from: number, to: number }> }}
 */
function templateSpans(code, tick) {
  /** @type {Array<{ from: number, to: number }>} */
  const spans = [];
  let i = tick + 1;
  while (i < code.length && code[i] !== "`") {
    if (code[i] === "\\") {
      i += 2;
    } else if (code.startsWith("${", i)) {
      const to = skipBalanced(code, i + 1);
      spans.push({ from: i, to });
      i = to;
    } else {
      i += 1;
    }
  }
  return { close: i, spans };
}

/**
 * The tagged templates in a range of code that are not inside one another.
 * Those nested in them are parsed too, and join `source.all`.
 * @param {Source} source
 * @param {{ from: number, to: number }} range
 * @returns {Found[]}
 */
function findIn(source, { from, to }) {
  const { code } = source;
  /** @type {Found[]} */
  const found = [];
  let i = from;
  while (i < to) {
    if (code[i] === "`") {
      const literal = readTemplateLiteral(source, i);
      found.push(...literal.found);
      i = literal.end;
    } else {
      i = skipPlain(code, i);
    }
  }
  return found;
}

/**
 * Reads the template literal that opens at `tick`. A tagged one is parsed. Any
 * other gives the tagged templates inside its holes.
 * @param {Source} source
 * @param {number} tick
 * @returns {{ end: number, found: Found[] }}
 */
function readTemplateLiteral(source, tick) {
  const { code, tags } = source;
  const { close, spans } = templateSpans(code, tick);
  const before = code.slice(Math.max(0, tick - TAG_WINDOW), tick);
  const tag = TRAILING_NAME.exec(before)?.[1] ?? "";
  const holes = spans.map((span) => ({
    ...span,
    nested: findIn(source, { from: span.from + 2, to: span.to - 1 }),
  }));
  const isSvg = tags.get(tag);
  if (isSvg === undefined) {
    return { end: close + 1, found: holes.flatMap((hole) => hole.nested) };
  }
  const template = {
    isSvg,
    nodes: parseMarkup(
      source,
      { from: tick + 1, to: close },
      new Map(holes.map((hole) => [hole.from, holeNode(source, hole)])),
    ),
  };
  source.all.push(template);
  return {
    end: close + 1,
    found: [{ start: tick - tag.length, end: close + 1, template }],
  };
}

/**
 * @param {Source} source
 * @param {{ from: number, to: number, nested: Found[] }} hole
 * @returns {{ end: number, node: LitHole }}
 */
function holeNode({ code, lineAt }, { from, to, nested }) {
  let expr = "";
  let last = from + 2;
  for (const inner of nested) {
    expr += `${code.slice(last, inner.start)}§`;
    last = inner.end;
  }
  expr += code.slice(last, to - 1);
  return {
    end: to,
    node: {
      kind: "hole",
      expr,
      templates: nested.map((inner) => inner.template),
      line: lineAt(from),
    },
  };
}

/**
 * Reads one attribute's value, which starts at `start`: quoted, a hole or bare.
 * @param {Source} source
 * @param {Holes} holes
 * @param {number} start
 * @returns {{ end: number, text: string, found: LitHole[] }}
 */
function readValue({ code }, holes, start) {
  const quote = code[start] === '"' || code[start] === "'" ? code[start] : "";
  const ends = (/** @type {number} */ at) =>
    quote === "" ? /[\s>`]/.test(code[at]) : code[at] === quote;
  let i = start + quote.length;
  let text = "";
  /** @type {LitHole[]} */
  const found = [];
  while (i < code.length && !ends(i)) {
    const hole = holes.get(i);
    if (hole) {
      found.push(hole.node);
      text += " ";
      i = hole.end;
    } else {
      text += code[i];
      i += 1;
    }
  }
  return { end: i + quote.length, text, found };
}

/** @param {string} code @param {number} from @returns {number} */
function skipSpace(code, from) {
  let i = from;
  while (/\s/.test(code[i] ?? "")) {
    i += 1;
  }
  return i;
}

/**
 * Reads the attribute whose name starts at `start`.
 * @param {Source} source
 * @param {Holes} holes
 * @param {number} start
 * @returns {{ end: number, attribute: LitAttribute } | undefined}
 */
function readAttribute(source, holes, start) {
  const { code, lineAt } = source;
  const pattern = /[^\s=/>"'$`]+/y;
  pattern.lastIndex = start;
  const written = pattern.exec(code)?.[0];
  if (written === undefined) {
    return undefined;
  }
  const prefix = /** @type {LitAttribute["prefix"]} */ (
    /^[.?@]/.exec(written)?.[0] ?? ""
  );
  const equals = skipSpace(code, start + written.length);
  const value =
    code[equals] === "="
      ? readValue(source, holes, skipSpace(code, equals + 1))
      : { end: start + written.length, text: "", found: [] };
  return {
    end: value.end,
    attribute: {
      name: written.slice(prefix.length),
      prefix,
      text: value.text,
      holes: value.found,
      line: lineAt(start),
    },
  };
}

/**
 * Reads the start tag at `start`.
 * @param {Source} source
 * @param {Holes} holes
 * @param {number} start Offset of `<`.
 * @param {string} name The tag name as written.
 * @returns {{ end: number, element: LitElement, selfClosing: boolean }}
 */
function readStartTag(source, holes, start, name) {
  const { code, lineAt } = source;
  /** @type {LitElement} */
  const element = {
    kind: "element",
    name: name.toLowerCase(),
    attrs: [],
    directives: [],
    children: [],
    line: lineAt(start),
  };
  let i = start + 1 + name.length;
  while (i < code.length && code[i] !== ">" && code[i] !== "`") {
    const hole = holes.get(i);
    const attribute = hole ? undefined : readAttribute(source, holes, i);
    if (hole) {
      element.directives.push(hole.node);
      i = hole.end;
    } else if (attribute) {
      element.attrs.push(attribute.attribute);
      i = attribute.end;
    } else {
      i += 1;
    }
  }
  return { end: i + 1, element, selfClosing: code[i - 1] === "/" };
}

/**
 * Parses the markup of one template body into a tree.
 * @param {Source} source
 * @param {{ from: number, to: number }} body
 * @param {Holes} holes
 * @returns {LitNode[]}
 */
function parseMarkup(source, { from, to }, holes) {
  const { code, lineAt } = source;
  /** @type {LitNode[]} */
  const roots = [];
  /** @type {LitElement[]} */
  const open = [];
  const add = (/** @type {LitNode} */ node) => {
    (open.at(-1)?.children ?? roots).push(node);
  };
  let textFrom = from;
  const addText = (/** @type {number} */ until) => {
    const value = code.slice(textFrom, until);
    if (value.trim() !== "") {
      const leading = value.length - value.trimStart().length;
      add({ kind: "text", value, line: lineAt(textFrom + leading) });
    }
  };
  const startTag = /<([A-Za-z][\w:-]*)/y;
  const endTag = /<\/([A-Za-z][\w:-]*)\s*>/y;

  /** Handles what starts at `i`, and says where the markup goes on. */
  const readMarkup = (/** @type {number} */ at) => {
    const hole = holes.get(at);
    if (hole) {
      addText(at);
      add(hole.node);
      return hole.end;
    }
    if (code.startsWith("<!--", at)) {
      addText(at);
      const close = code.indexOf("-->", at + 4);
      return close === -1 || close > to ? to : close + 3;
    }
    endTag.lastIndex = at;
    const closing = endTag.exec(code)?.[1].toLowerCase();
    if (closing !== undefined) {
      addText(at);
      const matching = open.findLastIndex(
        (element) => element.name === closing,
      );
      if (matching !== -1) {
        open.length = matching;
      }
      return endTag.lastIndex;
    }
    startTag.lastIndex = at;
    const name = startTag.exec(code)?.[1];
    if (name === undefined) {
      return undefined;
    }
    addText(at);
    const tag = readStartTag(source, holes, at, name);
    add(tag.element);
    if (!(tag.selfClosing || VOID_ELEMENTS.has(tag.element.name))) {
      open.push(tag.element);
    }
    return tag.end;
  };

  let i = from;
  while (i < to) {
    const next = readMarkup(i);
    if (next === undefined) {
      i += 1;
    } else {
      i = next;
      textFrom = next;
    }
  }
  addText(to);
  return roots;
}

/**
 * Every Lit template in comment-stripped source, nested ones included, each
 * once.
 * @param {string} code Output of `stripComments`.
 * @returns {LitTemplate[]}
 */
export function findLitTemplates(code) {
  /** @type {Source} */
  const source = {
    code,
    lineAt: lineFinder(code),
    tags: templateTags(code),
    all: [],
  };
  findIn(source, { from: 0, to: code.length });
  return source.all;
}

/**
 * Every node of a list and the nodes under each element, in reading order. It
 * does not enter a nested template: {@link findLitTemplates} lists those.
 * @param {LitNode[]} nodes
 * @returns {Generator<LitNode>}
 */
export function* walkLitNodes(nodes) {
  for (const node of nodes) {
    yield node;
    if (node.kind === "element") {
      yield* walkLitNodes(node.children);
    }
  }
}
