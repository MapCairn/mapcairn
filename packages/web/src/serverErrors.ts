// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isRouteErrorResponse } from "react-router";

/** The first status that means the server, not the visitor's request, failed. */
const FIRST_SERVER_ERROR_STATUS = 500;

/**
 * Turns anything thrown into text for a log line. Logging the value itself
 * would show an object as `[object Object]` in Workers Logs.
 * @remarks An `Error` gives its stack, or `name: message` without one. A route
 *   error response gives the error it wraps, or else its status and text. Any
 *   other value gives its JSON, or `String(value)` when JSON cannot hold it.
 */
export function describeServerError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.error
      ? describeServerError(error.error)
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
 * Logs a server error as readable text, except a client error (a path the app
 * does not serve, a method a route does not accept) and a request the visitor
 * has already abandoned. Those are expected answers, not faults, and logging
 * them lets scanner traffic fill the Workers issues list. Nothing else is
 * recorded about the request.
 * @remarks Used as React Router's `handleError` in `entry.server.tsx`, which
 *   replaces its default of logging the raw value.
 */
export function handleServerError(
  error: unknown,
  { request }: { readonly request: Request },
): void {
  if (request.signal.aborted) {
    return;
  }
  if (isRouteErrorResponse(error) && error.status < FIRST_SERVER_ERROR_STATUS) {
    return;
  }
  console.error(describeServerError(error));
}
