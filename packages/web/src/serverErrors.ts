// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isRouteErrorResponse } from "react-router";

/**
 * The route error response statuses that are expected answers, not faults: a
 * path the app does not serve (404) and a method a route does not accept
 * (405). Other client statuses (400, 401, 403, 410, 429) still log, because
 * the app throws none on purpose and one would be worth seeing.
 */
const EXPECTED_STATUSES: readonly number[] = [404, 405];

/**
 * Turns anything thrown into text for a log line. Logging the value itself
 * would show an object as `[object Object]` in Workers Logs.
 * @remarks An `Error` gives its stack, or `name: message` without one. A route
 *   error response gives the error it wraps, or else its status and text. Any
 *   other value gives its JSON, or `String(value)` when JSON cannot hold it.
 */
export function describeServerError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    const wrapped = (error as { error?: unknown }).error;
    return wrapped
      ? describeServerError(wrapped)
      : `${error.status} ${error.statusText}`;
  }
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * Logs a server error as readable text, unless it is a 404 or 405 route error
 * response or the visitor has already abandoned the request. Those are
 * expected answers, not faults, and logging them lets scanner traffic fill the
 * Workers issues list. Nothing else is recorded about the request.
 * @remarks Used for React Router's `handleError` and for the render error hook
 *   in `entry.server.tsx`, so both apply the same rule.
 */
export function logServerError(error: unknown, request: Request): void {
  if (request.signal.aborted) {
    return;
  }
  if (isRouteErrorResponse(error) && EXPECTED_STATUSES.includes(error.status)) {
    return;
  }
  console.error(describeServerError(error));
}

/** React Router's `handleError` hook, which receives the request in its second argument. */
export function handleServerError(
  error: unknown,
  { request }: { readonly request: Request },
): void {
  logServerError(error, request);
}
