import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHandlerMock = vi.fn(async () => new Response("ok"));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    createRequestHandler: () => requestHandlerMock,
  };
});

describe("worker fetch handler", () => {
  beforeEach(() => {
    requestHandlerMock.mockClear();
  });

  it("passes requests on the new domain through to the request handler unchanged", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.timothybrits.co.za/");
    const response = await workerModule.default.fetch(request);
    expect(response.status).toBe(200);
  });

  it("passes the request through to the request handler unmodified", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.timothybrits.co.za/");

    await workerModule.default.fetch(request);

    expect(requestHandlerMock).toHaveBeenCalledTimes(1);
    expect(requestHandlerMock).toHaveBeenCalledWith(request);
  });

  it("logs and returns a 500 if the request handler throws", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    requestHandlerMock.mockRejectedValueOnce(new Error("boom"));
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.timothybrits.co.za/");

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("applies every SECURITY_HEADERS entry to the SSR response, including the default Content-Security-Policy", async () => {
    const { SECURITY_HEADERS } = await import(
      "../src/constants/securityHeaders"
    );
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.timothybrits.co.za/");

    const response = await workerModule.default.fetch(request);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("preserves a Content-Security-Policy the request handler's response already set, rather than overwriting it", async () => {
    // entry.server.tsx sets a per-request, nonce-bearing CSP on a real SSR
    // response before workers/app.ts ever sees it; withSecurityHeaders
    // must leave that alone instead of replacing it with the nonce-free
    // static default meant for responses with no CSP of their own.
    requestHandlerMock.mockResolvedValueOnce(
      new Response("ok", {
        headers: { "Content-Security-Policy": "default-src 'nonce-abc123'" },
      }),
    );
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.timothybrits.co.za/");

    const response = await workerModule.default.fetch(request);

    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'nonce-abc123'",
    );
  });

  it("applies the full SECURITY_HEADERS, including the default Content-Security-Policy, on the 500 fallback response", async () => {
    const { SECURITY_HEADERS } = await import(
      "../src/constants/securityHeaders"
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    requestHandlerMock.mockRejectedValueOnce(new Error("boom"));
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.timothybrits.co.za/");

    const response = await workerModule.default.fetch(request);

    expect(response.headers.get("X-Content-Type-Options")).toBe(
      SECURITY_HEADERS["X-Content-Type-Options"],
    );
    expect(response.headers.get("Content-Security-Policy")).toBe(
      SECURITY_HEADERS["Content-Security-Policy"],
    );
    vi.restoreAllMocks();
  });
});

describe("worker fetch handler on the previous hostname", () => {
  beforeEach(() => {
    requestHandlerMock.mockClear();
  });

  it("redirects a page permanently to the same path and query on the current hostname", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://karta.timothybrits.co.za/privacy?x=1");

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://mapcairn.timothybrits.co.za/privacy?x=1",
    );
    expect(requestHandlerMock).not.toHaveBeenCalled();
  });

  it("leaves the fragment out of the address, so the browser keeps the visitor's own", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://karta.timothybrits.co.za/");

    const response = await workerModule.default.fetch(request);

    expect(response.headers.get("Location")).not.toContain("#");
  });

  it("redirects a HEAD request the same way", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://karta.timothybrits.co.za/", {
      method: "HEAD",
    });

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(301);
  });

  it("does not redirect a POST, so a report from a page still open on the previous address is received", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://karta.timothybrits.co.za/log-error", {
      method: "POST",
      body: "{}",
    });

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(200);
    expect(requestHandlerMock).toHaveBeenCalledTimes(1);
  });
});
