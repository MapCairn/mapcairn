// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const renderToReadableStreamMock = vi.fn(
  async (_element: unknown, _options: unknown) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '<html><head><link rel="modulepreload" href="/a.js"/></head><body>x</body></html>',
          ),
        );
        controller.close();
      },
    }),
);

vi.mock("react-dom/server", () => ({
  renderToReadableStream: renderToReadableStreamMock,
}));

/**
 * Runs `handleRequest` once against a fresh request and extracts everything
 * these tests check: the response itself, the nonce embedded in its CSP
 * header, and the two places that nonce must also reach; the `nonce`
 * option `renderToReadableStream` was called with, and the `nonce` prop on
 * the `<ServerRouter>` element passed to it.
 */
async function handleOnce() {
  const handleRequest = (await import("./entry.server")).default;
  const response = await handleRequest(
    new Request("https://mapcairn.com/"),
    200,
    new Headers(),
    {} as never,
  );

  const headerNonce = response.headers
    .get("Content-Security-Policy")
    ?.match(/'nonce-([^']+)'/)?.[1];
  const lastCall =
    renderToReadableStreamMock.mock.calls[
      renderToReadableStreamMock.mock.calls.length - 1
    ];
  const serverRouterElement = lastCall?.[0] as { props: { nonce?: string } };
  const renderOptions = lastCall?.[1] as { nonce?: string };

  return { response, headerNonce, renderOptions, serverRouterElement };
}

/**
 * Allowance for the first, cold import of `./entry.server`. That import loads
 * React's server renderer and React Router, which took over 5 s once on a
 * loaded machine, so it is paid once here rather than inside the first test,
 * which would otherwise time out at the 5 s default.
 */
const COLD_IMPORT_TIMEOUT_MS = 30_000;

describe("entry.server handleRequest", () => {
  beforeAll(async () => {
    await import("./entry.server");
  }, COLD_IMPORT_TIMEOUT_MS);

  beforeEach(() => {
    renderToReadableStreamMock.mockClear();
  });

  it("asks browsers to revalidate the page on every visit, so a deploy reaches people at once", async () => {
    const { response } = await handleOnce();

    // `no-cache`, not `no-store`, which would keep the page out of the
    // back/forward cache.
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("sets a Content-Security-Policy header carrying a nonce", async () => {
    const { response } = await handleOnce();

    expect(response.headers.get("Content-Security-Policy")).toMatch(
      /'nonce-[^']+'/,
    );
  });

  it("passes the same nonce to renderToReadableStream's options that it puts in the CSP header", async () => {
    const { headerNonce, renderOptions } = await handleOnce();

    expect(renderOptions.nonce).toBe(headerNonce);
  });

  it("passes the same nonce as <ServerRouter>'s own nonce prop, which react-router threads to Scripts/ScrollRestoration/its streamed-data script", async () => {
    // renderToReadableStream's own `nonce` option only covers scripts React
    // itself injects; react-router's <Scripts>/<ScrollRestoration> and its
    // streamed-data transfer script are its own components, reached only
    // via a matching nonce prop passed directly to <ServerRouter>.
    const { headerNonce, serverRouterElement } = await handleOnce();

    expect(serverRouterElement.props.nonce).toBe(headerNonce);
  });

  it("uses a different nonce for each request", async () => {
    const first = await handleOnce();
    const second = await handleOnce();

    expect(first.headerNonce).not.toBe(second.headerNonce);
  });
});

describe("entry.server error logging", () => {
  it("exports React Router's handleError as the shared server error handler", async () => {
    const entry = await import("./entry.server");
    const { handleServerError } = await import("./serverErrors");

    expect(entry.handleError).toBe(handleServerError);
  });

  it("logs a render error as readable text", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const handleRequest = (await import("./entry.server")).default;
    await handleRequest(
      new Request("https://mapcairn.com/"),
      200,
      new Headers(),
      { staticHandlerContext: { matches: [] }, routeModules: {} } as never,
    );
    const options = renderToReadableStreamMock.mock.calls.at(-1)?.[1] as {
      onError(error: unknown): void;
    };
    const error = new Error("render failed");

    options.onError(error);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(error.stack);
    consoleError.mockRestore();
  });

  it("logs no render error for a request the visitor has abandoned", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const controller = new AbortController();
    controller.abort();
    const handleRequest = (await import("./entry.server")).default;
    await handleRequest(
      new Request("https://mapcairn.com/", {
        signal: controller.signal,
      }),
      200,
      new Headers(),
      { staticHandlerContext: { matches: [] }, routeModules: {} } as never,
    );
    const options = renderToReadableStreamMock.mock.calls.at(-1)?.[1] as {
      onError(error: unknown): void;
    };

    options.onError(new Error("render failed"));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
