// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

/**
 * Why a layer could not load: the request failed (`network`), the response
 * could not be decoded (`invalid`), it held no features (`empty`, which only
 * `load` and `loadDetail` use: `identify` resolves to an empty list), or the
 * caller cancelled it (`aborted`, which callers ignore).
 */
export type LayerErrorKind = "network" | "invalid" | "empty" | "aborted";

/** The only error a layer source rejects with. */
export class LayerError extends Error {
  readonly kind: LayerErrorKind;

  constructor(kind: LayerErrorKind, message?: string) {
    super(message ?? `The layer could not load: ${kind}.`);
    this.name = "LayerError";
    this.kind = kind;
  }
}

/**
 * Why a route or a travel-time area could not be found: the request failed
 * (`network`), it was not valid (`invalid`), no route links the stops
 * (`no-route`), the service refused for now (`rate-limited`), the caller
 * cancelled it (`aborted`, which callers ignore), or the provider does not
 * offer what was asked, such as a travel mode (`unsupported`).
 */
export type RoutingErrorKind =
  | "network"
  | "invalid"
  | "no-route"
  | "rate-limited"
  | "aborted"
  | "unsupported";

/** The only error a routing provider rejects with. */
export class RoutingError extends Error {
  readonly kind: RoutingErrorKind;

  constructor(kind: RoutingErrorKind, message?: string) {
    super(message ?? `Routing failed: ${kind}.`);
    this.name = "RoutingError";
    this.kind = kind;
  }
}

/**
 * Why a query for the features inside an area failed: the request failed
 * (`network`), it was not valid or the answer could not be read (`invalid`),
 * the host cannot answer for the layers or the area asked about
 * (`unsupported`), or the caller cancelled it (`aborted`, which callers
 * ignore).
 */
export type FeatureQueryErrorKind =
  | "network"
  | "invalid"
  | "unsupported"
  | "aborted";

/** The only error a feature query rejects with. */
export class FeatureQueryError extends Error {
  readonly kind: FeatureQueryErrorKind;

  constructor(kind: FeatureQueryErrorKind, message?: string) {
    super(message ?? `The feature query failed: ${kind}.`);
    this.name = "FeatureQueryError";
    this.kind = kind;
  }
}

/**
 * Why a map engine failed: it could not start without WebGL, it could not
 * load, it `stopped` working after it had loaded, `toImage` could not
 * produce an image (`export-failed`).
 */
export type MapEngineErrorReason =
  | "webgl-unavailable"
  | "load-failed"
  | "stopped"
  | "export-failed";

/**
 * The only error a map adapter rejects with when its engine cannot start, and
 * the payload of its `fatalError` event when the engine stops later.
 */
export class MapEngineError extends Error {
  readonly reason: MapEngineErrorReason;

  constructor(reason: MapEngineErrorReason, message?: string) {
    super(message ?? `The map engine could not start: ${reason}.`);
    this.name = "MapEngineError";
    this.reason = reason;
  }
}

/**
 * Why a requested image was not made: the request was not valid (`invalid`),
 * the image would be larger than the size limits allow, or the device could
 * not draw it that large (`too-large`), or the tiles the view needs had not
 * finished loading in time (`timed-out`).
 */
export type MapImageExportErrorKind = "invalid" | "too-large" | "timed-out";

/**
 * What `toImage` rejects with when a requested size or view cannot be
 * honoured. It is a {@link MapEngineError} with reason `export-failed`, so a
 * caller that only handles that still works, and `kind` says which of the
 * three it was.
 */
export class MapImageExportError extends MapEngineError {
  readonly kind: MapImageExportErrorKind;

  constructor(kind: MapImageExportErrorKind, message: string) {
    super("export-failed", message);
    this.name = "MapImageExportError";
    this.kind = kind;
  }
}

/**
 * Why no file was opened: the person closed the picker or the caller
 * cancelled (`cancelled`, which callers ignore), the file was larger than
 * allowed (`too-large`), it could not be read (`unreadable`), or the browser
 * cannot open files (`unsupported`).
 */
export type FileOpenErrorKind =
  | "cancelled"
  | "too-large"
  | "unreadable"
  | "unsupported";

/** The only error a file opener rejects with. */
export class FileOpenError extends Error {
  readonly kind: FileOpenErrorKind;

  constructor(kind: FileOpenErrorKind, message?: string) {
    super(message ?? `The file could not be opened: ${kind}.`);
    this.name = "FileOpenError";
    this.kind = kind;
  }
}
