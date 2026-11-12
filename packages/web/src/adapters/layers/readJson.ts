// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LayerError } from "@mapcairn/core";

/** The bound that never refuses: for an answer the caller does not limit. */
export const NO_BYTE_LIMIT = Number.POSITIVE_INFINITY;

function tooLarge(maxBytes: number): LayerError {
  return new LayerError(
    "invalid",
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
 * Reads a response as JSON, refusing one larger than `maxBytes`.
 *
 * @remarks The size is checked twice: against `Content-Length` when the
 *   server sends one, so an answer that says it is too large is never read,
 *   and again while reading, because the header can be missing or wrong (and
 *   describes the compressed size). Bytes are counted, not characters.
 * @throws `LayerError` `invalid` when the body is over the limit, cannot be
 *   read to its end (a cancelled request's body stops with an error, which
 *   the caller reads from its own signal), or is not JSON.
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
    throw error instanceof LayerError
      ? error
      : new LayerError("invalid", "The response could not be read.");
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new LayerError("invalid", "The response is not JSON.");
  }
}
