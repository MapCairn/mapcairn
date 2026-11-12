// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
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
});
