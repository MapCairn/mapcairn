// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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
    const request = new Request("https://mapcairn.com/");
    const response = await workerModule.default.fetch(request);
    expect(response.status).toBe(200);
  });

  it("passes the request through to the request handler unmodified", async () => {
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.com/");

    await workerModule.default.fetch(request);

    expect(requestHandlerMock).toHaveBeenCalledTimes(1);
    expect(requestHandlerMock).toHaveBeenCalledWith(request);
  });

  it("logs and returns a 500 if the request handler throws", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error("boom");
    requestHandlerMock.mockRejectedValueOnce(error);
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.com/");

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledExactlyOnceWith(error.stack);
    consoleErrorSpy.mockRestore();
  });

  it("applies every SECURITY_HEADERS entry to the SSR response, including the default Content-Security-Policy", async () => {
    const { SECURITY_HEADERS } = await import(
      "../src/constants/securityHeaders"
    );
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.com/");

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
    const request = new Request("https://mapcairn.com/");

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
    const error = new Error("boom");
    requestHandlerMock.mockRejectedValueOnce(error);
    const workerModule = await import("./app");
    const request = new Request("https://mapcairn.com/");

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

const REDIRECTED = [
  "karta.timothybrits.co.za",
  "mapcairn.timothybrits.co.za",
  "www.mapcairn.com",
];

describe.each(REDIRECTED)("worker fetch handler on %s", (hostname) => {
  beforeEach(() => {
    requestHandlerMock.mockClear();
  });

  it("redirects a page permanently to the same path and query on mapcairn.com", async () => {
    const workerModule = await import("./app");
    const request = new Request(`https://${hostname}/privacy?x=1`);

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://mapcairn.com/privacy?x=1",
    );
    expect(requestHandlerMock).not.toHaveBeenCalled();
  });

  it("leaves the fragment out of the address, so the browser keeps the visitor's own", async () => {
    const workerModule = await import("./app");
    const request = new Request(`https://${hostname}/`);

    const response = await workerModule.default.fetch(request);

    expect(response.headers.get("Location")).not.toContain("#");
  });

  it("redirects a HEAD request the same way", async () => {
    const workerModule = await import("./app");
    const request = new Request(`https://${hostname}/`, { method: "HEAD" });

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(301);
  });

  it("does not redirect a POST, so a report from a page still open on this address is received", async () => {
    const workerModule = await import("./app");
    const request = new Request(`https://${hostname}/log-error`, {
      method: "POST",
      body: "{}",
    });

    const response = await workerModule.default.fetch(request);

    expect(response.status).toBe(200);
    expect(requestHandlerMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/docs", "https://docs.mapcairn.com/"],
    ["/docs/", "https://docs.mapcairn.com/"],
    [
      "/docs/guides/public-api/?a=1",
      "https://docs.mapcairn.com/guides/public-api/?a=1",
    ],
    ["/docs/llms.txt", "https://docs.mapcairn.com/llms.txt"],
  ])(
    "sends %s to the documentation site without the /docs prefix",
    async (path, expected) => {
      const workerModule = await import("./app");

      const response = await workerModule.default.fetch(
        new Request(`https://${hostname}${path}`),
      );

      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(expected);
    },
  );

  it("does not take a path that only starts with the letters docs for the documentation", async () => {
    const workerModule = await import("./app");

    const response = await workerModule.default.fetch(
      new Request(`https://${hostname}/docsify`),
    );

    expect(response.headers.get("Location")).toBe(
      "https://mapcairn.com/docsify",
    );
  });
});

describe("worker redirects never leave the site's own origins", () => {
  beforeEach(() => {
    requestHandlerMock.mockClear();
  });

  it.each([
    [
      "https://www.mapcairn.com//evil.example/x",
      "https://mapcairn.com/evil.example/x",
    ],
    [
      "https://karta.timothybrits.co.za///evil.example",
      "https://mapcairn.com/evil.example",
    ],
    [
      "https://karta.timothybrits.co.za/\\evil.example",
      "https://mapcairn.com/evil.example",
    ],
    [
      "https://mapcairn.com/docs//evil.example",
      "https://docs.mapcairn.com/evil.example",
    ],
    [
      "https://mapcairn.com/docs/\\evil.example",
      "https://docs.mapcairn.com/evil.example",
    ],
    [
      "https://www.mapcairn.com/docs///evil.example/y?q=1",
      "https://docs.mapcairn.com/evil.example/y?q=1",
    ],
  ])("sends %s to %s", async (from, expected) => {
    const workerModule = await import("./app");

    const response = await workerModule.default.fetch(new Request(from));

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(expected);
  });
});

describe("worker fetch handler on mapcairn.com for the old documentation path", () => {
  beforeEach(() => {
    requestHandlerMock.mockClear();
  });

  it("sends /docs/... to the documentation site, which people type from habit", async () => {
    const workerModule = await import("./app");

    const response = await workerModule.default.fetch(
      new Request("https://mapcairn.com/docs/guides/licence/"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://docs.mapcairn.com/guides/licence/",
    );
    expect(requestHandlerMock).not.toHaveBeenCalled();
  });

  it("serves every other page itself", async () => {
    const workerModule = await import("./app");

    const response = await workerModule.default.fetch(
      new Request("https://mapcairn.com/map"),
    );

    expect(response.status).toBe(200);
    expect(requestHandlerMock).toHaveBeenCalledTimes(1);
  });
});
