/**
 * Thrown by an async port when the caller's `AbortSignal` fires before the
 * work finishes. Callers treat it as "ignore this result", never as a failure
 * to show the user.
 */
export class PortAbortError extends Error {
  constructor() {
    super("The operation was cancelled.");
    this.name = "PortAbortError";
  }
}

/** Why a place search failed. */
export type SearchErrorKind = "offline" | "rate-limited" | "failed";

/** The only error a search provider throws, apart from {@link PortAbortError}. */
export class SearchError extends Error {
  readonly kind: SearchErrorKind;

  constructor(kind: SearchErrorKind, message?: string) {
    super(message ?? `Search failed: ${kind}.`);
    this.name = "SearchError";
    this.kind = kind;
  }
}

/** Why finding the user's location failed. */
export type LocationErrorKind = "denied" | "unavailable" | "timeout";

/** The only error a location provider throws, apart from {@link PortAbortError}. */
export class LocationError extends Error {
  readonly kind: LocationErrorKind;

  constructor(kind: LocationErrorKind, message?: string) {
    super(message ?? `Location failed: ${kind}.`);
    this.name = "LocationError";
    this.kind = kind;
  }
}

/** Why a map engine could not start. */
export type MapEngineErrorReason = "webgl-unavailable" | "load-failed";

/** The only error a map adapter rejects with when its engine cannot start. */
export class MapEngineError extends Error {
  readonly reason: MapEngineErrorReason;

  constructor(reason: MapEngineErrorReason, message?: string) {
    super(message ?? `The map engine could not start: ${reason}.`);
    this.name = "MapEngineError";
    this.reason = reason;
  }
}
