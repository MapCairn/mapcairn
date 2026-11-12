// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { LayerError } from "../ports/errors";
import {
  type CachedResponse,
  maxAgeFromCacheControl,
  SharedResponseCache,
} from "./responseCache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  let now = 1_000_000;
  const cache = new SharedResponseCache<string>({ now: () => now });
  const advance = (ms: number) => {
    now += ms;
  };
  return { cache, advance };
}

describe("maxAgeFromCacheControl", () => {
  it("reads max-age in seconds", () => {
    expect(maxAgeFromCacheControl("public, max-age=60")).toBe(60);
    expect(maxAgeFromCacheControl("MAX-AGE=5")).toBe(5);
  });

  it("is zero for no-store, no-cache, nothing or nonsense", () => {
    expect(maxAgeFromCacheControl("no-store, max-age=60")).toBe(0);
    expect(maxAgeFromCacheControl("no-cache")).toBe(0);
    expect(maxAgeFromCacheControl(null)).toBe(0);
    expect(maxAgeFromCacheControl("max-age=soon")).toBe(0);
  });
});

describe("SharedResponseCache", () => {
  it("starts one request for callers that ask for the same key at once", async () => {
    const { cache } = setup();
    const pending = deferred<CachedResponse<string>>();
    const start = vi.fn(() => pending.promise);
    const first = cache.load("a", start);
    const second = cache.load("a", start);
    pending.resolve({ value: "body", maxAgeSeconds: 0 });
    await expect(first).resolves.toBe("body");
    await expect(second).resolves.toBe("body");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("serves a response from memory until its max-age passes", async () => {
    const { cache, advance } = setup();
    const start = vi.fn(async () => ({ value: "body", maxAgeSeconds: 60 }));
    await cache.load("a", start);
    advance(59_000);
    await expect(cache.load("a", start)).resolves.toBe("body");
    expect(start).toHaveBeenCalledTimes(1);
    advance(2_000);
    await cache.load("a", start);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("keeps nothing when the response has no max-age", async () => {
    const { cache } = setup();
    const start = vi.fn(async () => ({ value: "body", maxAgeSeconds: 0 }));
    await cache.load("a", start);
    await cache.load("a", start);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("keeps keys apart", async () => {
    const { cache } = setup();
    await cache.load("a", async () => ({ value: "A", maxAgeSeconds: 60 }));
    await expect(
      cache.load("b", async () => ({ value: "B", maxAgeSeconds: 60 })),
    ).resolves.toBe("B");
  });

  it("passes a failure to every waiter and keeps nothing", async () => {
    const { cache } = setup();
    const failure = new LayerError("network");
    const start = vi.fn(async () => {
      throw failure;
    });
    const first = cache.load("a", start);
    const second = cache.load("a", start);
    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    await expect(cache.load("a", start)).rejects.toBe(failure);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("rejects a caller whose signal has already fired, starting nothing", async () => {
    const { cache } = setup();
    const start = vi.fn(async () => ({ value: "body", maxAgeSeconds: 60 }));
    await expect(
      cache.load("a", start, AbortSignal.abort()),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(start).not.toHaveBeenCalled();
  });

  it("lets one caller give up while another still waits for the same request", async () => {
    const { cache } = setup();
    const pending = deferred<CachedResponse<string>>();
    let requestSignal: AbortSignal | undefined;
    const start = (signal: AbortSignal) => {
      requestSignal = signal;
      return pending.promise;
    };
    const quitter = new AbortController();
    const first = cache.load("a", start, quitter.signal);
    const second = cache.load("a", start);
    quitter.abort();
    await expect(first).rejects.toMatchObject({ kind: "aborted" });
    expect(requestSignal?.aborted).toBe(false);
    pending.resolve({ value: "body", maxAgeSeconds: 0 });
    await expect(second).resolves.toBe("body");
  });

  it("cancels the request when every caller has given up, and starts afresh next time", async () => {
    const { cache } = setup();
    let requestSignal: AbortSignal | undefined;
    const start = vi.fn((signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<CachedResponse<string>>(() => {});
    });
    const one = new AbortController();
    const two = new AbortController();
    const first = cache.load("a", start, one.signal);
    const second = cache.load("a", start, two.signal);
    one.abort();
    expect(requestSignal?.aborted).toBe(false);
    two.abort();
    expect(requestSignal?.aborted).toBe(true);
    await expect(first).rejects.toBeInstanceOf(LayerError);
    await expect(second).rejects.toBeInstanceOf(LayerError);
    void cache.load("a", start);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("keeps at most a set number of responses, dropping the oldest", async () => {
    let now = 0;
    const cache = new SharedResponseCache<string>({
      now: () => now,
      maxEntries: 2,
    });
    const start = vi.fn(async () => ({ value: "v", maxAgeSeconds: 600 }));
    await cache.load("a", start);
    await cache.load("b", start);
    await cache.load("c", start);
    now += 1;
    await cache.load("b", start);
    await cache.load("c", start);
    expect(start).toHaveBeenCalledTimes(3);
    await cache.load("a", start);
    expect(start).toHaveBeenCalledTimes(4);
  });
});
