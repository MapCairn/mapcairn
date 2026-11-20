// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A provider's body is read through `readJsonWithin` and nothing else, so it
 * stops at a byte limit. This test holds every source tree to that: it reads
 * the code as tokens, with comments dropped, and fails on any use of a method
 * that reads a body, whether or not it is called on the spot, so a reference
 * kept in a variable, a destructured method, a bracket name and a call split
 * over lines are all found. It is a plain scan, not an analysis, and it fails
 * closed: a false finding is cleared by a change or by an entry in `EXEMPT`,
 * a missed read is not found at all.
 */

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** The methods that read a body or a stream of one. */
const READERS: ReadonlySet<string> = new Set([
  "json",
  "text",
  "arrayBuffer",
  "blob",
  "bytes",
  "formData",
  "getReader",
]);

/**
 * Where `text` is also an ordinary property name (a label, a credit, a token),
 * so outside the adapters only a call of it counts.
 */
const CALL_ONLY: ReadonlySet<string> = new Set(["text"]);

const SOURCE_FILE = /\.(?:tsx?|jsx?|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[^.]+$/;

type TokenKind = "word" | "string" | "punct";

interface Token {
  readonly kind: TokenKind;
  /** The word, the content of a string or template, or the punctuation. */
  readonly value: string;
  readonly line: number;
}

/** A body read found in a source: where, and what it is. */
interface BodyRead {
  readonly line: number;
  readonly name: string;
  readonly how: string;
}

const WORD_START = /[\p{L}_$]/u;
const WORD_PART = /[\p{L}\p{N}_$]/u;
const DIGIT = /[0-9]/;
const SPACE = /\s/;
/** What may stand before a `/` that divides, so any other `/` starts a regular expression. */
const DIVIDES_AFTER = /^(?:\)|\]|\})$/;

/** Words after which a `/` starts a regular expression, not a division. */
const REGEX_AFTER_WORD =
  /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do)$/;

/** Reads one source into tokens; see {@link tokenize}. */
class Lexer {
  readonly tokens: Token[] = [];
  /** `{` pushes "code" and `${` pushes "template"; the matching `}` pops. */
  readonly #nesting: ("code" | "template")[] = [];
  readonly #source: string;
  #line = 1;
  #i = 0;

  constructor(source: string) {
    this.#source = source;
  }

  run(): Token[] {
    while (this.#i < this.#source.length) {
      this.#next();
    }
    return this.tokens;
  }

