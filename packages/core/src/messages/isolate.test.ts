// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FIRST_STRONG_ISOLATE, isolate, POP_ISOLATE } from "./isolate";

describe("isolate", () => {
  it("wraps text in a first-strong isolate and its terminator", () => {
    expect(isolate("-26.2, 28.0")).toBe(
      `${FIRST_STRONG_ISOLATE}-26.2, 28.0${POP_ISOLATE}`,
    );
    expect(FIRST_STRONG_ISOLATE).toBe("⁨");
    expect(POP_ISOLATE).toBe("⁩");
  });

  it("leaves empty text alone", () => {
    expect(isolate("")).toBe("");
  });
});
