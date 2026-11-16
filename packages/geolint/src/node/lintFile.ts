// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { activeRules, buildContext, lintBytes } from "../engine/lint.js";
import { loadCountries } from "../engine/regions/index.js";
import type { FileReport } from "../engine/report.js";
import { rules as allRules } from "../engine/rules/index.js";
import { fileChunks } from "./files.js";
import { fixedPathFor, fixFile } from "./fixFile.js";

/** One file to lint, as plain data so it can cross to a worker thread. */
export interface FileTask {
  /** The name shown in reports, as the user gave it. */
  readonly file: string;
  /** Where to read it: `file` resolved against the working directory. */
  readonly path: string;
  readonly regions: readonly string[];
  readonly ignore: readonly string[];
  /** Write `<name>.fixed.geojson` and lint that copy instead of the original. */
  readonly fix: boolean;
}

/** Whether an error came from the file system (a missing file, a directory, no permission). */
function isFileSystemError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return (
    error instanceof Error && typeof code === "string" && code.startsWith("E")
  );
}

function unreadable(file: string, error: unknown): FileReport {
  return {
    file,
    report: {
      findings: [],
      featureCount: 0,
      inputError: {
        message: error instanceof Error ? error.message : String(error),
        offset: 0,
      },
    },
  };
}

/**
 * Lints one file from disk. With `fix`, it first writes a fixed copy next to
 * the file (never changing the file) and lints the copy, so what is reported is
 * what is left to repair by hand. A file that cannot be opened or read becomes
 * a report with an input error, not an exception, so one bad file does not stop
 * a run over many. Anything else (an unknown rule or region) is thrown.
 */
export async function lintFile(task: FileTask): Promise<FileReport> {
  try {
    const active = activeRules(allRules, task.ignore);
    let target = task.path;
    let shown = task.file;
    const notes: string[] = [];
    if (task.fix) {
      const context = await buildContext({});
      const outcome = await fixFile(task.path, context, active);
      if (outcome.written === undefined) {
        notes.push(`${task.file}: nothing written: ${outcome.problem}`);
      } else {
        target = outcome.written;
        shown = fixedPathFor(task.file);
        notes.push(
          `${task.file}: wrote ${shown} (${outcome.stats.changed} of ${outcome.stats.features} features changed)`,
        );
      }
    }
    const report = await lintBytes(fileChunks(target), {
      regions: task.regions,
      ignore: task.ignore,
      countries: loadCountries,
    });
    return { file: shown, report, notes };
  } catch (error) {
    if (isFileSystemError(error)) {
      return unreadable(task.file, error);
    }
    throw error;
  }
}