  #char(offset = 0): string {
    return this.#source.charAt(this.#i + offset);
  }

  #push(kind: TokenKind, value: string, line = this.#line): void {
    this.tokens.push({ kind, value, line });
  }

  #next(): void {
    const char = this.#char();
    const next = this.#char(1);
    if (char === "\n") {
      this.#line += 1;
      this.#i += 1;
    } else if (SPACE.test(char)) {
      this.#i += 1;
    } else if (char === "/" && next === "/") {
      this.#skipLineComment();
    } else if (char === "/" && next === "*") {
      this.#skipBlockComment();
    } else if (char === '"' || char === "'") {
      this.#readQuoted(char);
    } else if (char === "`") {
      this.#i += 1;
      this.#readTemplate();
    } else if (char === "/" && this.#regexAllowed()) {
      this.#readRegex();
    } else if (WORD_START.test(char)) {
      this.#push("word", this.#take(WORD_PART));
    } else if (DIGIT.test(char)) {
      this.#take(/[\p{L}\p{N}_$.]/u);
      this.#push("punct", "0");
    } else {
      this.#readPunctuation(char);
    }
  }

  /** Moves past every character that matches `pattern`, and returns them. */
  #take(pattern: RegExp): string {
    const start = this.#i;
    while (this.#i < this.#source.length && pattern.test(this.#char())) {
      this.#i += 1;
    }
    return this.#source.slice(start, this.#i);
  }

  #skipLineComment(): void {
    while (this.#i < this.#source.length && this.#char() !== "\n") {
      this.#i += 1;
    }
  }

  #skipBlockComment(): void {
    const end = this.#source.indexOf("*/", this.#i + 2);
    const stop = end === -1 ? this.#source.length : end + 2;
    this.#line += this.#source.slice(this.#i, stop).split("\n").length - 1;
    this.#i = stop;
  }

  #readPunctuation(char: string): void {
    if (char === "}" && this.#nesting.at(-1) === "template") {
      this.#nesting.pop();
      this.#i += 1;
      this.#readTemplate();
      return;
    }
    if (char === "{") {
      this.#nesting.push("code");
    } else if (char === "}") {
      this.#nesting.pop();
    }
    this.#push("punct", char);
    this.#i += 1;
  }

  /** The rest of a template after its opening backtick or a closing `}` of `${}`. */
  #readTemplate(): void {
    const startLine = this.#line;
    let text = "";
    while (this.#i < this.#source.length) {
      const char = this.#char();
      if (char === "\\") {
        text += this.#source.slice(this.#i, this.#i + 2);
        this.#i += 2;
      } else if (char === "`") {
        this.#i += 1;
        break;
      } else if (char === "$" && this.#char(1) === "{") {
        this.#i += 2;
        this.#nesting.push("template");
        break;
      } else {
        this.#line += char === "\n" ? 1 : 0;
        text += char;
        this.#i += 1;
      }
    }
    this.#push("string", text, startLine);
  }

  #readQuoted(quote: string): void {
    let text = "";
    this.#i += 1;
    while (this.#i < this.#source.length && this.#char() !== "\n") {
      const char = this.#char();
      if (char === quote) {
        this.#i += 1;
        break;
      }
      const length = char === "\\" ? 2 : 1;
      text += this.#source.slice(this.#i, this.#i + length);
      this.#i += length;
    }
    this.#push("string", text);
  }

  #readRegex(): void {
    let inClass = false;
    this.#i += 1;
    while (this.#i < this.#source.length && this.#char() !== "\n") {
      const char = this.#char();
      this.#i += char === "\\" ? 2 : 1;
      if (char === "[") {
        inClass = true;
      } else if (char === "]") {
        inClass = false;
      } else if (char === "/" && !inClass) {
        break;
      }
    }
    this.#take(WORD_PART);
    this.#push("punct", "/regex/");
  }

  #regexAllowed(): boolean {
    const previous = this.tokens.at(-1);
    if (!previous) {
      return true;
    }
    if (previous.kind === "word") {
      return REGEX_AFTER_WORD.test(previous.value);
    }
    return previous.kind === "punct" && !DIVIDES_AFTER.test(previous.value);
  }
}

/**
 * Splits TypeScript or JavaScript into words, strings and punctuation, with
 * comments and spacing dropped. A string or template keeps its content so a
 * bracket name can be read; text inside a template's `${}` is tokenised as
 * code. A quoted string ends at its line, so an apostrophe in JSX text cannot
 * hide more than the rest of its line.
 */
function tokenize(source: string): Token[] {
  return new Lexer(source).run();
}

/**
 * For each token index of a `}`, the index of the `{` it closes, so a
 * destructuring pattern can be told from a block by what follows it.
 */
