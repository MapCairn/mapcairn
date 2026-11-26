// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The marker on a fence's info string that sends its code to the compiler. */
export const CHECK_MARK = "check";

/** The marker for a block that is deliberately not compiled, such as an outline. */
export const NO_CHECK_MARK = "no-check";

const WHOLE_MARK = "whole";
const LICENCE_HEADER =
  "// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright MapCairn contributors\n";

/** The TypeScript compiler's entry file, from the repository's own install. */
const TSC = "node_modules/typescript/bin/tsc";

const FENCE_OPEN = /^(`{3,}|~{3,})\s*([^\s`]*)\s*(.*)$/;
const CODE_LANGUAGES = new Set(["ts", "tsx"]);
const COMPILER_ERROR =
  /^(?:.*[\\/])?snippet-(?<index>\d+)\.tsx?\((?<line>\d+),\d+\): (?<message>.*)$/;

/** One `ts` or `tsx` block in a page. */
export interface Snippet {
  /** The page's path from the docs folder. */
  readonly page: string;
  /** The line of the opening fence, from 1. */
  readonly fenceLine: number;
  /** The line of the first line of code, from 1. */
  readonly line: number;
  /** `ts` and `tsx` for code, or the language of a block that quotes a source file. */
  readonly language: string;
  /** The word on the fence that says whether to compile the block, or null. */
  readonly mark: typeof CHECK_MARK | typeof NO_CHECK_MARK | null;
  /**
   * The repository path from a `source="..."` word on the fence, or null: the
   * block quotes that file, and `sourceFindings` checks it does.
   */
  readonly source: string | null;
  /** Whether the block must quote the whole source file. */
  readonly whole: boolean;
  readonly code: string;
}

function markOf(info: string): Snippet["mark"] {
  const words = info.split(/\s+/);
  if (words.includes(CHECK_MARK)) {
    return CHECK_MARK;
  }
  return words.includes(NO_CHECK_MARK) ? NO_CHECK_MARK : null;
}

const SOURCE_WORD = /\bsource="([^"]+)"/;

function sourceOf(info: string): string | null {
  return SOURCE_WORD.exec(info)?.[1] ?? null;
}

/**
 * Finds every `ts` and `tsx` fenced block in a page, with the line numbers a
 * compiler error is reported against. A fence's info string may carry
 * `check` (compile it against the built packages) or `no-check` (an outline,
 * left out on purpose).
 * @param page - The page's path from the docs folder, used in reports.
 * @param markdown - The page's source, front matter included.
 */
export function extractSnippets(page: string, markdown: string): Snippet[] {
  const snippets: Snippet[] = [];
  const lines = markdown.split("\n");
  let index = 0;
  while (index < lines.length) {
    const open = FENCE_OPEN.exec(lines[index] ?? "");
    if (!open) {
      index += 1;
      continue;
    }
    const [, fence = "", language = "", info = ""] = open;
    const start = index;
    index += 1;
    while (index < lines.length && !(lines[index] ?? "").startsWith(fence)) {
      index += 1;
    }
    const source = sourceOf(info);
    if (CODE_LANGUAGES.has(language) || source !== null) {
      snippets.push({
        page,
        fenceLine: start + 1,
        line: start + 2,
        language,
        mark: markOf(info),
        source,
        whole: info.split(/\s+/).includes(WHOLE_MARK),
        code: lines.slice(start + 1, index).join("\n"),
      });
    }
    index += 1;
  }
  return snippets;
}

/** What is wrong with the markers: a `ts` or `tsx` block that says neither `check` nor `no-check`. */
export function unmarkedFindings(snippets: readonly Snippet[]): string[] {
  return snippets
    .filter(
      ({ mark, language }) => mark === null && CODE_LANGUAGES.has(language),
    )
    .map(
      ({ page, fenceLine, language }) =>
        `${page}:${fenceLine} has a ${language} block marked neither "${CHECK_MARK}" nor "${NO_CHECK_MARK}".`,
    );
}

/** Whether `needle` is a run of consecutive lines of `haystack`. */
function containsLines(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.every((line) => line.trim() === "")) {
    return false;
  }
  return haystack.some((_, start) =>
    needle.every((line, offset) => haystack[start + offset] === line),
  );
}

