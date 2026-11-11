/**
 * Calls the `fetch` on `globalThis` at the moment of the request, not the one
 * there when the adapter was built, so a test or a polyfill installed later is
 * still used. The default for every adapter that takes an optional `fetch`.
 */
export function defaultFetch(
  ...args: Parameters<typeof fetch>
): ReturnType<typeof fetch> {
  return globalThis.fetch(...args);
}

/**
 * Whether `error` is the `AbortError` a cancelled `fetch` rejects with. Only
 * an `Error` (a `DOMException` included) counts, so a plain object that only
 * carries the name does not.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