function bracePairs(tokens: readonly Token[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  tokens.forEach((token, index) => {
    if (token.kind !== "punct") {
      return;
    }
    if (token.value === "{") {
      open.push(index);
    } else if (token.value === "}") {
      const opener = open.pop();
      if (opener !== undefined) {
        pairs.set(index, opener);
      }
    }
  });
  return pairs;
}

/** Whether the `=` at `index` is an assignment, not `==`, `=>` or the like. */
function isAssignment(tokens: readonly Token[], index: number): boolean {
  const next = tokens[index + 1];
  return (
    tokens[index]?.value === "=" && next?.value !== "=" && next?.value !== ">"
  );
}

/**
 * Every use of a body-reading method in `source`: a property access (`.name`,
 * `?.name`), a bracket name (`["name"]`), a destructured or shorthand name,
 * called or not. With `anyText` false, `text` counts only when it is called,
 * written as a bracket name or destructured.
 */
function findBodyReads(source: string, anyText = true): BodyRead[] {
  const tokens = tokenize(source);
  const pairs = bracePairs(tokens);
  /** Whether a bare use of the word at `index` is a finding in this tree. */
  const bareCounts = (index: number): boolean =>
    anyText || !CALL_ONLY.has(tokens[index]?.value ?? "");
  const found = new Map<number, string>();

  tokens.forEach((_token, index) => {
    const how = useAt(tokens, index, bareCounts);
    if (how) {
      found.set(index, how);
    }
    for (const inside of patternReaders(tokens, pairs, index)) {
      if (bareCounts(inside)) {
        found.set(inside, "destructured");
      }
    }
  });
  return [...found]
    .map(([index, how]) => ({
      line: tokens[index]?.line ?? 0,
      name: tokens[index]?.value ?? "",
      how,
    }))
    .sort((x, y) => x.line - y.line);
}

/** How the token at `index` uses a reader name by itself, or `undefined` when it does not. */
function useAt(
  tokens: readonly Token[],
  index: number,
  bareCounts: (index: number) => boolean,
): string | undefined {
  const token = tokens[index];
  const before = tokens[index - 1]?.value;
  const after = tokens[index + 1]?.value;
  if (!token || !READERS.has(token.value)) {
    return undefined;
  }
  if (token.kind === "string") {
    return before === "[" && after === "]" ? "bracket" : undefined;
  }
  if (token.kind !== "word") {
    return undefined;
  }
  const isSpread = before === "." && tokens[index - 2]?.value === ".";
  if (before === "." && !isSpread) {
    return after === "(" || bareCounts(index) ? "property" : undefined;
  }
  return isShorthand(tokens, index) && bareCounts(index)
    ? "shorthand"
    : undefined;
}

/** Whether the word at `index` stands alone in an object literal or pattern, as `{ json }`. */
function isShorthand(tokens: readonly Token[], index: number): boolean {
  const before = tokens[index - 1]?.value;
  const after = tokens[index + 1]?.value;
  if (before !== "{" && before !== ",") {
    return false;
  }
  if (after !== "," && after !== "}") {
    return false;
  }
  return enclosedByBrace(tokens, index);
}

/** Whether the innermost brackets around `index` are braces, not parentheses or square brackets. */
function enclosedByBrace(tokens: readonly Token[], index: number): boolean {
  let depth = 0;
  for (let at = index - 1; at >= 0; at -= 1) {
    const value = tokens[at]?.value;
    if (value === "}" || value === ")" || value === "]") {
      depth += 1;
    } else if (value === "{" || value === "(" || value === "[") {
      if (depth === 0) {
        return value === "{";
      }
      depth -= 1;
    }
  }
  return false;
}

/**
 * The reader names inside the braces that the `}` at `index` closes, when it
 * closes a destructuring pattern: what follows it is an assignment.
 */
function patternReaders(
  tokens: readonly Token[],
  pairs: ReadonlyMap<number, number>,
  index: number,
): number[] {
  const opener = pairs.get(index);
  if (opener === undefined || !isAssignment(tokens, index + 1)) {
    return [];
  }
  const inside: number[] = [];
  for (let at = opener + 1; at < index; at += 1) {
    const token = tokens[at];
    if (token?.kind === "word" && READERS.has(token.value)) {
      inside.push(at);
    }
  }
  return inside;
}

/**
 * Where a use of a reader is allowed without `readJsonWithin`: the file, a
 * piece of the line it is on, and why. An entry that matches nothing fails
 * the check, so the list cannot go stale.
 */
interface Exemption {
  readonly file: string;
  readonly line: string;
  readonly reason: string;
}

const EXEMPT: readonly Exemption[] = [
  {
    file: "packages/web/src/adapters/shared/readJson.ts",
    line: "getReader()",
    reason:
      "It is the bounded reader: it reads the stream a chunk at a time and stops at the limit.",
  },
  {
    file: "packages/web/src/adapters/files/BrowserFileOpener.ts",
    line: "file.text()",
    reason:
      "It reads a file the person chose on their own device, not a provider's answer, after refusing one larger than the limit the caller gave.",
  },
  {
    file: "packages/web/src/routes/log-error.ts",
    line: "request.json()",
    reason:
      "It reads the visitor's own error report on the server, after a Content-Length gate that refuses one over 32 KiB; it is not a provider's answer.",
  },
  {
    file: "packages/web/src/adapters/files/BrowserFileOpener.ts",
    line: "resolve({ name: file.name, text })",
    reason:
      "It hands back the text of the chosen file, which the line above read after the size check.",
  },
  {
    file: "packages/web/src/adapters/maplibre/dataLayerPlan.ts",
    line: "text,",
    reason: "A label field of a map layer, not a body.",
  },
  {
    file: "packages/web/src/adapters/maplibre/shapeLayers.ts",
    line: "options.text,",
    reason:
      "A label option of a map layer, not a body: the adapters are scanned for any use of the name.",
  },
  {
    file: "packages/core/src/fakes/pngHeader.ts",
    line: "blob.slice(0, HEADER_BYTES).arrayBuffer()",
    reason:
      "It reads the first bytes of an image the page drew itself, for a test fake, not a provider's answer.",
  },
  {
    file: "packages/core/src/layers/validate.ts",
    line: "problems.text(",
    reason: "A validation helper named text, which reads no body.",
  },
  {
    file: "packages/core/src/layers/validateIdentify.ts",
    line: "problems.text(",
    reason: "A validation helper named text, which reads no body.",
  },
  {
    file: "packages/core/src/layers/validateKinds.ts",
    line: "problems.text(",
    reason: "A validation helper named text, which reads no body.",
  },
  {
    file: "examples/embed/src/placeSearch.ts",
    line: "getReader()",
    reason:
      "The example's own bounded reader, which stops at its limit, for an app that cannot import the host's.",
  },
];

/** Every source file under each `src` tree, as paths from the repository root. */
function sourceFiles(): string[] {
  const roots = [
    ...readdirSync(path.join(REPO, "packages")).map((n) => `packages/${n}`),
    ...readdirSync(path.join(REPO, "examples")).map((n) => `examples/${n}`),
  ];
  const walk = (directory: string): string[] =>
    readdirSync(path.join(REPO, directory), { withFileTypes: true }).flatMap(
      (entry) => {
        const relative = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
          return walk(relative);
        }
        return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
          ? [relative]
          : [];
      },
    );
  return roots.flatMap((root) => {
    try {
      return walk(`${root}/src`);
    } catch {
      return [];
    }
  });
}

