// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { FixError, type FixStats, fixBytes } from "../engine/fix.js";
import type { Rule, RuleContext } from "../engine/types.js";
import { fileChunks } from "./files.js";

/** How much fixed text is gathered before it is written, so a large file is not written in tiny pieces. */
const WRITE_BATCH_CHARACTERS = 1024 * 1024;

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

/** What `fixFile` did. */
export interface FixOutcome {
  /** The fixed copy, or undefined when none was written. */
  readonly written: string | undefined;
  readonly stats: FixStats;
  /** Why nothing was written, when that is so. */
  readonly problem: string | undefined;
}

/**
 * Writes a fixed copy of `file` and leaves the original alone. The copy is
 * written to a temporary name and moved into place only when the whole input
 * was read, so a truncated or invalid input leaves no half-written file.
 */
export async function fixFile(
  file: string,
  context: RuleContext,
  rules: readonly Rule[],
): Promise<FixOutcome> {
  const target = fixedPathFor(file);
  const temporary = `${target}.tmp`;
  const stats: FixStats = { features: 0, changed: 0 };
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
    await handle.close();
    await rename(temporary, target);
    return { written: target, stats, problem: undefined };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    if (error instanceof FixError) {
      return { written: undefined, stats, problem: error.message };
    }
    throw error;
  }
}
