// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Why a body could not be read: it is over the limit (`too-large`), it stopped
 * with an error before its end (`unreadable`, which includes a cancelled
 * request, so a caller that holds a signal checks it first), or it is not
 * JSON (`not-json`).
 */
export type ResponseBodyFailure = "too-large" | "unreadable" | "not-json";

/**
 * The only error {@link readJsonWithin} rejects with. It names no port: each
 * adapter turns it into the error its own port reports.
 */
export class ResponseBodyError extends Error {
  readonly reason: ResponseBodyFailure;

  constructor(reason: ResponseBodyFailure, message: string) {
    super(message);
    this.name = "ResponseBodyError";
    this.reason = reason;
  }
}

function tooLarge(maxBytes: number): ResponseBodyError {
  return new ResponseBodyError(
    "too-large",
    `The response is larger than ${maxBytes} bytes.`,
  );
}

/**
 * The body as text, read a chunk at a time so a body past `maxBytes` is
 * abandoned at the first chunk that crosses the line, not held whole.
 */
async function readText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    received += chunk.value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw tooLarge(maxBytes);
    }
    text += decoder.decode(chunk.value, { stream: true });
    chunk = await reader.read();
  }
  return text + decoder.decode();
}

/**
 * Reads a response as JSON, refusing one larger than `maxBytes`. The only way
 * an adapter reads a provider's body (`bodyReads.test.ts` holds them
 * to it).
 *
 * @remarks The size is checked twice: against `Content-Length` when the
 *   server sends one, so an answer that says it is too large is never read,
 *   and again while reading, because the header can be missing or wrong (and
 *   describes the compressed size). Bytes are counted, not characters.
 * @throws `ResponseBodyError`: `too-large` when the body is over the limit,
 *   `unreadable` when it cannot be read to its end (a cancelled request's
 *   body stops with an error, which the caller reads from its own signal),
 *   `not-json` when it is not JSON.
 */
export async function readJsonWithin(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge(maxBytes);
  }
  const text = await readText(response, maxBytes).catch((error: unknown) => {
    throw error instanceof ResponseBodyError
      ? error
      : new ResponseBodyError("unreadable", "The response could not be read.");
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new ResponseBodyError("not-json", "The response is not JSON.");
  }
}
