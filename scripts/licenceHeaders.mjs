// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Checks, or adds, the SPDX licence header at the top of every tracked source
 * file (`.ts`, `.tsx`, `.mjs`, `.cjs`).
 *
 *   node scripts/licenceHeaders.mjs           fails and lists files with no header
 *   node scripts/licenceHeaders.mjs --write   adds the header where it is missing
 *
 * The repository is AGPL-3.0-only, so a header that names any other licence
 * fails. A shebang stays on the first line, with the header after it.
 * Adding is safe to repeat: a file that already has the right identifier is
 * left alone.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { isEntryPoint } from "./entryPoint.mjs";

const IDENTIFIER = "AGPL-3.0-only";
/** The two header lines every source file starts with, after any shebang. */
export const HEADER = `// SPDX-License-Identifier: ${IDENTIFIER}\n// Copyright MapCairn contributors\n`;
const SOURCE_FILE = /\.(?:ts|tsx|mjs|cjs)$/;
const IDENTIFIER_LINE = /SPDX-License-Identifier: (\S+)\s*$/;
/** A line that names some identifier, however it is written (`Apache-2.0 OR MIT` included). */
const ANY_IDENTIFIER_LINE = /SPDX-License-Identifier:/;
/** How many leading lines are searched for an existing identifier. */
const HEADER_WINDOW_LINES = 5;

/**
 * Whether the first lines of the text carry the AGPL-3.0-only identifier.
 * A different identifier does not count.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasHeader(text) {
  return declaredIdentifier(text) === IDENTIFIER;
}

/**
 * The licence identifier named in the first lines of the text, or undefined
 * when they name none.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
export function declaredIdentifier(text) {
  return text
    .split("\n", HEADER_WINDOW_LINES)
    .map((line) => IDENTIFIER_LINE.exec(line)?.[1])
    .find((identifier) => identifier !== undefined);
}

/**
 * Whether the first lines of the text name a licence identifier of any kind,
 * including an expression such as `Apache-2.0 OR MIT`, which `hasHeader` does
 * not accept. `--write` uses it, so that it never adds a second header to a file
 * that already has one.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function namesAnIdentifier(text) {
  return text
    .split("\n", HEADER_WINDOW_LINES)
    .some((line) => ANY_IDENTIFIER_LINE.test(line));
}

/**
 * The text with the header inserted after a shebang, if there is one. A file
 * that names a different licence is not rewritten here: the check reports it.
 *
 * @param {string} text
 * @returns {string}
 */
export function withHeader(text) {
  if (!text.startsWith("#!")) {
    return `${HEADER}${text}`;
  }
  const end = text.indexOf("\n") + 1;
  return `${text.slice(0, end)}${HEADER}${text.slice(end)}`;
}

/** Every tracked source file, relative to the repository root. */
function sourceFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((path) => SOURCE_FILE.test(path));
}

/**
 * Lists the files without the right header. With `write`, adds the header to
 * those that have no identifier at all.
 *
 * @param {string[]} args
 * @param {object} [io]
 * @param {() => string[]} [io.files] Lists the tracked source files.
 * @param {(path: string) => string} [io.read] Reads one source file.
 * @param {(path: string, text: string) => void} [io.write] Writes one source file.
 * @param {(line: string) => void} [io.log] Receives a successful result.
 * @param {(line: string) => void} [io.error] Receives the files that failed.
 * @returns {number} The exit code.
 */
export function main(
  args,
  {
    files = sourceFiles,
    read = (path) => readFileSync(path, "utf8"),
    write: writeFile = writeFileSync,
    log = console.log,
    error = console.error,
  } = {},
) {
  const write = args.includes("--write");
  const missing = files().filter((path) => !hasHeader(read(path)));

  if (write) {
    const unlicensed = missing.filter((path) => !namesAnIdentifier(read(path)));
    for (const path of unlicensed) {
      writeFile(path, withHeader(read(path)));
    }
    log(`licence headers: added to ${unlicensed.length} files`);
    const wrong = missing.length - unlicensed.length;
    if (wrong > 0) {
      error(
        `licence headers: ${wrong} files name a different licence and were not changed`,
      );
      return 1;
    }
    return 0;
  }
  if (missing.length > 0) {
    error(
      `licence headers: ${missing.length} files have no AGPL-3.0-only header. Run "npm run licence:write" to add a missing one.\n${missing.join("\n")}`,
    );
    return 1;
  }
  log("licence headers: every source file has the right one");
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
