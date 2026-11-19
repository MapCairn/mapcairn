// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeServerError, handleServerError } from "./serverErrors";

/** What React Router passes for a path or method the app does not serve. */
function errorResponse(status: number, statusText: string, error?: Error) {
  return {
    status,
    statusText,
    data: `Error: ${statusText}`,
    internal: true,
    error,
  };
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

    it("logs a server error response as readable text", () => {
      handleServerError(errorResponse(500, "Server Error"), { request });

      expect(consoleError).toHaveBeenCalledExactlyOnceWith("500 Server Error");
    });

    it("logs an Error with its stack", () => {
      const error = new Error("boom");

      handleServerError(error, { request });

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
});
