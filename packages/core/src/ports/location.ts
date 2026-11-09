import type { LatLng } from "./geometry";

/** A position fix. */
export interface LocationFix {
  readonly position: LatLng;
  readonly accuracyMetres: number;
  /** Milliseconds since the Unix epoch, as reported by the source. */
  readonly timestamp: number;
}

/** Options for a single location request. */
export interface LocateOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Callbacks for a continuous watch. */
export interface LocationWatchHandlers {
  onFix(fix: LocationFix): void;
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
  locate(options?: LocateOptions): Promise<LocationFix>;
  /** Starts watching until the signal fires. Present only when `supportsWatch`. */
  watch?(
    handlers: LocationWatchHandlers,
    options: { readonly signal: AbortSignal },
  ): void;
}
