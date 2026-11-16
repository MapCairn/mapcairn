// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { createReadStream } from "node:fs";
import { glob, stat } from "node:fs/promises";
import path from "node:path";

/** The name that stands for standard input in the list of inputs. */
export const STDIN = "-";

/** Characters that make an argument a glob pattern rather than a path. */
const GLOB_CHARACTERS = /[*?[\]{}]/;

/** How much of a file to read at a time. */
const CHUNK_BYTES = 1024 * 1024;

/** Thrown when an input argument matches nothing. */
export class NoMatchError extends Error {
  constructor(pattern: string) {
    super(`No file matches ${pattern}.`);
    this.name = "NoMatchError";
  }
}

/** Whether something exists at the path, resolved against `cwd`. */
async function exists(file: string, cwd: string): Promise<boolean> {
  try {
    await stat(path.resolve(cwd, file));
    return true;
  } catch {
    return false;
  }
}

/**
 * Expands the input arguments to the files to lint, in argument order. An
 * argument that names something that exists is a path, even when its name has
 * glob characters in it (`data[1].geojson`); only an argument that does not is
 * read as a glob. A glob contributes its matches sorted by name, so the order
 * never depends on the file system. A plain path is kept as it is, and a missing
 * file is reported when it is read. `-` stays `-`. A file named twice is read
 * once.
 */
export async function expandInputs(
  patterns: readonly string[],
  cwd: string,
): Promise<string[]> {
  const seen = new Set<string>();
  const files: string[] = [];
  const add = (file: string): void => {
    if (!seen.has(file)) {
      seen.add(file);
      files.push(file);
    }
  };
  for (const pattern of patterns) {
    if (
      pattern === STDIN ||
      !GLOB_CHARACTERS.test(pattern) ||
      (await exists(pattern, cwd))
    ) {
      add(pattern);
      continue;
    }
    const matches: string[] = [];
    for await (const match of glob(pattern, { cwd })) {
      matches.push(match);
    }
    if (matches.length === 0) {
      throw new NoMatchError(pattern);
    }
    matches.sort().forEach(add);
  }
  return files;
}

/** The bytes of a file, as a stream of chunks. */
export function fileChunks(file: string): AsyncIterable<Uint8Array> {
  return createReadStream(file, { highWaterMark: CHUNK_BYTES });
}