/** Whether the source is the block's text, with the file's final newline optional. */
function matchesWholeText(source: string, code: string): boolean {
  return source === code || source === `${code}\n`;
}

/** Whether a block is the whole file, apart from an optional licence header. */
function matchesWholeFile(source: string, code: string): boolean {
  if (code.trim() === "") {
    return false;
  }
  if (matchesWholeText(source, code)) {
    return true;
  }
  return (
    source.startsWith(LICENCE_HEADER) &&
    matchesWholeText(source.slice(LICENCE_HEADER.length), code)
  );
}

/**
 * What is wrong with the blocks that quote a source file (a `source="path"`
 * word on the fence): the file is missing, or the block is empty or is not a
 * run of whole lines of the file, so the page shows code the file no longer
 * holds. A `whole` word instead requires the complete file, with only its
 * two-line licence header optional. The file is the one the consumer check
 * builds, so a block that matches it shows code that is built and type-checked
 * from the packed packages.
 * @param repo - Absolute path of the repository root.
 * @param snippets - Blocks from `extractSnippets`; those without a source are skipped.
 */
export function sourceFindings(
  repo: string,
  snippets: readonly Snippet[],
): string[] {
  return snippets.flatMap(({ page, fenceLine, source, whole, code }) => {
    if (source === null) {
      return [];
    }
    const where = `${page}:${fenceLine}`;
    const file = join(repo, source);
    if (!existsSync(file)) {
      return [`${where} quotes ${source}, which does not exist.`];
    }
    const text = readFileSync(file, "utf8");
    if (whole) {
      return matchesWholeFile(text, code)
        ? []
        : [`${where} does not match the whole of ${source}.`];
    }
    return containsLines(text.split("\n"), code.split("\n"))
      ? []
      : [`${where} is not a run of whole lines of ${source}.`];
  });
}

/** Maps the compiler's output back to the page and line each error came from. */
function findingsFrom(output: string, checked: readonly Snippet[]): string[] {
  const findings: string[] = [];
  for (const text of output.split("\n")) {
    const error = COMPILER_ERROR.exec(text);
    if (error?.groups) {
      const snippet = checked[Number(error.groups.index)];
      const line = Number(error.groups.line);
      findings.push(
        `${snippet?.page ?? "?"}:${(snippet?.line ?? 1) + line - 1} ${error.groups.message}`,
      );
    } else if (text.trim() !== "" && findings.length > 0) {
      findings.push(text);
    }
  }
  return findings;
}

/**
 * Compiles every block marked `check` as an app outside the repository would,
 * against the packages' built output, and returns one finding for each error
 * with its page and line (none when everything compiles). Each block is its
 * own module in a scratch folder whose `node_modules` is the repository's, so
 * `@mapcairn/sdk` resolves through its `exports` to `dist`. The folder has
 * no `vite/client` types of its own: a block that needs them brings the
 * `/// <reference types="vite/client" />` line, as a user's file does.
 * @param repo - Absolute path of the repository root.
 * @param snippets - Blocks from `extractSnippets`; unmarked ones are skipped.
 */
export function typeCheckSnippets(
  repo: string,
  snippets: readonly Snippet[],
): string[] {
  const checked = snippets.filter(({ mark }) => mark === CHECK_MARK);
  if (checked.length === 0) {
    return [];
  }
  const scratch = mkdtempSync(join(tmpdir(), "mapcairn-docs-snippets-"));
  try {
    symlinkSync(
      join(repo, "node_modules"),
      join(scratch, "node_modules"),
      "junction",
    );
    const files = checked.map(({ code, language }, number) => {
      const file = `snippet-${number}.${language}`;
      // A trailing export makes a block with no import its own module.
      writeFileSync(join(scratch, file), `${code}\nexport {};\n`);
      return file;
    });
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          jsx: "react-jsx",
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        files,
      }),
    );
    try {
      execFileSync(
        process.execPath,
        [join(repo, TSC), "-p", scratch, "--pretty", "false"],
        { encoding: "utf8", stdio: "pipe" },
      );
      return [];
    } catch (error) {
      const { stdout } = error as { readonly stdout: string };
      return findingsFrom(stdout, checked);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
