// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FileSaveResult, FileSaver, SavedFile } from "../ports/files";

/** The reasons a save can fail. */
export type FileSaveFailureReason = Extract<
  FileSaveResult,
  { ok: false }
>["reason"];

/**
 * A recording {@link FileSaver}.
 *
 * How to script it: it succeeds by default. `failWith(reason)` makes every
 * later save resolve to `{ ok: false, reason }` and `succeed()` restores
 * success. `saved` holds the files that were saved and `attempts` every file
 * offered. It never rejects.
 */
export class FakeFileSaver implements FileSaver {
  readonly saved: SavedFile[] = [];
  readonly attempts: SavedFile[] = [];

  #failure: FileSaveFailureReason | null = null;

  /** Makes every later save fail for this reason. */
  failWith(reason: FileSaveFailureReason): void {
    this.#failure = reason;
  }

  /** Makes every later save succeed. */
  succeed(): void {
    this.#failure = null;
  }

  save(file: SavedFile): Promise<FileSaveResult> {
    this.attempts.push(file);
    if (this.#failure !== null) {
      return Promise.resolve({ ok: false, reason: this.#failure });
    }
    this.saved.push(file);
    return Promise.resolve({ ok: true });
  }
}
