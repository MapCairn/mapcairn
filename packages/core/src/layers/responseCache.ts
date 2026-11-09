import { LayerError } from "../ports/errors";

/** What a request returns to the cache: a value and how long it stays fresh. */
export interface CachedResponse<T> {
  readonly value: T;
  /** Seconds the value may be reused. 0 keeps nothing. */
  readonly maxAgeSeconds: number;
}

/** Options for {@link SharedResponseCache}. */
export interface SharedResponseCacheOptions {
  /** The clock, as epoch milliseconds. Core never reads the clock itself. */
  readonly now: () => number;
  /** How many fresh responses to keep. Defaults to 16; the oldest goes first. */
  readonly maxEntries?: number;
}

interface Stored<T> {
  readonly value: T;
  readonly expires: number;
}

interface InFlight<T> {
  readonly promise: Promise<T>;
  readonly controller: AbortController;
  waiters: number;
}

/**
 * Reads the `max-age` of a `Cache-Control` header in seconds. `no-store`,
 * `no-cache`, a missing header and anything unreadable give 0.
 */
export function maxAgeFromCacheControl(header: string | null): number {
  if (!header) {
    return 0;
  }
  const lower = header.toLowerCase();
  if (lower.includes("no-store") || lower.includes("no-cache")) {
    return 0;
  }
  const match = /(?:^|[,\s])max-age=(\d+)/.exec(lower);
  return match ? Number(match[1]) : 0;
}

function aborted(): LayerError {
  return new LayerError("aborted");
}

/**
 * Keeps responses by key (normally the URL) for their `max-age`, and shares
 * a request already in flight, so several layers over one feed (alerts split
 * by type) cost one request.
 *
 * @remarks Each caller may pass its own signal. A caller that gives up is
 *   rejected with `LayerError` `aborted` at once, but the request carries on
 *   for the others; only when every caller has given up is it cancelled.
 *   Failures are passed to every waiting caller and never kept.
 */
export class SharedResponseCache<T> {
  readonly #now: () => number;
  readonly #maxEntries: number;
  readonly #stored = new Map<string, Stored<T>>();
  readonly #inFlight = new Map<string, InFlight<T>>();

  constructor(options: SharedResponseCacheOptions) {
    this.#now = options.now;
    this.#maxEntries = options.maxEntries ?? 16;
  }

  /**
   * Returns the fresh value for `key`, joins a request in flight, or calls
   * `start` with a signal the cache controls.
   */
  load(
    key: string,
    start: (signal: AbortSignal) => Promise<CachedResponse<T>>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(aborted());
    }
    const stored = this.#stored.get(key);
    if (stored && stored.expires > this.#now()) {
      return Promise.resolve(stored.value);
    }
    this.#stored.delete(key);
    const flight = this.#inFlight.get(key) ?? this.#start(key, start);
    flight.waiters += 1;
    if (!signal) {
      return flight.promise;
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        flight.waiters -= 1;
        if (flight.waiters === 0 && this.#inFlight.get(key) === flight) {
          this.#inFlight.delete(key);
          flight.controller.abort();
        }
        reject(aborted());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      flight.promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  #start(
    key: string,
    start: (signal: AbortSignal) => Promise<CachedResponse<T>>,
  ): InFlight<T> {
    const controller = new AbortController();
    const promise = start(controller.signal).then(
      (response) => {
        this.#finish(key, flight);
        if (response.maxAgeSeconds > 0) {
          this.#keep(key, response);
        }
        return response.value;
      },
      (error: unknown) => {
        this.#finish(key, flight);
        throw error;
      },
    );
    // Callers that all gave up never read the result; keep its rejection quiet.
    promise.catch(() => {});
    const flight: InFlight<T> = { promise, controller, waiters: 0 };
    this.#inFlight.set(key, flight);
    return flight;
  }

  #finish(key: string, flight: InFlight<T>): void {
    if (this.#inFlight.get(key) === flight) {
      this.#inFlight.delete(key);
    }
  }

  #keep(key: string, response: CachedResponse<T>): void {
    this.#stored.set(key, {
      value: response.value,
      expires: this.#now() + response.maxAgeSeconds * 1000,
    });
    while (this.#stored.size > this.#maxEntries) {
      const oldest = this.#stored.keys().next().value as string;
      this.#stored.delete(oldest);
    }
  }
}
