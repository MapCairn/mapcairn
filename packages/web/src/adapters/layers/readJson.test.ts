// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LayerError } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { NO_BYTE_LIMIT, readJsonWithin } from "./readJson";

const LIMIT = 100;

/** The error a rejected call carries, so a test can look at its kind. */
async function rejection(promise: Promise<unknown>): Promise<LayerError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LayerError);
    return error as LayerError;
  }
  throw new Error("Expected the read to fail.");
}

describe("readJsonWithin", () => {
  it("parses a body within the limit", async () => {
    await expect(
      readJsonWithin(new Response('{"a":1}'), LIMIT),
    ).resolves.toEqual({ a: 1 });
  });

  it("parses any size when there is no limit", async () => {
    const long = "x".repeat(10_000);
    await expect(
      readJsonWithin(new Response(JSON.stringify({ long })), NO_BYTE_LIMIT),
    ).resolves.toEqual({ long });
  });

  it("refuses a body that is not JSON, as invalid", async () => {
    const error = await rejection(
      readJsonWithin(new Response("<html>"), LIMIT),
    );
    expect(error.kind).toBe("invalid");
  });

  it("refuses a body that stops with an error part way, as invalid", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":'));
        controller.error(new TypeError("network error"));
      },
    });
    const error = await rejection(readJsonWithin(new Response(body), LIMIT));
    expect(error.kind).toBe("invalid");
    expect(error.message).toContain("could not be read");
  });

  it("refuses a Content-Length over the limit when there is no body to cancel", async () => {
    const response = new Response(null, {
      headers: { "content-length": String(LIMIT + 1) },
    });
    const error = await rejection(readJsonWithin(response, LIMIT));
    expect(error.kind).toBe("invalid");
    expect(error.message).toContain(String(LIMIT));
  });

  it("accepts a Content-Length at the limit", async () => {
    const text = JSON.stringify({ pad: "x".repeat(LIMIT - 10) });
    expect(text.length).toBe(LIMIT);
    const response = new Response(text, {
      headers: { "content-length": String(LIMIT) },
    });
    await expect(readJsonWithin(response, LIMIT)).resolves.toHaveProperty(
      "pad",
    );
  });
});
