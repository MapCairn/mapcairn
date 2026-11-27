// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * API Extractor's roll-up drops a `declare global` or `declare module` block,
 * which is how a package teaches TypeScript about something it adds to a
 * global or to another package. The build therefore takes such a block from
 * the declarations `tsc` emitted for its source file and appends it to the
 * rolled-up file of an entry (`mapcairn.declarationBlocks` in the manifest).
 */

/** A line that carries the licence header, which the block does not repeat. */
const HEADER_LINE = /^\/\/ (?:SPDX-License-Identifier:|Copyright) .*\n/gm;

/** The documentation comment of the file, which the rolled-up file has already. */
const LEADING_COMMENT = /^\s*\/\*\*[\s\S]*?\*\/\s*/;

/** An empty module marker. */
const EMPTY_EXPORT = /^export \{ ?\};?\n?/gm;

/** An import of a file of the package, which may run over several lines. */
const LOCAL_IMPORT =
  /^import\s+(?:type\s+)?[^;]*?\sfrom\s+"\.{1,2}\/[^"]*";\n?/gm;

/** The same import, with the specifier captured. */
const LOCAL_IMPORT_PARTS =
  /^(import\s+(?:type\s+)?[^;]*?\sfrom\s+)"\.{1,2}\/[^"]*";/gm;

/**
 * The block as it goes into a rolled-up file.
 *
 * @param {string} emitted The declarations `tsc` emitted for the block's source file.
 * @param {object} options
 * @param {boolean} options.inEntry Whether the block goes into the rolled-up file of the entry its source imports from. The names it uses are then declared in that file, so its imports of the package's own files are dropped. Otherwise they are pointed at `entryFile`.
 * @param {string} options.entryFile The built declaration file the names come from, such as `./browser.js`.
 * @returns {string} The block, with no licence header, leading comment, empty export and no import it cannot keep.
 */
export function declarationBlock(emitted, { inEntry, entryFile }) {
  const cleaned = emitted
    .replace(HEADER_LINE, "")
    .replace(LEADING_COMMENT, "")
    .replace(EMPTY_EXPORT, "");
  const text = inEntry
    ? cleaned.replace(LOCAL_IMPORT, "")
    : cleaned.replace(LOCAL_IMPORT_PARTS, `$1"${entryFile}";`);
  return text.trim();
}

/**
 * A rolled-up declaration file with a block added after it.
 *
 * @param {string} rolled
 * @param {string} block
 * @returns {string}
 */
export function withDeclarationBlock(rolled, block) {
  return `${rolled.trimEnd()}\n\n${block}\n`;
}
