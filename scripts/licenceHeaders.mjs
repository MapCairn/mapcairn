// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Checks, or adds, the SPDX licence header at the top of every tracked source
 * file (`.ts`, `.tsx`, `.mjs`, `.cjs`).
 *
 *   node scripts/licenceHeaders.mjs           fails and lists files with no header
 *   node scripts/licenceHeaders.mjs --write   adds the header where it is missing
 *
 * A shebang stays on the first line, with the header after it. Adding is safe
 * to repeat: a file that already has the identifier is left alone.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const IDENTIFIER = "SPDX-License-Identifier: AGPL-3.0-only";
const HEADER = `// ${IDENTIFIER}\n// Copyright MapCairn contributors\n`;
const SOURCE_FILE = /\.(?:ts|tsx|mjs|cjs)$/;
/** How many leading lines are searched for an existing identifier. */
const HEADER_WINDOW_LINES = 5;

/** Every tracked source file, relative to the repository root. */
function sourceFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((path) => SOURCE_FILE.test(path));
}

/** Whether the first lines of the text name the licence. */
function hasHeader(text) {
  return text
    .split("\n", HEADER_WINDOW_LINES)
    .some((line) => line.includes(IDENTIFIER));
}

/** The text with the header inserted after a shebang, if there is one. */
function withHeader(text) {
  if (!text.startsWith("#!")) {
    return `${HEADER}${text}`;
  }
  const end = text.indexOf("\n") + 1;
  return `${text.slice(0, end)}${HEADER}${text.slice(end)}`;
}

const write = process.argv.includes("--write");
const missing = sourceFiles().filter(
  (path) => !hasHeader(readFileSync(path, "utf8")),
);

if (write) {
  for (const path of missing) {
    writeFileSync(path, withHeader(readFileSync(path, "utf8")));
  }
  console.log(`licence headers: added to ${missing.length} files`);
} else if (missing.length > 0) {
  console.error(
    `licence headers: ${missing.length} files have no header. Run "npm run licence:write".\n${missing.join("\n")}`,
  );
  process.exit(1);
} else {
  console.log("licence headers: every source file has one");
}
