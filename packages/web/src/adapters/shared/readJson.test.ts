// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  bodyFailureMessage,
  bodyFailureReason,
  ResponseBodyError,
  type ResponseBodyFailure,
  readJsonWithin,
} from "./readJson";

const LIMIT = 100;

/** Why a rejected read failed, so a test can look at the reason. */
async function failure(
  promise: Promise<unknown>,
): Promise<{ reason: ResponseBodyFailure; message: string }> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResponseBodyError);
    const { reason, message } = error as ResponseBodyError;
    return { reason, message };
  }
  throw new Error("Expected the read to fail.");
}

describe("readJsonWithin", () => {
  it("parses a body within the limit", async () => {
    await expect(
      readJsonWithin(new Response('{"a":1}'), LIMIT),
    ).resolves.toEqual({ a: 1 });
  });

  it("refuses a body that is not JSON", async () => {
    const error = await failure(readJsonWithin(new Response("<html>"), LIMIT));
    expect(error.reason).toBe("not-json");
  });

  it("refuses a body that stops with an error part way", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":'));
        controller.error(new TypeError("network error"));
      },
    });
    const error = await failure(readJsonWithin(new Response(body), LIMIT));
    expect(error.reason).toBe("unreadable");
    expect(error.message).toContain("could not be read");
  });

  it("refuses a body that streams past the limit", async () => {
    const body = JSON.stringify({ pad: "x".repeat(LIMIT) });
    const error = await failure(readJsonWithin(new Response(body), LIMIT));
    expect(error.reason).toBe("too-large");
    expect(error.message).toContain(String(LIMIT));
  });

  it("refuses a Content-Length over the limit when there is no body to cancel", async () => {
    const response = new Response(null, {
      headers: { "content-length": String(LIMIT + 1) },
    });
    const error = await failure(readJsonWithin(response, LIMIT));
    expect(error.reason).toBe("too-large");
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

  it("refuses a Content-Length over the limit even when cancelling the body fails", async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        throw new TypeError("cannot cancel");
      },
    });
    const response = new Response(body, {
      headers: { "content-length": String(LIMIT + 1) },
    });
    const error = await failure(readJsonWithin(response, LIMIT));
    expect(error.reason).toBe("too-large");
  });
});

describe("bodyFailureMessage", () => {
  it("gives the message of a body error and nothing for anything else", () => {
    expect(
      bodyFailureMessage(new ResponseBodyError("too-large", "Too big.")),
    ).toBe("Too big.");
    expect(bodyFailureMessage(new TypeError("other"))).toBeUndefined();
    expect(bodyFailureMessage("text")).toBeUndefined();
  });

  it("gives the reason of a body error, and unreadable for anything else", () => {
    expect(
      bodyFailureReason(new ResponseBodyError("too-large", "Too big.")),
    ).toBe("too-large");
    expect(bodyFailureReason(new TypeError("other"))).toBe("unreadable");
  });
});
