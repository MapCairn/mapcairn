/**
 * Path of the resource route client-side error reports are POSTed to (see
 * `routes/log-error.ts`). Shared between `BeaconErrorReporter` (the
 * sender) and that route (the receiver) so the two can't drift apart.
 */
export const CLIENT_ERROR_REPORT_PATH = "/log-error";

/**
 * Maximum length, in UTF-16 code units, of each string field of a client
 * error report. The client truncates to it and the server rejects anything
 * longer, so the endpoint cannot write unbounded text into Workers Logs.
 */
export const CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH = 2000;

/**
 * Maximum request body size, in bytes, `routes/log-error.ts` accepts, checked
 * against `Content-Length` before the body is read.
 * @remarks Three fields at {@link CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH}, at
 *   three UTF-8 bytes per code unit, fit well within it with the JSON around
 *   them.
 */
export const CLIENT_ERROR_REPORT_MAX_BODY_BYTES = 32 * 1024;
