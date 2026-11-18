// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** What a highlighted run of code is. Anything else stays plain text. */
export type CodeTokenKind =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "name";

/** A run of code: plain text, or a token of one kind. */
export type CodeRun =
  | string
  | { readonly kind: CodeTokenKind; readonly text: string };

/** The TypeScript and JSX keywords the example could use. */
const KEYWORDS: ReadonlySet<string> = new Set([
  "as",
  "async",
  "await",
  "const",
  "default",
  "else",
  "export",
  "extends",
  "false",
  "from",
  "function",
  "if",
  "import",
  "interface",
  "let",
  "new",
  "null",
  "readonly",
  "return",
  "true",
  "type",
  "typeof",
  "undefined",
]);

/**
 * One token per match, tried in order: a comment, a string closed on its own
 * line (or a template literal), a number, a word, or any other single
 * character. The last branch matches everything, so no character is lost.
 */
const TOKEN =
  /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<string>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(?<number>\b\d+(?:\.\d+)?\b)|(?<word>[A-Za-z_$][\w$]*)|[\s\S]/g;

/** The kind of a word: a keyword, a capitalised name (a component or a type), or none. */
function wordKind(word: string): CodeTokenKind | undefined {
  if (KEYWORDS.has(word)) {
    return "keyword";
  }
  if (/^[A-Z]/.test(word)) {
    return "name";
  }
  return undefined;
}

/** The kind of one match, or none for plain text. */
function matchKind(
  groups: Record<string, string | undefined>,
): CodeTokenKind | undefined {
  if (groups.comment !== undefined) {
    return "comment";
  }
  if (groups.string !== undefined) {
    return "string";
  }
  if (groups.number !== undefined) {
    return "number";
  }
  if (groups.word !== undefined) {
    return wordKind(groups.word);
  }
  return undefined;
}

/**
 * Splits TypeScript or TSX source into runs for syntax highlighting, with
 * neighbouring plain text merged into one string. Joined back, the runs are
 * the source exactly.
 *
 * @remarks A small lexical pass, not a parser: it is for the product page's
 *   own example, which its tests check, and it never needs a dependency or
 *   an inline style.
 */
export function highlightCode(source: string): CodeRun[] {
  const runs: CodeRun[] = [];
  let plain = "";
  for (const match of source.matchAll(TOKEN)) {
    const kind = matchKind(match.groups ?? {});
    if (kind === undefined) {
      plain += match[0];
      continue;
    }
    if (plain !== "") {
      runs.push(plain);
      plain = "";
    }
    runs.push({ kind, text: match[0] });
  }
  if (plain !== "") {
    runs.push(plain);
  }
  return runs;
}
