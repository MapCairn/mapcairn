// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ClipboardPort, ClipboardResult } from "../ports/clipboard";

/** The reasons a copy can fail. */
export type ClipboardFailureReason = Extract<
  ClipboardResult,
  { ok: false }
>["reason"];

/**
 * A recording {@link ClipboardPort}.
 *
 * How to script it: it succeeds by default. `failWith(reason)` makes every
 * later copy resolve to `{ ok: false, reason }` and `succeed()` restores
 * success. `written` holds the text of copies that succeeded and `attempts`
 * the text of every call. It never rejects.
 */
export class FakeClipboard implements ClipboardPort {
  /** The text of every copy that succeeded, in order. */
  readonly written: string[] = [];
  /** The text of every call, whether it succeeded or not, in order. */
  readonly attempts: string[] = [];

  #failure: ClipboardFailureReason | null = null;

  /** Makes every later copy fail for this reason. */
  failWith(reason: ClipboardFailureReason): void {
    this.#failure = reason;
  }

  /** Makes every later copy succeed. */
  succeed(): void {
    this.#failure = null;
  }

  /** Records the text in `attempts`, and in `written` too unless a failure is scripted. It resolves to a result and never rejects. */
  writeText(text: string): Promise<ClipboardResult> {
    this.attempts.push(text);
    if (this.#failure !== null) {
      return Promise.resolve({ ok: false, reason: this.#failure });
    }
    this.written.push(text);
    return Promise.resolve({ ok: true });
  }
}
