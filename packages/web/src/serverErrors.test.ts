// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createRequestHandler,
  type ServerBuild,
  UNSAFE_ErrorResponseImpl,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeServerError,
  handleServerError,
  logServerError,
} from "./serverErrors";

/** What React Router passes for a path or method the app does not serve. */
function errorResponse(status: number, statusText: string, error?: Error) {
  return new UNSAFE_ErrorResponseImpl(
    status,
    statusText,
    error ?? `Error: ${statusText}`,
    true,
  );
}

describe("serverErrors", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe("describeServerError", () => {
    it("gives an Error's stack, so the log names where it came from", () => {
      const error = new Error("boom");

      expect(describeServerError(error)).toBe(error.stack);
    });

    it("gives an Error's message when it has no stack", () => {
      const error = new Error("boom");
      error.stack = undefined;

      expect(describeServerError(error)).toBe("Error: boom");
    });

    it("gives an error response as its status and text, never [object Object]", () => {
      expect(describeServerError(errorResponse(500, "Server Error"))).toBe(
        "500 Server Error",
      );
    });

    it("gives the underlying error of an error response", () => {
      const cause = new Error("loader failed");

      expect(describeServerError(errorResponse(500, "Error", cause))).toBe(
        cause.stack,
      );
    });

    it("gives any other value as JSON text", () => {
      expect(describeServerError({ reason: "x" })).toBe('{"reason":"x"}');
      expect(describeServerError("plain")).toBe("plain");
    });

    it("never throws on a value JSON cannot hold", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(describeServerError(circular)).toBe("[object Object]");
      expect(describeServerError(10n)).toBe("10");
    });
  });

  describe("handleServerError", () => {
    const request = new Request("https://mapcairn.timothybrits.co.za/.env");

    it("does not log an unknown path (404)", () => {
      handleServerError(
        errorResponse(
          404,
          "Not Found",
          new Error('No route matches URL "/.env"'),
        ),
        { request },
      );

      expect(consoleError).not.toHaveBeenCalled();
    });

    it("does not log a method the route does not accept (405)", () => {
      handleServerError(
        errorResponse(
          405,
          "Method Not Allowed",
          new Error(
            'You made a POST request to "/" but did not provide an action',
          ),
        ),
        { request },
      );

      expect(consoleError).not.toHaveBeenCalled();
    });

    it.each([
      [400, "Bad Request"],
      [401, "Unauthorized"],
      [403, "Forbidden"],
      [410, "Gone"],
      [429, "Too Many Requests"],
    ])(
      "still logs a %i error response, which the app never throws on purpose",
      (status, text) => {
        handleServerError(errorResponse(status, text), { request });

        expect(consoleError).toHaveBeenCalledExactlyOnceWith(
          `${status} ${text}`,
        );
      },
    );

    it("logs a server error response as readable text", () => {
      handleServerError(errorResponse(500, "Server Error"), { request });

      expect(consoleError).toHaveBeenCalledExactlyOnceWith("500 Server Error");
    });

    it("logs an Error with its stack", () => {
      const error = new Error("boom");

      handleServerError(error, { request });

      expect(consoleError).toHaveBeenCalledExactlyOnceWith(error.stack);
    });

    it("logs a render error through logServerError unless the request was abandoned", () => {
      const error = new Error("render failed");
      const controller = new AbortController();

      logServerError(error, request);
      controller.abort();
      logServerError(
        error,
        new Request(request, { signal: controller.signal }),
      );

      expect(consoleError).toHaveBeenCalledExactlyOnceWith(error.stack);
    });

    it("does not log when the visitor has already gone away", () => {
      const controller = new AbortController();
      controller.abort();

      handleServerError(new Error("aborted"), {
        request: new Request(request, { signal: controller.signal }),
      });

      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe("through React Router's request handler", () => {
    const build = {
      routes: {
        root: {
          id: "root",
          path: "",
          module: {},
          parentId: undefined,
        },
        boom: {
          id: "boom",
          path: "boom",
          parentId: "root",
          module: {
            loader: () => {
              throw new Error("loader failed");
            },
          },
        },
      },
      entry: {
        module: {
          default: async (_request: Request, status: number) =>
            new Response("page", { status }),
          handleError: handleServerError,
        },
      },
      assets: { routes: {}, entry: {}, url: "", version: "" },
      future: {},
      ssr: true,
      isSpaMode: false,
      basename: "/",
      publicPath: "/",
      assetsBuildDirectory: "",
      routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
    } as unknown as ServerBuild;
    const handle = createRequestHandler(build, "production");

    it("keeps an unknown path silent and answers 404", async () => {
      const response = await handle(
        new Request("https://mapcairn.timothybrits.co.za/.env"),
      );

      expect(response.status).toBe(404);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("keeps a wrong method silent and answers 405", async () => {
      const response = await handle(
        new Request("https://mapcairn.timothybrits.co.za/boom", {
          method: "POST",
        }),
      );

      expect(response.status).toBe(405);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("logs a loader that throws, with its stack", async () => {
      const response = await handle(
        new Request("https://mapcairn.timothybrits.co.za/boom?_data=boom"),
      );

      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("Error: loader failed"),
      );
    });
  });
});
