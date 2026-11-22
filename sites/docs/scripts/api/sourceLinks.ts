// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Where an export is declared in a package's source. */
export interface SourceLocation {
  /** The file, relative to the repository root, with forward slashes. */
  readonly file: string;
  /** The line the declaration starts on, counted from 1. */
  readonly line: number;
  /** The text of the comment above it, up to the first tag; empty when it has none. */
  readonly comment: string;
}

/** A declaration that starts a line: `export function name`, `export const name` and so on. */
const DECLARATION =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

/** A namespace re-export, `export * as name from "./file"`. */
const NAMESPACE_EXPORT = /^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\b/;

/** A file that is not part of what a package ships: a test or a declaration file. */
const NOT_SHIPPED = /\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/;

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

function sourceFilesIn(folder: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFilesIn(path));
    } else if (SOURCE_FILE.test(entry.name) && !NOT_SHIPPED.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

/**
 * The text of the comment that ends on the line before `index`, up to its
 * first tag, or an empty string when the line before is not the end of one.
 */
function commentAbove(lines: readonly string[], index: number): string {
  const end = index - 1;
  if (!lines[end]?.trim().endsWith("*/")) {
    return "";
  }
  let start = end;
  while (start > 0 && !lines[start]?.trim().startsWith("/**")) {
    start -= 1;
  }
  const body: string[] = [];
  for (const line of lines.slice(start, end + 1)) {
    const text = line
      .trim()
      .replace(/^\/\*\*\s?/, "")
      .replace(/\*\/$/, "")
      .replace(/^\*\s?/, "");
    if (text.trimStart().startsWith("@")) {
      break;
    }
    body.push(text);
  }
  return body.join("\n").trim();
}

/**
 * Finds where each exported name of a package is declared, by reading its
 * source. The API model describes the rolled-up declarations, which have no
 * place in the repository, so a link to the source needs this index. A name
 * declared twice (an overload, or a type and a value) keeps its first place.
 * @param repositoryRoot - The repository's folder.
 * @param sourceFolder - The package's `src` folder.
 */
export function indexSource(
  repositoryRoot: string,
  sourceFolder: string,
): Map<string, SourceLocation> {
  const found = new Map<string, SourceLocation>();
  for (const path of sourceFilesIn(sourceFolder)) {
    const lines = readFileSync(path, "utf8").split("\n");
    const file = relative(repositoryRoot, path).split(sep).join("/");
    lines.forEach((text, index) => {
      const name = (DECLARATION.exec(text) ?? NAMESPACE_EXPORT.exec(text))?.[1];
      if (name !== undefined && !found.has(name)) {
        found.set(name, {
          file,
          line: index + 1,
          comment: commentAbove(lines, index),
        });
      }
    });
  }
  return found;
}
