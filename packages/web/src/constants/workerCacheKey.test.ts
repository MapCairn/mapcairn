import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  SECURITY_HEADERS,
} from "./securityHeaders";
import { shortHash, WORKER_CACHE_KEY, withCacheKey } from "./workerCacheKey";

describe("shortHash", () => {
  it("gives eight lower-case hex digits", () => {
    expect(shortHash("connect-src 'self'")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("gives the same text the same hash every time", () => {
    expect(shortHash("same text")).toBe(shortHash("same text"));
  });

  it("gives different text a different hash, even when only one origin changes", () => {
    const before = "connect-src 'self' https://a.example";
    const after = "connect-src 'self' https://a.example https://b.example";
    expect(shortHash(after)).not.toBe(shortHash(before));
  });
});

describe("withCacheKey", () => {
  it("adds the key as a v query to a URL with no query", () => {
    expect(withCacheKey("/assets/worker-abc.js", "1234abcd")).toBe(
      "/assets/worker-abc.js?v=1234abcd",
    );
  });

  it("keeps a query the URL already has", () => {
    expect(withCacheKey("/assets/worker.js?x=1", "1234abcd")).toBe(
      "/assets/worker.js?x=1&v=1234abcd",
    );
  });
});

describe("WORKER_CACHE_KEY", () => {
  it("is derived from the policy the static assets are served with", () => {
    expect(WORKER_CACHE_KEY).toBe(
      shortHash(SECURITY_HEADERS["Content-Security-Policy"] ?? ""),
    );
  });

  it("would change if the policy gained an origin, so a cached worker is not reused", () => {
    const widened = `${buildContentSecurityPolicy()}; img-src https://new.example`;
    expect(shortHash(widened)).not.toBe(WORKER_CACHE_KEY);
  });
});