/** Whether `text` is also a property name here, so any use of it is a finding. */
function isStrict(file: string): boolean {
  return file.includes("/adapters/");
}

function scanFile(file: string): { read: BodyRead; text: string }[] {
  const source = readFileSync(path.join(REPO, file), "utf8");
  const lines = source.split("\n");
  return findBodyReads(source, isStrict(file)).map((read) => ({
    read,
    text: (lines[read.line - 1] ?? "").trim(),
  }));
}

describe("the body read scanner finds", () => {
  it.each([
    ["a call", "const body = await response.json();"],
    ["text", "const text = await res.text();"],
    ["arrayBuffer", "const bytes = await response.arrayBuffer();"],
    ["blob", "const blob = await response.blob();"],
    ["bytes", "const bytes = await res.bytes();"],
    ["formData", "const form = await response.formData();"],
    ["a stream reader", "const reader = response.body?.getReader();"],
    ["a space before the call", "await response.json ();"],
    ["code after a block comment on its line", "/* hide */ return res.json();"],
    ["code before a trailing comment", "await r.json(); // read it"],
    ["an optional call", "await res?.json?.();"],
    ["a double-quoted bracket name", 'await res["json"]();'],
    ["a single-quoted bracket name", "await res['text']();"],
    ["a template bracket name", "await res[`blob`]();"],
    ["a method kept in a variable", "const j = res.json;\nj.call(res);"],
    ["a destructured method", "const { json } = res;"],
    ["a renamed destructured method", "const { json: read } = res;"],
    ["a nested destructured method", "const { a: { text } } = res;"],
    ["a shorthand property", "const x = { json };"],
    ["a call split from its dot", "await response\n  .json();"],
    ["a call split from its parentheses", "await response.json\n  ();"],
    ["a reflected call", "Reflect.apply(Response.prototype.json, res, []);"],
    ["a read inside a template", "const s = `${await res.json()}`;"],
    ["a read after a template", "const s = `a`; await res.json();"],
    ["a read after a regular expression", 'const r = /"/; await res.json();'],
    ["a read after a division", "const r = a / b; await res.json();"],
  ])("%s", (_name, source) => {
    expect(findBodyReads(source)).not.toEqual([]);
  });

  it("reports the line of each read, counting lines in comments and strings", () => {
    const source =
      "/* a\nb */\nconst a = `x\ny`;\nawait r.json();\n// r.text()\nawait r.blob();";
    expect(findBodyReads(source).map((read) => read.line)).toEqual([5, 7]);
  });

  it("finds any use of text where it is strict, and only a call elsewhere", () => {
    expect(findBodyReads("const t = res.text;", true)).toHaveLength(1);
    expect(findBodyReads("const t = label.text;", false)).toEqual([]);
    expect(findBodyReads("await res.text();", false)).toHaveLength(1);
    expect(findBodyReads("await res['text']();", false)).toHaveLength(1);
    expect(findBodyReads("const { text } = res;", false)).toEqual([]);
  });
});

