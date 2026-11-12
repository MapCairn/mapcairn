// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { PortAbortError } from "@mapcairn/core";

interface Waiter {
  readonly resolve: () => void;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: () => void;
}

/**
 * Lets requests start one at a time, in the order they asked, at least a fixed
 * interval apart. Used to keep to a service's usage policy, such as
 * Nominatim's limit of one request per second.
 *
 * @remarks A waiter whose signal fires leaves the queue at once with a
 *   {@link PortAbortError} and gives up its turn, so it never holds back the
 *   requests behind it. The interval is measured between starts, not from the
 *   end of one request to the start of the next. Uses `setTimeout`, so tests
 *   can drive it with fake timers.
 */
export class RequestSpacer {
  readonly #intervalMs: number;
  readonly #queue: Waiter[] = [];
  #nextStart = Number.NEGATIVE_INFINITY;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** @param intervalMs The least time between two starts, in milliseconds. */
  constructor(intervalMs: number) {
    this.#intervalMs = intervalMs;
  }

  /**
   * Resolves when the caller may start its request.
   * @throws {PortAbortError} When `signal` has fired or fires while waiting.
   */
  wait(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new PortAbortError());
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        signal,
        onAbort: () => {
          const index = this.#queue.indexOf(waiter);
          if (index >= 0) {
            this.#queue.splice(index, 1);
          }
          reject(new PortAbortError());
        },
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.#queue.push(waiter);
      this.#schedule();
    });
  }

  #schedule(): void {
    if (this.#timer !== null || this.#queue.length === 0) {
      return;
    }
    const delay = this.#nextStart - Date.now();
    if (delay <= 0) {
      this.#release();
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#release();
    }, delay);
  }

  #release(): void {
    const waiter = this.#queue.shift();
    if (!waiter) {
      return;
    }
    waiter.signal?.removeEventListener("abort", waiter.onAbort);
    this.#nextStart = Date.now() + this.#intervalMs;
    waiter.resolve();
    this.#schedule();
  }
}
