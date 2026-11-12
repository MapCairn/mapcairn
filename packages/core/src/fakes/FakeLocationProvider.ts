// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LocationError, type LocationErrorKind } from "../ports/errors";
import type {
  LocateOptions,
  LocationFix,
  LocationProvider,
  LocationWatchHandlers,
} from "../ports/location";
import {
  abortable,
  createDeferred,
  type Deferred,
  type HeldCall,
} from "./internal";

/** The fix a {@link FakeLocationProvider} returns until scripted otherwise. */
export const DEFAULT_FAKE_FIX: LocationFix = {
  position: { lat: -33.9249, lng: 18.4241 },
  accuracyMetres: 25,
  timestamp: 1_700_000_000_000,
};

/** Options for {@link FakeLocationProvider}. */
export interface FakeLocationProviderOptions {
  /** Whether `watch` exists. Defaults to true. */
  readonly supportsWatch?: boolean;
  /** The fix `locate` resolves with. Defaults to {@link DEFAULT_FAKE_FIX}. */
  readonly fix?: LocationFix;
}

/**
 * A scripted {@link LocationProvider} with no geolocation and no timers.
 *
 * How to script it:
 * - `setFix(fix)` changes what `locate` resolves with.
 * - `failWith(kind)` makes `locate` reject with a `LocationError` until
 *   `clearFailure()`.
 * - `holdNext()` keeps the next `locate` pending until the handle settles it.
 * - With `supportsWatch`, `watch` registers handlers, and `emitFix` and
 *   `emitError` push to every active watcher. A watcher stops when its signal
 *   aborts. Without `supportsWatch`, `watch` is `undefined`.
 * - Every `locate` honours its signal by rejecting with `PortAbortError`.
 * - `locateCalls` records the options and `watcherCount` the live watchers.
 */
export class FakeLocationProvider implements LocationProvider {
  readonly supportsWatch: boolean;
  readonly watch?: LocationProvider["watch"];
  readonly locateCalls: (LocateOptions | undefined)[] = [];

  #fix: LocationFix;
  #failure: LocationErrorKind | null = null;
  #holds: Deferred<LocationFix>[] = [];
  #watchers = new Set<LocationWatchHandlers>();

  constructor(options: FakeLocationProviderOptions = {}) {
    this.supportsWatch = options.supportsWatch ?? true;
    this.#fix = options.fix ?? DEFAULT_FAKE_FIX;
    if (this.supportsWatch) {
      this.watch = (handlers, { signal }) => {
        this.#watch(handlers, signal);
      };
    }
  }

  /** The number of watchers that have not been aborted. */
  get watcherCount(): number {
    return this.#watchers.size;
  }

  /** Changes the fix `locate` resolves with. */
  setFix(fix: LocationFix): void {
    this.#fix = fix;
  }

  /** Makes every later `locate` reject with a `LocationError` of this kind. */
  failWith(kind: LocationErrorKind): void {
    this.#failure = kind;
  }

  /** Stops {@link FakeLocationProvider.failWith} failing calls. */
  clearFailure(): void {
    this.#failure = null;
  }

  /** Holds the next `locate` until the handle settles it. */
  holdNext(): HeldCall<LocationFix> {
    const deferred = createDeferred<LocationFix>();
    this.#holds.push(deferred);
    return deferred;
  }

  /** Delivers a fix to every active watcher. */
  emitFix(fix: LocationFix): void {
    for (const handlers of [...this.#watchers]) {
      handlers.onFix(fix);
    }
  }

  /** Delivers an error to every active watcher. */
  emitError(error: Error): void {
    for (const handlers of [...this.#watchers]) {
      handlers.onError(error);
    }
  }

  locate(options?: LocateOptions): Promise<LocationFix> {
    this.locateCalls.push(options);
    return abortable(() => {
      const hold = this.#holds.shift();
      if (hold !== undefined) {
        return hold.promise;
      }
      if (this.#failure !== null) {
        return Promise.reject(new LocationError(this.#failure));
      }
      return Promise.resolve(this.#fix);
    }, options?.signal);
  }

  #watch(handlers: LocationWatchHandlers, signal: AbortSignal): void {
    if (signal.aborted) {
      return;
    }
    this.#watchers.add(handlers);
    signal.addEventListener(
      "abort",
      () => {
        this.#watchers.delete(handlers);
      },
      { once: true },
    );
  }
}
