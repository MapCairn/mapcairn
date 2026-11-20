// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Splits a shell command into statements and words for `guardWrites.mjs`. It
 * reads the text a shell would split, not what a shell would run: it does not
 * expand variables, globs or command substitutions.
 *
 * Statements end at `;`, `&`, `&&`, `|`, `||`, a newline, a parenthesis or a
 * backtick, so the inside of a command substitution and of backticks is read as statements of
 * its own. Quotes are removed, text in single quotes stays literal, and a
 * backslash before an ordinary character stays, so a Windows path survives.
 * Redirections become tokens of their own, and the bodies of here-documents
 * are skipped.
 */

/**
 * One shell token: a word, or a redirection operator such as `>`, `2>&`.
 *
 * @typedef {{ type: "word", text: string } | { type: "redirect", op: string }} Token
 */

/**
 * @typedef {object} Lexer
 * @property {string} text
 * @property {number} index
 * @property {string | null} word The word being read, if any.
 * @property {Token[]} tokens The statement being read.
 * @property {Token[][]} statements
 * @property {{ delimiter: string, strip: boolean }[]} pending Here-documents
 *   whose bodies start after the next newline.
 * @property {boolean} unterminated Whether a here-document body had no end.
 */

/** Characters after a backslash that it escapes (otherwise it stays). */
const ESCAPABLE = /[\s'"$`;&|<>()*?#\\]/;

/** Characters that end a statement. */
const SEPARATORS = new Set([";", "&", "|", "(", ")", "`"]);

/**
 * @param {Lexer} lexer
 * @param {number} [offset]
 * @returns {string}
 */
function peek(lexer, offset = 0) {
  return lexer.text.charAt(lexer.index + offset);
}

/**
 * @param {Lexer} lexer
 * @param {string} text
 */
function append(lexer, text) {
  lexer.word = (lexer.word ?? "") + text;
}

/** @param {Lexer} lexer */
function endWord(lexer) {
  if (lexer.word !== null) {
    lexer.tokens.push({ type: "word", text: lexer.word });
    lexer.word = null;
  }
}

/** @param {Lexer} lexer */
function endStatement(lexer) {
  endWord(lexer);
  if (lexer.tokens.length > 0) {
    lexer.statements.push(lexer.tokens);
  }
  lexer.tokens = [];
}

/**
 * Skips the bodies of the here-documents that a line started.
 *
 * @param {Lexer} lexer At the start of the next line.
 */
function skipHeredocs(lexer) {
  for (const { delimiter, strip } of lexer.pending) {
    let found = false;
    while (lexer.index < lexer.text.length) {
      const end = lexer.text.indexOf("\n", lexer.index);
      const stop = end === -1 ? lexer.text.length : end;
      const line = lexer.text.slice(lexer.index, stop);
      lexer.index = end === -1 ? stop : stop + 1;
      if ((strip ? line.replace(/^\t+/, "") : line) === delimiter) {
        found = true;
        break;
      }
    }
    lexer.unterminated ||= !found;
  }
  lexer.pending = [];
}

/** @param {Lexer} lexer */
function newline(lexer) {
  if (peek(lexer) !== "\n") {
    return false;
  }
  endStatement(lexer);
  lexer.index += 1;
  skipHeredocs(lexer);
  return true;
}

/** @param {Lexer} lexer */
function blank(lexer) {
  if (peek(lexer) !== " " && peek(lexer) !== "\t") {
    return false;
  }
  endWord(lexer);
  lexer.index += 1;
  return true;
}

/** @param {Lexer} lexer */
function comment(lexer) {
  if (peek(lexer) !== "#" || lexer.word !== null) {
    return false;
  }
  const end = lexer.text.indexOf("\n", lexer.index);
  lexer.index = end === -1 ? lexer.text.length : end;
  return true;
}

/** @param {Lexer} lexer */
function backslash(lexer) {
  if (peek(lexer) !== "\\") {
    return false;
  }
  const next = peek(lexer, 1);
  if (next === "\n") {
    lexer.index += 2;
  } else if (ESCAPABLE.test(next)) {
    append(lexer, next);
    lexer.index += 2;
  } else {
    append(lexer, "\\");
    lexer.index += 1;
  }
  return true;
}

/** @param {Lexer} lexer */
function singleQuote(lexer) {
  if (peek(lexer) !== "'") {
    return false;
  }
  const end = lexer.text.indexOf("'", lexer.index + 1);
  const stop = end === -1 ? lexer.text.length : end;
  append(lexer, lexer.text.slice(lexer.index + 1, stop));
  lexer.index = stop + 1;
  return true;
}

/** @param {Lexer} lexer */
function doubleQuote(lexer) {
  if (peek(lexer) !== '"') {
    return false;
  }
  append(lexer, "");
  lexer.index += 1;
  while (lexer.index < lexer.text.length && peek(lexer) !== '"') {
    const escaped = peek(lexer) === "\\" && /["\\$`]/.test(peek(lexer, 1));
    append(lexer, escaped ? peek(lexer, 1) : peek(lexer));
    lexer.index += escaped ? 2 : 1;
  }
  lexer.index += 1;
  return true;
}

/** @param {Lexer} lexer */
function ampersandRedirect(lexer) {
  if (peek(lexer) !== "&" || peek(lexer, 1) !== ">") {
    return false;
  }
  endWord(lexer);
  const op = peek(lexer, 2) === ">" ? "&>>" : "&>";
  lexer.tokens.push({ type: "redirect", op });
  lexer.index += op.length;
  return true;
}

/** @param {Lexer} lexer */
function separator(lexer) {
  if (!SEPARATORS.has(peek(lexer))) {
    return false;
  }
  endStatement(lexer);
  lexer.index += 1;
  return true;
}

/**
 * Reads the word after `<<` the way the shell does: quotes and backslashes are
 * taken out wherever they are, and quoted text may hold spaces.
 *
 * @param {string} text
 * @param {number} start
 * @returns {{ delimiter: string, end: number }}
 */
function readDelimiter(text, start) {
  let cursor = start;
  let delimiter = "";
  while (cursor < text.length && !/[\s;&|<>()]/.test(text.charAt(cursor))) {
    const char = text.charAt(cursor);
    if (char === "\\") {
      delimiter += text.charAt(cursor + 1);
      cursor += 2;
    } else if (char === "'" || char === '"') {
      const close = text.indexOf(char, cursor + 1);
      const stop = close === -1 ? text.length : close;
      delimiter += text.slice(cursor + 1, stop);
      cursor = stop + 1;
    } else {
      delimiter += char;
      cursor += 1;
    }
  }
  return { delimiter, end: Math.min(cursor, text.length) };
}

/**
 * Reads `<<WORD`, `<<-WORD` or `<<'WORD'`: records the delimiter so that the
 * body is skipped after the next newline.
 *
 * @param {Lexer} lexer At the first `<`.
 */
function heredocStart(lexer) {
  let cursor = lexer.index + 2;
  const strip = lexer.text.charAt(cursor) === "-";
  cursor += strip ? 1 : 0;
  while (/[ \t]/.test(lexer.text.charAt(cursor))) {
    cursor += 1;
  }
  const { delimiter, end } = readDelimiter(lexer.text, cursor);
  lexer.pending.push({ delimiter, strip });
  lexer.tokens.push({ type: "redirect", op: "<<" });
  lexer.index = end;
}

/**
 * Reads a redirection operator after an optional file descriptor number.
 *
 * @param {Lexer} lexer At a `<` or `>`.
 * @param {string} prefix The descriptor, such as `2`.
 */
function redirectOperator(lexer, prefix) {
  const char = peek(lexer);
  if (char === "<" && peek(lexer, 1) === ">") {
    lexer.tokens.push({ type: "redirect", op: `${prefix}<>` });
    lexer.index += 2;
    return;
  }
  let op = char;
  lexer.index += 1;
  while (peek(lexer) === char && op.length < 3) {
    op += char;
    lexer.index += 1;
  }
  const tail = peek(lexer);
  if (char === ">" && (tail === "&" || tail === "|")) {
    op += tail;
    lexer.index += 1;
  }
  lexer.tokens.push({ type: "redirect", op: prefix + op });
}

/** @param {Lexer} lexer */
function redirect(lexer) {
  const char = peek(lexer);
  if (char !== ">" && char !== "<") {
    return false;
  }
  const isDescriptor = lexer.word !== null && /^\d+$/.test(lexer.word);
  const prefix = isDescriptor ? (lexer.word ?? "") : "";
  if (isDescriptor) {
    lexer.word = null;
  }
  endWord(lexer);
  const isHeredoc =
    char === "<" && peek(lexer, 1) === "<" && peek(lexer, 2) !== "<";
  if (isHeredoc) {
    heredocStart(lexer);
  } else {
    redirectOperator(lexer, prefix);
  }
  return true;
}

/** Tried in order for each character; the first that applies reads it. */
const READERS = [
  newline,
  blank,
  comment,
  backslash,
  singleQuote,
  doubleQuote,
  ampersandRedirect,
  separator,
  redirect,
];

/**
 * Splits a shell command into statements of words and redirections.
 *
 * @param {string} command
 * @returns {{ statements: Token[][], unterminated: boolean }} `unterminated`
 *   is true when a here-document has no closing line, so the text after it
 *   cannot be told apart from its body.
 */
export function tokenize(command) {
  /** @type {Lexer} */
  const lexer = {
    text: command.replaceAll("\r\n", "\n"),
    index: 0,
    word: null,
    tokens: [],
    statements: [],
    pending: [],
    unterminated: false,
  };
  while (lexer.index < lexer.text.length) {
    if (!READERS.some((reader) => reader(lexer))) {
      append(lexer, peek(lexer));
      lexer.index += 1;
    }
  }
  endStatement(lexer);
  return {
    statements: lexer.statements,
    unterminated: lexer.unterminated || lexer.pending.length > 0,
  };
}
