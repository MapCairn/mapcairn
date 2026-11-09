/** The slice of `window` that the media query adapters use. */
export interface MediaQueryWindow {
  matchMedia(query: string): MediaQueryLike;
}

/** The slice of a `MediaQueryList` that {@link observeMediaQuery} uses. */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
  /** Deprecated, but all that Safari before 14 has. */
  addListener?(listener: () => void): void;
  removeListener?(listener: () => void): void;
}

/** Returns the window to read media queries from, or undefined when there is none. */
export function defaultMediaQueryWindow(): MediaQueryWindow | undefined {
  return typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
    ? undefined
    : window;
}

/** Evaluates a media query, or `undefined` when the browser cannot. Never throws. */
export function readMediaQuery(
  getWindow: () => MediaQueryWindow | undefined,
  query: string,
): MediaQueryLike | undefined {
  try {
    return getWindow()?.matchMedia(query);
  } catch {
    return undefined;
  }
}

/**
 * Calls `onChange` whenever the query's result changes, and returns the
 * function that stops it. Safari before 14 has no `addEventListener` on a
 * `MediaQueryList`, only the deprecated `addListener`, so both are supported.
 * Returns a no-op when the list supports neither.
 */
export function observeMediaQuery(
  list: MediaQueryLike | undefined,
  onChange: () => void,
): () => void {
  if (list === undefined) {
    return () => undefined;
  }
  if (typeof list.addEventListener === "function") {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }
  if (typeof list.addListener === "function") {
    list.addListener(onChange);
    return () => list.removeListener?.(onChange);
  }
  return () => undefined;
}
