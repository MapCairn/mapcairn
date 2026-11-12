// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import {
  CLIENT_ERROR_REPORT_MAX_BODY_BYTES,
  CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH,
} from "../constants/clientErrorReporting";
import { SITE_ORIGINS } from "../constants/siteConfig";

/**
 * Shape of a client error report POSTed by `BeaconErrorReporter`. Every
 * string field is bounded by `CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH` so a
 * malformed or malicious payload can't write unbounded text into Workers
 * Logs.
 */
const clientErrorReportSchema = z.object({
  message: z.string().min(1).max(CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH),
  stack: z.string().max(CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH).optional(),
  url: z.string().max(CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH),
  source: z.enum(["error", "unhandledrejection"]),
});

/**
 * React Router resource route action: the server-side half of client error
 * reporting. Accepts a `POST` from `BeaconErrorReporter` (started by
 * `installErrorReporting()` in `composition/errorReporting.ts`), validates
 * it, and logs it via
 * `console.error` so it reaches Cloudflare Workers Logs the same way
 * server errors already do (React Router's request handler, through its
 * default `handleError`, and `entry.server.tsx`'s `onError`); this is the only place an
 * uncaught client-side error becomes visible outside the visitor's own
 * browser console.
 * @remarks Deliberately stores nothing and returns no body: this app keeps
 *   no server-side database of visitor data (see `PRIVACY.md`), and a
 *   transient log line is the full extent of what this endpoint does.
 * @remarks The page address is logged as origin and path only. Any query or
 *   hash is dropped ({@link stripQueryAndHash}) even though the app's own
 *   reporter never sends one, because the hash holds the map view, which
 *   after Locate me is the visitor's position.
 * @remarks `navigator.sendBeacon` (`BeaconErrorReporter`'s primary send
 *   path) is exempt from CORS preflight even cross-origin, so an `Origin`
 *   check is this route's only defence against a third-party page beaconing
 *   arbitrary text into this app's Workers Logs; a request carrying an
 *   `Origin` other than this app's own is rejected outright. A request with
 *   no `Origin` header at all is still accepted, since some same-origin
 *   `sendBeacon`/`fetch` calls omit it depending on the browser. The
 *   `Content-Length` check runs before `request.json()` is ever called, so
 *   an oversized payload is rejected without first buffering it into memory
 *   in full; a request with no `Content-Length` at all (e.g. chunked
 *   transfer-encoding) is rejected too, rather than treated as size `0`,
 *   since every legitimate sender here (`fetch`/`sendBeacon` with a string
 *   body) always sets it, and a missing header is otherwise indistinguishable
 *   from an attempt to bypass the cap. Every logged string field is also
 *   stripped of control characters ({@link sanitizeForLog}) so a report
 *   can't forge extra log lines or fields in Workers Logs.
 */
export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const origin = request.headers.get("Origin");
  if (origin !== null && !SITE_ORIGINS.includes(origin)) {
    return new Response(null, { status: 403 });
  }

  const contentLengthHeader = request.headers.get("Content-Length");
  const contentLength = Number(contentLengthHeader);
  if (
    contentLengthHeader === null ||
    !Number.isFinite(contentLength) ||
    contentLength < 0
  ) {
    return new Response(null, { status: 411 });
  }
  if (contentLength > CLIENT_ERROR_REPORT_MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  try {
    const report = clientErrorReportSchema.parse(await request.json());
    console.error("[client-error]", {
      ...report,
      message: sanitizeForLog(report.message),
      stack:
        report.stack === undefined ? undefined : sanitizeForLog(report.stack),
      url: sanitizeForLog(stripQueryAndHash(report.url)),
    });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}

/**
 * Cuts a page address at its first `?` or `#`, leaving origin and path. Works
 * on text rather than `URL`, so a relative or malformed address is cut too.
 */
function stripQueryAndHash(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? "";
}

/**
 * Strips ASCII control characters (including newlines and carriage returns)
 * from a client-supplied string before it's written to Workers Logs, so a
 * malicious report can't inject fake log lines or forge additional fields
 * that a text-based downstream log consumer would otherwise read as separate
 * entries.
 */
function sanitizeForLog(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters to strip them
  return value.replace(/[\x00-\x1f\x7f]/g, " ");
}
