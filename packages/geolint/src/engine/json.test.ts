// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { escapePointerToken, pointer } from "./json.js";

/** The escaping RFC 6901 describes, written the plain way. */
function reference(token: string | number): string {
  return String(token).replaceAll("~", "~0").replaceAll("/", "~1");
}

describe("escapePointerToken", () => {
  it("escapes the tilde before the slash, as RFC 6901 says", () => {
    expect(escapePointerToken("a/b")).toBe("a~1b");
    expect(escapePointerToken("a~b")).toBe("a~0b");
    expect(escapePointerToken("~/")).toBe("~0~1");
    expect(escapePointerToken("~1")).toBe("~01");
  });

  it("leaves an index and a plain name as they are", () => {
    expect(escapePointerToken(12)).toBe("12");
    expect(escapePointerToken("coordinates")).toBe("coordinates");
    expect(escapePointerToken("")).toBe("");
  });

  it("agrees with the plain escaping for any text and any index", () => {
    void fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.stringMatching(/^[a-z~/]{0,8}$/), fc.nat()),
        (token) => {
          expect(escapePointerToken(token)).toBe(reference(token));
        },
      ),
    );
  });
});

describe("pointer", () => {
  it("appends escaped tokens to a base", () => {
    expect(pointer("/geometry", "coordinates", 0, "a/b")).toBe(
      "/geometry/coordinates/0/a~1b",
    );
    expect(pointer("")).toBe("");
  });
});
