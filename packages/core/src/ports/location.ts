// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LatLng } from "./geometry";

/** A position fix. */
export interface LocationFix {
  /** Where the device is. */
  readonly position: LatLng;
  /** The radius, in metres, within which the position is expected to lie. */
  readonly accuracyMetres: number;
  /** Milliseconds since the Unix epoch, as reported by the source. */
  readonly timestamp: number;
}

/** Options for a single location request. */
export interface LocateOptions {
  /** Cancels the request. It then rejects with a `PortAbortError`. */
  readonly signal?: AbortSignal;
  /** How long to wait for a fix, in milliseconds, before rejecting. */
  readonly timeoutMs?: number;
}

/** Callbacks for a continuous watch. */
export interface LocationWatchHandlers {
  /** Called with each new fix. */
  onFix(fix: LocationFix): void;
  /** Called when the watch fails. */
  onError(error: Error): void;
}

/**
 * Finds the user's location. Nothing happens, and no permission prompt appears,
 * until `locate` or `watch` is called from a user action. Implementations throw
 * `LocationError` or `PortAbortError`.
 */
export interface LocationProvider {
  /** Whether `watch` is available. */
  readonly supportsWatch: boolean;
  /** Finds the position once. Call it only from a user action, because the browser may ask for permission. */
  locate(options?: LocateOptions): Promise<LocationFix>;
  /** Starts watching until the signal fires. Present only when `supportsWatch`. */
  watch?(
    handlers: LocationWatchHandlers,
    options: { readonly signal: AbortSignal },
  ): void;
}