describe("the files the check reads", () => {
  it.each(["a.ts", "a.tsx", "a.js", "a.jsx", "a.mjs", "a.cjs"])(
    "include %s",
    (name) => {
      expect(SOURCE_FILE.test(name)).toBe(true);
    },
  );

  it.each(["a.css", "a.json", "a.md", "a.d.ts.map"])("leave out %s", (name) => {
    expect(SOURCE_FILE.test(name)).toBe(false);
  });

  it.each(["a.test.ts", "a.spec.tsx", "a.test.mjs"])("skip %s", (name) => {
    expect(TEST_FILE.test(name)).toBe(true);
  });
});

describe("the body read scanner leaves alone", () => {
  it.each([
    ["a line comment", "// the body is read with .json() here"],
    ["a block comment", "/* then .text() */"],
    ["a doc comment", "/**\n * Reads it with `File.text()`.\n */"],
    ["a string that names a call", 'const a = "res.json()";'],
    ["a template that names a call", "const a = `res.json()`;"],
    ["a URL ending in .json", 'const url = "https://x.test/style.json";'],
    ["a regular expression that names a call", "const r = /\\.json\\(/;"],
    ["a quote inside a regular expression", "const r = /['\"]/; run();"],
    ["the bounded reader", "const body = await readJsonWithin(res, max);"],
    ["a property that only shares a prefix", "const x = response.jsonBody;"],
    ["a word that is not a property", "const json = 1;"],
    ["an object key", "const x = { json: 1 };"],
    ["a block", "if (a) { json(); }"],
  ])("%s", (_name, source) => {
    expect(findBodyReads(source)).toEqual([]);
  });
});

describe("the source trees' body reads", () => {
  const files = sourceFiles();

  it("scans the trees it is meant to hold", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "packages/web/src/adapters/search/NominatimSearchProvider.ts",
        "packages/web/src/adapters/search/PhotonSuggestionProvider.ts",
        "packages/web/src/adapters/routing/ValhallaRoutingProvider.ts",
        "packages/web/src/adapters/layers/FetchLayerSource.ts",
        "packages/web/src/adapters/shared/readJson.ts",
        "packages/core/src/ports/search.ts",
        "packages/map/src/index.ts",
        "examples/embed/src/placeSearch.ts",
      ]),
    );
  });

  it("reads no body except through readJsonWithin", () => {
    const unbounded = files.flatMap((file) =>
      scanFile(file)
        .filter(
          ({ text }) =>
            !EXEMPT.some(
              (exemption) =>
                exemption.file === file && text.includes(exemption.line),
            ),
        )
        .map(({ read, text }) => `${file}:${read.line}: ${text}`),
    );
    expect(unbounded).toEqual([]);
  });

  it("keeps every exemption in use and explained", () => {
    for (const { file, line, reason } of EXEMPT) {
      expect(files, `${file} is exempt but is not scanned`).toContain(file);
      expect(
        scanFile(file).some(({ text }) => text.includes(line)),
        `${file} is exempt for "${line}" but nothing there matches`,
      ).toBe(true);
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("reads each provider answer through readJsonWithin", () => {
    for (const file of [
      "packages/web/src/adapters/search/NominatimSearchProvider.ts",
      "packages/web/src/adapters/search/PhotonSuggestionProvider.ts",
      "packages/web/src/adapters/routing/ValhallaRoutingProvider.ts",
      "packages/web/src/adapters/layers/FetchLayerSource.ts",
    ]) {
      expect(readFileSync(path.join(REPO, file), "utf8"), file).toContain(
        "readJsonWithin(",
      );
    }
  });
});
