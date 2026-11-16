// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { mkdtemp, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { FixError, type FixStats, fixBytes } from "../engine/fix.js";
import { LintUsageError } from "../engine/lint.js";
import type { Rule, RuleContext } from "../engine/types.js";
import { fileChunks } from "./files.js";

/** How much fixed text is gathered before it is written, so a large file is not written in tiny pieces. */
const WRITE_BATCH_CHARACTERS = 1024 * 1024;

/** Why no copy is written for a file in which no feature changed. */
const NOTHING_TO_REPAIR = "no feature needed a repair";

/** The extension every fixed copy gets. */
const FIXED_SUFFIX = ".fixed.geojson";

/**
 * Where the fixed copy of `file` goes: next to it, with `.fixed.geojson` in
 * place of its extension (`data.geojson` and `data.json` both give
 * `data.fixed.geojson`). It is never the same path as the input.
 */
export function fixedPathFor(file: string): string {
  const { dir, name } = path.parse(file);
  return path.join(dir, `${name}${FIXED_SUFFIX}`);
}

/** What `planFixInputs` decided. */
export interface FixPlan {
  /** The files to write fixed copies of, in the order they were given. */
  readonly inputs: readonly string[];
  /** The files left out because they are fixed copies already. */
  readonly skipped: readonly string[];
}

/**
 * Chooses the files `--fix` writes copies of. A file that is a fixed copy
 * already (its name ends `.fixed.geojson`) is left out, so running a glob twice
 * does not write `.fixed.fixed.geojson`. Two files that would write the same copy
 * (`x.geojson` and `x.json` both give `x.fixed.geojson`) are refused, because
 * the second would overwrite the first; the error names both.
 */
export function planFixInputs(files: readonly string[], cwd: string): FixPlan {
  const inputs: string[] = [];
  const skipped: string[] = [];
  const writers = new Map<string, string>();
  for (const file of files) {
    if (file.endsWith(FIXED_SUFFIX)) {
      skipped.push(file);
      continue;
    }
    const copy = path.resolve(cwd, fixedPathFor(file));
    const other = writers.get(copy);
    if (other !== undefined) {
      throw new LintUsageError(
        `--fix would write ${fixedPathFor(file)} for both ${other} and ${file}. Fix them in separate runs.`,
      );
    }
    writers.set(copy, file);
    inputs.push(file);
  }
  return { inputs, skipped };
}

/** The start of the name of the directory a copy is written in before it is moved into place. */
const WORK_DIRECTORY_PREFIX = ".geolint-fix-";

/** What `fixFile` did. */
export interface FixOutcome {
  /** The fixed copy, or undefined when none was written. */
  readonly written: string | undefined;
  readonly stats: FixStats;
  /** Why nothing was written, when that is so. */
  readonly problem: string | undefined;
}

/** Streams the fixed text of `file` into a new file at `temporary`, in large writes. */
async function writeFixedText(
  temporary: string,
  file: string,
  context: RuleContext,
  rules: readonly Rule[],
  stats: FixStats,
): Promise<void> {
  const handle = await open(temporary, "w");
  try {
    let batch = "";
    for await (const text of fixBytes(
      fileChunks(file),
      context,
      rules,
      stats,
    )) {
      batch += text;
      if (batch.length >= WRITE_BATCH_CHARACTERS) {
        await handle.write(batch);
        batch = "";
      }
    }
    await handle.write(`${batch}\n`);
  } finally {
    await handle.close();
  }
}

/**
 * Writes a fixed copy of `file` and leaves the original alone. The copy is
 * written inside a new directory that only this call uses, beside the target,
 * and moved into place only when the whole input was read, so a truncated or
 * invalid input leaves no half-written file and two runs cannot share a
 * temporary file.
 */
export async function fixFile(
  file: string,
  context: RuleContext,
  rules: readonly Rule[],
): Promise<FixOutcome> {
  const target = fixedPathFor(file);
  const workDirectory = await mkdtemp(
    path.join(path.dirname(target), WORK_DIRECTORY_PREFIX),
  );
  const stats: FixStats = { features: 0, changed: 0 };
  try {
    const temporary = path.join(workDirectory, "copy");
    await writeFixedText(temporary, file, context, rules, stats);
    if (stats.changed === 0) {
      return { written: undefined, stats, problem: NOTHING_TO_REPAIR };
    }
    await rename(temporary, target);
    return { written: target, stats, problem: undefined };
  } catch (error) {
    if (error instanceof FixError) {
      return { written: undefined, stats, problem: error.message };
    }
    throw error;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
