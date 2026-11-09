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
  readonly written: string[] = [];
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

  writeText(text: string): Promise<ClipboardResult> {
    this.attempts.push(text);
    if (this.#failure !== null) {
      return Promise.resolve({ ok: false, reason: this.#failure });
    }
    this.written.push(text);
    return Promise.resolve({ ok: true });
  }
}
