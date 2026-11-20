// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Looks inside the short programs of `sed` and `awk` for what writes: a `sed`
 * script with a `w`, `W` or `e` command or flag (it writes a file or runs a
 * command), and an `awk` program with a redirection, a pipe or `system`. Used
 * by `guardCommands.mjs`. It is a scan of text that errs towards blocking: an
 * `awk` comparison such as `$1 > 5` is refused too.
 */

/**
 * Skips past the closing delimiter of a `/regex/` or `s/a/b/` part.
 *
 * @param {string} script
 * @param {number} from Just after the opening delimiter.
 * @param {string} delimiter
 * @returns {number} Just after the closing delimiter.
 */
function skipDelimited(script, from, delimiter) {
  let index = from;
  while (index < script.length && script.charAt(index) !== delimiter) {
    index += script.charAt(index) === "\\" ? 2 : 1;
  }
  return index + 1;
}

/**
 * The flags of an `s` command, up to the end of the command.
 *
 * @param {string} script
 * @param {number} from
 * @returns {{ flags: string, end: number }}
 */
function readSubstituteFlags(script, from) {
  let end = from;
  while (end < script.length && !/[;}\n\s]/.test(script.charAt(end))) {
    end += 1;
  }
  return { flags: script.slice(from, end), end };
}

/**
 * Where a command that takes the rest of its line (`a`, `i`, `c`, `r`, a label)
 * ends.
 *
 * @param {string} script
 * @param {number} from
 * @returns {number}
 */
function skipLine(script, from) {
  const end = script.indexOf("\n", from);
  return end === -1 ? script.length : end;
}

/**
 * Where the label of `b`, `t` or `T` ends: at a semicolon, a closing brace or
 * white space, as GNU `sed` reads it.
 *
 * @param {string} script
 * @param {number} from
 * @returns {number}
 */
function skipLabel(script, from) {
  let end = from;
  while (/[ \t]/.test(script.charAt(end))) {
    end += 1;
  }
  while (end < script.length && !/[;}\s]/.test(script.charAt(end))) {
    end += 1;
  }
  return end;
}

/**
 * Skips an address (a line number, `$`, a range, a `/regex/`) at the start of a
 * command.
 *
 * @param {string} script
 * @param {number} index
 * @returns {number | undefined} Where the address ends, or nothing if there is none.
 */
function skipAddress(script, index) {
  const char = script.charAt(index);
  if (/[0-9$,~+]/.test(char)) {
    return index + 1;
  }
  if (char === "/") {
    return skipDelimited(script, index + 1, "/");
  }
  return char === "\\"
    ? skipDelimited(script, index + 2, script.charAt(index + 1))
    : undefined;
}

/**
 * Finds a `sed` command that writes a file or runs a command.
 *
 * @param {string} script
 * @returns {string | undefined} What was found, or nothing.
 */
export function sedProblem(script) {
  let index = 0;
  while (index < script.length) {
    const char = script.charAt(index);
    const address = skipAddress(script, index);
    if (/[\s;{}!]/.test(char)) {
      index += 1;
    } else if (address !== undefined) {
      index = address;
    } else if (/[weW]/.test(char)) {
      return `the sed command ${char} writes a file or runs a command`;
    } else if (char === "s" || char === "y") {
      const delimiter = script.charAt(index + 1);
      const first = skipDelimited(script, index + 2, delimiter);
      const second = skipDelimited(script, first, delimiter);
      const { flags, end } = readSubstituteFlags(script, second);
      if (char === "s" && /[we]/.test(flags)) {
        return "an s flag w or e writes a file or runs a command";
      }
      index = end;
    } else if (/[aicrR:]/.test(char)) {
      index = skipLine(script, index + 1);
    } else if (/[btT]/.test(char)) {
      index = skipLabel(script, index + 1);
    } else {
      index += 1;
    }
  }
  return undefined;
}

/**
 * Where an `awk` scan is: inside a `print` statement or not, and how deep in
 * parentheses.
 *
 * @typedef {{ inPrint: boolean, depth: number }} AwkState
 */

/**
 * @param {string} word
 * @param {AwkState} state
 * @returns {string | undefined}
 */
function awkWord(word, state) {
  if (word === "system" || word === "getline") {
    return `awk ${word} can run a command or read a file`;
  }
  if (word === "print" || word === "printf") {
    state.inPrint = true;
    state.depth = 0;
  }
  return undefined;
}

/**
 * @param {string} char
 * @param {AwkState} state
 * @returns {string | undefined}
 */
function awkPunctuation(char, state) {
  if (char === "(") {
    state.depth += 1;
  } else if (char === ")") {
    state.depth -= 1;
  } else if (state.inPrint && state.depth <= 0 && /[;}\n]/.test(char)) {
    state.inPrint = false;
  } else if (state.inPrint && state.depth <= 0 && /[>|]/.test(char)) {
    return "an awk print with > or | writes a file or runs a command";
  }
  return undefined;
}

/**
 * Finds `system`, `getline`, and a `>`, `>>` or `|` that ends a `print` or
 * `printf` statement in an `awk` program. Comparisons elsewhere (`$1 > 5`)
 * and text in strings or parentheses are left alone.
 *
 * @param {string} script
 * @returns {string | undefined}
 */
function awkScriptProblem(script) {
  /** @type {AwkState} */
  const state = { inPrint: false, depth: 0 };
  let index = 0;
  while (index < script.length) {
    const char = script.charAt(index);
    const word = /^[A-Za-z_]\w*/.exec(script.slice(index, index + 32))?.[0];
    const problem =
      word === undefined ? awkPunctuation(char, state) : awkWord(word, state);
    if (problem !== undefined) {
      return problem;
    }
    index =
      char === '"'
        ? skipDelimited(script, index + 1, '"')
        : index + (word?.length ?? 1);
  }
  return undefined;
}

/**
 * Finds what makes an `awk` command able to write: a program file, or a
 * program that redirects or pipes a `print`, or runs `system` or `getline`.
 *
 * @param {string[]} args The words after `awk`.
 * @returns {string | undefined}
 */
export function awkProblem(args) {
  const files = args.filter((arg) =>
    /^(-f|--file|-i|--include|-l|--load)/.test(arg),
  );
  if (files.length > 0) {
    return "awk with a program file, an include or a library cannot be read";
  }
  let script;
  for (let index = 0; index < args.length && script === undefined; index += 1) {
    const arg = args[index] ?? "";
    if (/^-[Fv]$/.test(arg)) {
      index += 1;
    } else if (!arg.startsWith("-")) {
      script = arg;
    }
  }
  return awkScriptProblem(script ?? "");
}
