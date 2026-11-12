// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFetch, isAbortError } from "./fetch";

describe("defaultFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the fetch installed on globalThis at request time", async () => {
    const response = new Response("ok");
    const stubbed = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", stubbed);
    const init = { method: "GET" };
    await expect(defaultFetch("https://example.org/a", init)).resolves.toBe(
      response,
    );
    expect(stubbed).toHaveBeenCalledWith("https://example.org/a", init);
  });
});

describe("isAbortError", () => {
  it("recognises the error a cancelled fetch rejects with", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("rejects any other error", () => {
    expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAbortError(new DOMException("late", "TimeoutError"))).toBe(false);
  });

  it("rejects a value that only carries the name", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});
