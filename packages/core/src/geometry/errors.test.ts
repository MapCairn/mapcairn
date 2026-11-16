// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { message } from "../messages/formatMessage";
import { GeometryError } from "./errors";

describe("GeometryError", () => {
  it("carries its kind and a default message", () => {
    const error = new GeometryError("empty");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GeometryError");
    expect(error.kind).toBe("empty");
    expect(error.message).toContain("empty");
  });

  it("accepts a message of its own", () => {
    expect(new GeometryError("invalid", "Bad ring.").message).toBe("Bad ring.");
  });

  it("keeps a message to format, and says it in English in `message`", () => {
    const fault = message("wkt.expectedNumber", {});
    const error = new GeometryError("invalid", fault);
    expect(error.description).toBe(fault);
    expect(error.message).toBe("Expected a number");
  });

  it("has no message to format for a plain string", () => {
    expect(
      new GeometryError("invalid", "Bad ring.").description,
    ).toBeUndefined();
  });
});
